import { useState } from 'react'
import type { ExportProgress, ExportResolution, Recording } from '@shared/types'
import { Icon } from './Icon'
import { SegmentedControl } from './segmented-control'
import { Spinner } from './spinner'
import { Button } from './ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle
} from './ui/dialog'
import { Input } from './ui/input'
import { Progress } from './ui/progress'

interface Props {
  recording: Recording
  progress: ExportProgress | null
  onClose: () => void
  onError: (message: string) => void
}

const RESOLUTIONS: Array<{ value: ExportResolution; label: string; hint: string }> = [
  { value: 'original', label: '原始分辨率', hint: '直接复制，速度最快' },
  { value: '1080p', label: '1080p', hint: '缩放到高度 1080' },
  { value: '720p', label: '720p', hint: '缩放到高度 720' }
]

export function ExportDialog({ recording, progress, onClose, onError }: Props) {
  const [resolution, setResolution] = useState<ExportResolution>('original')
  const [fileName, setFileName] = useState(recording.title)
  const [targetDir, setTargetDir] = useState('')
  const [running, setRunning] = useState(false)
  const [output, setOutput] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const percent = progress && progress.id === recording.id ? progress.percent : 0

  const chooseDir = async (): Promise<void> => {
    try {
      const dir = await window.api.chooseDirectory()
      if (dir) setTargetDir(dir)
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err))
    }
  }

  const run = async (): Promise<void> => {
    setRunning(true)
    setError(null)
    try {
      const result = await window.api.exportRecording({
        id: recording.id,
        targetDir,
        fileName,
        resolution
      })
      setOutput(result.output)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setError(message)
      onError(message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !running && onClose()}>
      <DialogContent
        className="max-w-[480px]"
        onEscapeKeyDown={(event) => running && event.preventDefault()}
        onPointerDownOutside={(event) => running && event.preventDefault()}
      >
        <DialogTitle className="sr-only">导出录制</DialogTitle>
        <DialogDescription className="sr-only">
          选择文件名、保存位置与分辨率后导出录制
        </DialogDescription>

        <div className="flex items-center gap-3 px-6 pt-6 pb-2">
          <h2 className="text-[22px] leading-tight font-medium">导出录制</h2>
          <div className="flex-1" />
          <Button
            variant="quiet"
            size="icon"
            onClick={onClose}
            disabled={running}
            title="关闭"
          >
            <Icon name="close" size={18} />
          </Button>
        </div>

        <div className="min-h-0 overflow-y-auto px-6 pt-2 pb-6">
          {output ? (
            <div className="flex flex-col items-center gap-4 px-1 py-6 text-center">
              <div className="flex size-20 items-center justify-center rounded-[24px] bg-surface-container-highest text-on-surface-variant">
                <Icon name="check" size={26} />
              </div>
              <h3 className="text-lg font-medium">导出完成</h3>
              <p className="max-w-full text-[13px] leading-relaxed break-all text-on-surface-variant">
                {output}
              </p>
              <Button onClick={() => void window.api.openPath(output)}>
                <Icon name="play" size={18} />
                打开文件
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-[120px_1fr] items-center gap-x-4 gap-y-3.5">
              <label className="text-[13px] text-on-surface-variant" htmlFor="export-name">
                文件名
              </label>
              <Input
                id="export-name"
                value={fileName}
                onChange={(event) => setFileName(event.target.value)}
                spellCheck={false}
              />

              <label className="text-[13px] text-on-surface-variant" htmlFor="export-dir">
                保存位置
              </label>
              <div className="flex min-w-0 items-center gap-2">
                <Input
                  id="export-dir"
                  className="min-w-0 flex-1"
                  value={targetDir}
                  placeholder="与素材相同的文件夹"
                  onChange={(event) => setTargetDir(event.target.value)}
                  spellCheck={false}
                />
                <Button size="sm" onClick={() => void chooseDir()} disabled={running}>
                  浏览…
                </Button>
              </div>

              <label className="text-[13px] text-on-surface-variant">分辨率</label>
              <SegmentedControl
                ariaLabel="分辨率"
                className="justify-self-start"
                value={resolution}
                options={RESOLUTIONS}
                onChange={setResolution}
                disabled={running}
              />

              <div />
              <div className="text-xs text-on-surface-variant">
                {RESOLUTIONS.find((item) => item.value === resolution)?.hint}
              </div>
            </div>
          )}

          {running && (
            <div className="mt-4">
              <Progress value={percent} />
              <div className="mt-1.5 text-xs text-on-surface-variant">
                正在导出… {percent}%
              </div>
            </div>
          )}

          {error && <p className="mt-3 text-xs text-error">{error}</p>}
        </div>

        <div className="flex items-center gap-2 px-6 pt-4 pb-6">
          <div className="flex-1" />
          {output ? (
            <Button variant="primary" onClick={onClose}>
              完成
            </Button>
          ) : (
            <>
              {running && (
                <Button
                  variant="ghost"
                  onClick={() => void window.api.cancelExport(recording.id)}
                >
                  取消导出
                </Button>
              )}
              <Button onClick={onClose} disabled={running}>
                关闭
              </Button>
              <Button
                variant="primary"
                onClick={() => void run()}
                disabled={running || !fileName.trim()}
              >
                {running ? <Spinner /> : <Icon name="download" size={18} />}
                {running ? '导出中…' : '开始导出'}
              </Button>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}