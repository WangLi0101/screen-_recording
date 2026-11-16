import { promises as fsp } from 'node:fs'
import { dirname, extname, join } from 'node:path'
import type { ExportRequest, Recording } from '../shared/types'
import { emitEvent } from './events'
import { runExport, runTrim, readMp4DurationMs } from './ffmpeg'
import { getRecording, updateRecording } from './library'
import { sanitizeFileName, uniquePath } from './util'

export async function exportRecording(req: ExportRequest): Promise<{ output: string }> {
  const recording = getRecording(req.id)
  if (!recording) throw new Error('素材不存在')
  if (recording.status === 'recoverable') throw new Error('请先恢复该录制再导出')

  const targetDir = req.targetDir || dirname(recording.files.video)
  await fsp.mkdir(targetDir, { recursive: true })

  const base = sanitizeFileName(req.fileName) || sanitizeFileName(recording.title) || 'recording'
  const output = await uniquePath(join(targetDir, `${base}.mp4`))

  emitEvent({ type: 'export-progress', progress: { id: recording.id, percent: 0, state: 'running' } })

  try {
    await runExport(
      {
        jobId: recording.id,
        input: recording.files.video,
        output,
        resolution: req.resolution,
        durationMs: recording.durationMs
      },
      (percent) => {
        emitEvent({
          type: 'export-progress',
          progress: { id: recording.id, percent, state: 'running' }
        })
      }
    )

    emitEvent({
      type: 'export-progress',
      progress: { id: recording.id, percent: 100, state: 'done', output }
    })
    return { output }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    emitEvent({
      type: 'export-progress',
      progress: { id: recording.id, percent: 0, state: 'error', message }
    })
    throw new Error(message)
  }
}

/**
 * Trim the head/tail of a finished recording in place (no re-encode).
 * The original file is kept as a temporary backup until the new file is in place.
 */
export async function trimRecording(id: string, startMs: number, endMs: number): Promise<Recording> {
  const recording = getRecording(id)
  if (!recording) throw new Error('素材不存在')
  if (recording.status !== 'ready') throw new Error('请先恢复该录制再裁剪')

  const start = Math.max(0, Math.round(startMs))
  const end = Math.round(endMs)
  if (!Number.isFinite(start) || !Number.isFinite(end) || end - start < 500) {
    throw new Error('裁剪后的片段至少要 0.5 秒')
  }
  if (recording.durationMs > 0 && start >= recording.durationMs) {
    throw new Error('起点超出了录制时长')
  }

  const source = recording.files.video
  const dir = dirname(source)
  const ext = extname(source) || '.mp4'
  const temp = join(dir, `recording.trim${ext}`)
  const backup = join(dir, `recording.original${ext}`)

  emitEvent({ type: 'export-progress', progress: { id, percent: 0, state: 'running' } })

  let durationMs = 0
  try {
    const reported = await runTrim(
      { jobId: `trim-${id}`, input: source, output: temp, startMs: start, endMs: end },
      (percent) => {
        emitEvent({ type: 'export-progress', progress: { id, percent, state: 'running' } })
      }
    )
    // Stream copy snaps to keyframes, so trust the produced file over the seek math.
    durationMs = (await readMp4DurationMs(temp)) ?? reported

    await fsp.rm(backup, { force: true }).catch(() => undefined)
    await fsp.rename(source, backup)
    try {
      await fsp.rename(temp, source)
    } catch (error) {
      // Put the original back if the swap failed.
      await fsp.rename(backup, source).catch(() => undefined)
      throw error
    }
    await fsp.rm(backup, { force: true }).catch(() => undefined)
  } catch (error) {
    await fsp.rm(temp, { force: true }).catch(() => undefined)
    const message = error instanceof Error ? error.message : String(error)
    emitEvent({
      type: 'export-progress',
      progress: { id, percent: 0, state: 'error', message }
    })
    throw new Error(message)
  }

  const stat = await fsp.stat(source)
  const updated = await updateRecording(id, {
    durationMs: Math.max(0, durationMs),
    sizeBytes: stat.size
  })

  emitEvent({ type: 'export-progress', progress: { id, percent: 100, state: 'done' } })
  emitEvent({ type: 'toast', message: '裁剪完成', tone: 'info' })

  return updated ?? recording
}