import type { Recording } from '@shared/types'
import { formatBytes, formatDate, formatDuration, mediaUrl } from '../lib/format'
import { Icon } from './Icon'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import { Input } from './ui/input'

interface Props {
  items: Recording[]
  query: string
  onQuery: (value: string) => void
  onOpen: (recording: Recording) => void
  onRecord: () => void
  onOpenFolder: () => void
}

export function Library({ items, query, onQuery, onOpen, onRecord, onOpenFolder }: Props) {
  const filtered = items.filter((item) =>
    query.trim() ? item.title.toLowerCase().includes(query.trim().toLowerCase()) : true
  )

  return (
    <>
      <div className="flex min-h-[72px] shrink-0 items-center gap-3 px-7 py-4 max-[980px]:px-5">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.2px]">素材库</h1>
          <div className="mt-0.5 text-[13.5px] text-on-surface-variant">
            {items.length > 0 ? `${items.length} 个录制 · 全部保存在本地` : '所有录制都保存在本地磁盘'}
          </div>
        </div>
        <div className="flex-1" />
        <div className="relative w-[190px] shrink-0">
          <Icon
            name="search"
            size={16}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-on-surface-variant"
          />
          <Input
            className="h-10 rounded-full border-transparent bg-surface-container-high pr-4 pl-10 hover:bg-surface-container-highest focus-visible:border-transparent focus-visible:ring-0"
            placeholder="搜索标题…"
            value={query}
            onChange={(event) => onQuery(event.target.value)}
          />
        </div>
        <Button onClick={onOpenFolder}>
          <Icon name="folder" size={18} />
          打开文件夹
        </Button>
        <Button variant="primary" onClick={onRecord}>
          <Icon name="record" size={18} />
          新建录制
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-2 pb-8 max-[980px]:px-5">
        {filtered.length === 0 ? (
          <div className="flex min-h-[420px] flex-col items-center justify-center gap-4 rounded-m3-lg bg-surface-container-low px-6 py-20 text-center">
            <div className="flex size-20 items-center justify-center rounded-[24px] bg-surface-container-high text-on-surface-variant">
              <Icon name="film" size={28} />
            </div>
            <h3 className="text-lg font-medium text-on-surface">
              {items.length === 0 ? '还没有录制' : '没有匹配的录制'}
            </h3>
            <p className="max-w-[380px] text-[13px] leading-relaxed text-on-surface-variant">
              {items.length === 0
                ? '点击“新建录制”，选择屏幕或窗口，几秒钟即可完成一次本地录制。录制内容不会上传到任何服务器。'
                : '换个关键词试试，或者清空搜索框。'}
            </p>
            {items.length === 0 && (
              <Button variant="primary" className="mt-1" onClick={onRecord}>
                <Icon name="record" size={18} />
                开始第一次录制
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
            {filtered.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => onOpen(item)}
                className="group flex flex-col overflow-hidden rounded-m3-lg bg-surface-container-low text-left outline-none transition-[background-color,box-shadow] duration-200 ease-[var(--ease)] hover:bg-surface-container hover:shadow-elevation-1 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:bg-surface-container-high"
              >
                <div className="relative flex aspect-video items-center justify-center overflow-hidden bg-media-bg">
                  {item.files.thumbnail ? (
                    <img
                      src={mediaUrl(item.files.thumbnail)}
                      alt=""
                      loading="lazy"
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="text-media-placeholder">
                      <Icon name="film" size={26} />
                    </div>
                  )}
                  {item.status !== 'ready' && (
                    <Badge
                      variant={item.status === 'failed' ? 'error' : 'warn'}
                      className="absolute top-2.5 left-2.5"
                    >
                      {item.status === 'recoverable' ? '待修复' : '文件缺失'}
                    </Badge>
                  )}
                  <span className="absolute right-2.5 bottom-2.5 rounded-m3-xs bg-black/70 px-2 py-0.5 text-xs font-medium tabular-nums text-white">
                    {formatDuration(item.durationMs)}
                  </span>
                </div>
                <div className="flex flex-col gap-1 px-4 pt-3 pb-4">
                  <span className="truncate text-[15px] font-medium" title={item.title}>
                    {item.title}
                  </span>
                  <span className="flex items-center gap-1.5 truncate text-xs text-on-surface-variant">
                    <span>{formatDate(item.createdAt)}</span>
                    <span className="text-outline">·</span>
                    <span>{formatBytes(item.sizeBytes)}</span>
                    <span className="text-outline">·</span>
                    <span>{item.source.kind === 'window' ? '窗口' : '屏幕'}</span>
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </>
  )
}