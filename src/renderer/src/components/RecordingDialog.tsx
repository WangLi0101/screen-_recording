import { useEffect, useRef, useState } from 'react'
import type { Recording } from '@shared/types'
import { formatBytes, formatDate, formatDuration, mediaUrl } from '../lib/format'
import { Icon } from './Icon'
import { Spinner } from './spinner'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from './ui/dialog'

interface Props {
  recording: Recording
  onClose: () => void
  onExport: () => void
  onChanged: () => void
  onError: (message: string) => void
}

export function RecordingDialog({ recording, onClose, onExport, onChanged, onError }: Props) {
  const [title, setTitle] = useState(recording.title)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [recovering, setRecovering] = useState(false)
  const [version, setVersion] = useState(0)
  const [trimStart, setTrimStart] = useState(0)
  const [trimEnd, setTrimEnd] = useState(0)
  const [trimBusy, setTrimBusy] = useState(false)
  const [confirmTrim, setConfirmTrim] = useState(false)
  const videoRef = useRef<HTMLVideoElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTitle(recording.title)
    setConfirmDelete(false)
  }, [recording.id, recording.title])

  useEffect(() => {
    setTrimStart(0)
    setTrimEnd(Math.max(0, Math.round(recording.durationMs / 100) / 10))
    setConfirmTrim(false)
  }, [recording.id, recording.durationMs])

  const commitTitle = async (): Promise<void> => {
    const next = title.trim()
    if (!next || next === recording.title) {
      setTitle(recording.title)
      return
    }
    try {
      await window.api.renameRecording(recording.id, next)
      onChanged()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  const remove = async (): Promise<void> => {
    if (!confirmDelete) {
      setConfirmDelete(true)
      return
    }
    try {
      await window.api.deleteRecording(recording.id)
      onChanged()
      onClose()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  const recover = async (): Promise<void> => {
    setRecovering(true)
    try {
      await window.api.recoverRecording(recording.id)
      onChanged()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setRecovering(false)
    }
  }

  const applyTrim = async (): Promise<void> => {
    if (!confirmTrim) {
      setConfirmTrim(true)
      return
    }
    const startMs = Math.max(0, Math.round(trimStart * 1000))
    const endMs = Math.round(trimEnd * 1000)
    if (endMs - startMs < 500) {
      setConfirmTrim(false)
      onError('裁剪后的片段至少要 0.5 秒')
      return
    }
    setTrimBusy(true)
    try {
      await window.api.trimRecording(recording.id, startMs, endMs)
      setConfirmTrim(false)
      setVersion((value) => value + 1)
      onChanged()
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setTrimBusy(false)
    }
  }

  const setFromPlayer = (edge: 'start' | 'end'): void => {
    const current = videoRef.current?.currentTime
    if (typeof current !== 'number' || !Number.isFinite(current)) return
    if (edge === 'start') setTrimStart(Math.min(current, Math.max(0, trimEnd - 0.5)))
    else setTrimEnd(Math.max(current, trimStart + 0.5))
  }

  const canPlay = recording.status === 'ready'

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[880px]">
        <DialogTitle className="sr-only">录制详情</DialogTitle>
        <DialogDescription className="sr-only">
          查看、重命名、裁剪或导出这条录制
        </DialogDescription>

        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <input
            ref={inputRef}
            className="-ml-2.5 min-w-0 flex-1 rounded-m3-sm border-0 bg-transparent px-2.5 py-1.5 text-xl font-medium text-on-surface outline-none transition-[background-color,box-shadow] duration-150 hover:bg-state-hover focus:bg-surface-container-highest focus:shadow-[inset_0_0_0_2px_var(--primary)]"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => void commitTitle()}
            onKeyDown={(event) => {
              if (event.key === 'Enter') inputRef.current?.blur()
            }}
            spellCheck={false}
            aria-label="录制标题"
          />
          <span className="shrink-0 text-xs whitespace-nowrap text-on-surface-variant">
            {formatDate(recording.createdAt)}
          </span>
          <div className="flex-1" />
          <Button variant="quiet" size="icon" onClick={onClose} title="关闭">
            <Icon name="close" size={18} />
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto px-6 pt-2 pb-6">
          <div className="overflow-hidden rounded-m3-lg bg-surface-container-high">
            {canPlay ? (
              <video
                key={`${recording.files.video}:${version}`}
                ref={videoRef}
                src={mediaUrl(recording.files.video)}
                controls
                autoPlay
                className="block max-h-[54vh] w-full bg-black"
              />
            ) : (
              <div className="flex flex-col items-center justify-center gap-4 px-5 py-12 text-center">
                <div className="flex size-20 items-center justify-center rounded-[24px] bg-surface-container-highest text-on-surface-variant">
                  <Icon name="warn" size={26} />
                </div>
                <h3 className="text-lg font-medium text-on-surface">这个录制还没有完成</h3>
                <p className="max-w-[380px] text-[13px] leading-relaxed text-on-surface-variant">
                  {recording.error ?? '上次录制中断了，文件仍然保留在磁盘上，可以尝试修复后播放。'}
                </p>
                <Button variant="primary" onClick={() => void recover()} disabled={recovering}>
                  {recovering ? <Spinner /> : <Icon name="check" size={16} />}
                  {recovering ? '正在修复…' : '修复并播放'}
                </Button>
              </div>
            )}
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Badge>
              <Icon name="film" size={13} />
              {recording.video.width > 0
                ? `${recording.video.width}×${recording.video.height}`
                : '未记录'}
            </Badge>
            <Badge>{recording.video.fps} fps</Badge>
            <Badge>{formatDuration(recording.durationMs)}</Badge>
            <Badge>{formatBytes(recording.sizeBytes)}</Badge>
            <Badge>{recording.source.kind === 'window' ? '窗口' : '屏幕'}</Badge>
            {recording.source.crop && (
              <Badge>
                区域 {recording.source.crop.width}×{recording.source.crop.height}
              </Badge>
            )}
            <Badge variant={recording.hasAudio ? 'ok' : 'default'}>
              <span
                className={
                  recording.hasAudio ? 'size-2 rounded-full bg-ok' : 'size-2 rounded-full bg-outline'
                }
              />
              {recording.hasAudio ? '包含音频' : '无音频'}
            </Badge>
            <Badge>{recording.video.codec}</Badge>
          </div>

          {canPlay && (
            <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2.5 rounded-m3-md bg-surface-container p-4">
              <div className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                <Icon name="crop" size={14} />
                裁剪头尾
              </div>
              <label className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                起点
                <input
                  className="h-9 w-[76px] rounded-m3-sm border border-outline-variant bg-surface-container-high px-2.5 text-[13px] tabular-nums text-on-surface outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-[0.38]"
                  type="number"
                  min={0}
                  step={0.1}
                  value={trimStart}
                  onChange={(event) => setTrimStart(Math.max(0, Number(event.target.value) || 0))}
                  disabled={trimBusy}
                />
                秒
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFromPlayer('start')}
                disabled={trimBusy}
              >
                以当前位置设为起点
              </Button>
              <label className="flex items-center gap-1.5 text-[13px] text-on-surface-variant">
                终点
                <input
                  className="h-9 w-[76px] rounded-m3-sm border border-outline-variant bg-surface-container-high px-2.5 text-[13px] tabular-nums text-on-surface outline-none focus-visible:border-primary focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary disabled:opacity-[0.38]"
                  type="number"
                  min={0}
                  step={0.1}
                  value={trimEnd}
                  onChange={(event) => setTrimEnd(Math.max(0, Number(event.target.value) || 0))}
                  disabled={trimBusy}
                />
                秒
              </label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setFromPlayer('end')}
                disabled={trimBusy}
              >
                以当前位置设为终点
              </Button>
              <div className="flex-1" />
              <span className="text-xs text-on-surface-variant">
                裁剪后约 {Math.max(0, trimEnd - trimStart).toFixed(1)} 秒
              </span>
              <Button
                size="sm"
                variant={confirmTrim ? 'danger' : 'default'}
                onClick={() => void applyTrim()}
                disabled={trimBusy}
              >
                {trimBusy ? <Spinner /> : <Icon name="crop" size={14} />}
                {trimBusy ? '裁剪中…' : confirmTrim ? '确认裁剪并覆盖' : '应用裁剪'}
              </Button>
            </div>
          )}
          {recording.error && canPlay && (
            <p className="mt-3 text-xs text-error">{recording.error}</p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 px-6 pt-4 pb-6">
          <Button onClick={() => void window.api.revealRecording(recording.id)}>
            <Icon name="folder" size={18} />
            在文件夹中显示
          </Button>
          <Button variant="danger" onClick={() => void remove()}>
            <Icon name="trash" size={18} />
            {confirmDelete ? '确认删除？' : '删除'}
          </Button>
          <div className="flex-1" />
          <Button variant="primary" onClick={onExport} disabled={!canPlay}>
            <Icon name="download" size={18} />
            导出
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}