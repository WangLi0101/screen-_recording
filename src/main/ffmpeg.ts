import { spawn, execFileSync, type ChildProcess } from 'node:child_process'
import { chmodSync, existsSync, promises as fsp } from 'node:fs'
import { join } from 'node:path'
import { app } from 'electron'
import type { ExportResolution } from '../shared/types'

let cached: string | null | undefined

function binaryName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

/**
 * The binaries are vendored in `resources/ffmpeg/<platform>-<arch>/` and copied
 * next to `app.asar` by electron-builder (`extraResources`), so the app never
 * depends on a system-wide ffmpeg.
 */
function candidates(): string[] {
  const name = binaryName()
  const archDir = `${process.platform}-${process.arch}`
  return [
    // Packaged: resources/ffmpeg/ffmpeg[.exe]
    join(process.resourcesPath, 'ffmpeg', name),
    // Dev: <project>/resources/ffmpeg/<platform>-<arch>/ffmpeg[.exe]
    join(app.getAppPath(), 'resources', 'ffmpeg', archDir, name),
    join(process.cwd(), 'resources', 'ffmpeg', archDir, name)
  ]
}

/** git cannot store the executable bit on a Windows checkout, so fix it up. */
function ensureExecutable(path: string): void {
  if (process.platform === 'win32') return
  try {
    chmodSync(path, 0o755)
  } catch {
    // read-only volume: spawn will surface the real error
  }
}

export function getFfmpegPath(): string | null {
  if (cached !== undefined) return cached
  for (const candidate of candidates()) {
    if (candidate && existsSync(candidate)) {
      ensureExecutable(candidate)
      cached = candidate
      return cached
    }
  }
  try {
    execFileSync(binaryName(), ['-version'], { stdio: 'ignore' })
    cached = binaryName()
  } catch {
    cached = null
  }
  return cached
}

export function hasFfmpeg(): boolean {
  return getFfmpegPath() !== null
}

export async function remuxToFastStart(input: string, output: string): Promise<boolean> {
  const bin = getFfmpegPath()
  if (!bin) return false
  await fsp.rm(output, { force: true }).catch(() => undefined)
  return new Promise<boolean>((resolve) => {
    const child = spawn(
      bin,
      ['-hide_banner', '-loglevel', 'error', '-y', '-i', input, '-c', 'copy', '-movflags', '+faststart', output],
      { windowsHide: true }
    )
    child.on('error', () => resolve(false))
    child.on('close', (code) => resolve(code === 0))
  })
}

/**
 * Read the duration of an MP4 from its `moov/mvhd` box without decoding.
 * Returns null when the box cannot be found (e.g. moov behind a huge file body).
 */
export async function readMp4DurationMs(file: string): Promise<number | null> {
  let handle: import('node:fs/promises').FileHandle | null = null
  try {
    handle = await fsp.open(file, 'r')
    const size = (await handle.stat()).size
    const window = Math.min(size, 4 * 1024 * 1024)
    const buffer = Buffer.alloc(Number(window))
    await handle.read(buffer, 0, buffer.length, 0)

    const index = buffer.indexOf('mvhd')
    if (index < 0 || index + 32 > buffer.length) return null
    const version = buffer[index + 4]
    let timescale: number
    let duration: number
    if (version === 1) {
      if (index + 36 > buffer.length) return null
      timescale = buffer.readUInt32BE(index + 24)
      duration = Number(buffer.readBigUInt64BE(index + 28))
    } else {
      timescale = buffer.readUInt32BE(index + 16)
      duration = buffer.readUInt32BE(index + 20)
    }
    if (!timescale || !Number.isFinite(duration)) return null
    return Math.round((duration / timescale) * 1000)
  } catch {
    return null
  } finally {
    await handle?.close().catch(() => undefined)
  }
}

const jobs = new Map<string, ChildProcess>()

export interface RunExportOptions {
  jobId: string
  input: string
  output: string
  resolution: ExportResolution
  durationMs: number
}

export async function runExport(
  options: RunExportOptions,
  onProgress: (percent: number) => void
): Promise<void> {
  const { jobId, input, output, resolution, durationMs } = options
  const bin = getFfmpegPath()

  await fsp.rm(output, { force: true }).catch(() => undefined)

  if (!bin) {
    if (resolution !== 'original') {
      throw new Error('未检测到 ffmpeg，当前只能按原始分辨率导出')
    }
    await fsp.copyFile(input, output)
    onProgress(100)
    return
  }

  const args = ['-hide_banner', '-y', '-i', input]
  if (resolution !== 'original') {
    args.push(
      '-vf',
      resolution === '1080p' ? 'scale=-2:1080' : 'scale=-2:720',
      '-c:v',
      'libx264',
      '-preset',
      'veryfast',
      '-crf',
      '20',
      '-pix_fmt',
      'yuv420p',
      '-c:a',
      'aac',
      '-b:a',
      '160k'
    )
  } else {
    args.push('-c', 'copy')
  }
  args.push('-movflags', '+faststart', '-progress', 'pipe:1', '-nostats', output)

  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    jobs.set(jobId, child)

    let buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line.trim())
        if (match && durationMs > 0) {
          const percent = Math.min(99, Math.round((Number(match[1]) / 1000 / durationMs) * 100))
          onProgress(percent)
        }
      }
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })

    child.on('error', (error) => {
      jobs.delete(jobId)
      reject(error)
    })
    child.on('close', (code) => {
      jobs.delete(jobId)
      if (code === 0) {
        onProgress(100)
        resolve()
      } else {
        reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg 退出码 ${code}`))
      }
    })
  })
}

export interface RunTrimOptions {
  jobId: string
  input: string
  output: string
  startMs: number
  endMs: number
}

/**
 * Cut a recording down to [startMs, endMs] without re-encoding (keyframe aligned).
 * Returns the duration of the produced file in milliseconds.
 */
export async function runTrim(
  options: RunTrimOptions,
  onProgress: (percent: number) => void
): Promise<number> {
  const { jobId, input, output, startMs, endMs } = options
  const bin = getFfmpegPath()
  if (!bin) throw new Error('未检测到 ffmpeg，无法裁剪')

  const start = Math.max(0, startMs) / 1000
  const span = Math.max(0.1, (endMs - startMs) / 1000)
  await fsp.rm(output, { force: true }).catch(() => undefined)

  const args = [
    '-hide_banner',
    '-y',
    '-ss',
    start.toFixed(3),
    '-i',
    input,
    '-t',
    span.toFixed(3),
    '-c',
    'copy',
    '-avoid_negative_ts',
    'make_zero',
    '-movflags',
    '+faststart',
    '-progress',
    'pipe:1',
    '-nostats',
    output
  ]

  return new Promise<number>((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    jobs.set(jobId, child)

    let maxUs = 0
    let buffer = ''
    child.stdout?.on('data', (chunk: Buffer) => {
      buffer += chunk.toString()
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''
      for (const line of lines) {
        const match = /^out_time_us=(\d+)/.exec(line.trim())
        if (match) {
          const us = Number(match[1])
          if (us > maxUs) {
            maxUs = us
            onProgress(Math.min(99, Math.round((us / 1000 / (span * 1000)) * 100)))
          }
        }
      }
    })

    let stderr = ''
    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = (stderr + chunk.toString()).slice(-4000)
    })

    child.on('error', (error) => {
      jobs.delete(jobId)
      reject(error)
    })
    child.on('close', (code) => {
      jobs.delete(jobId)
      if (code === 0) {
        onProgress(100)
        resolve(maxUs > 0 ? Math.round(maxUs / 1000) : Math.round(span * 1000))
      } else {
        reject(new Error(stderr.trim().split('\n').slice(-2).join(' ') || `ffmpeg 退出码 ${code}`))
      }
    })
  })
}

export function cancelExportJob(jobId: string): void {
  const child = jobs.get(jobId)
  if (!child) return
  jobs.delete(jobId)
  child.kill()
}