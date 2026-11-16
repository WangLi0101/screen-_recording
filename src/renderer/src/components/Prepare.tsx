import { useCallback, useEffect, useState } from 'react'
import type { RegionSelection, Settings, SourceInfo } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { formatBitrate } from '../lib/format'
import { Icon } from './Icon'
import { SegmentedControl } from './segmented-control'
import { Button } from './ui/button'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'
import { Tabs, TabsList, TabsTrigger } from './ui/tabs'

interface Props {
  settings: Settings
  busy: boolean
  onStarted: (id: string) => void
  onError: (message: string) => void
  onOpenFolder: () => void
}

const FPS_OPTIONS = [30, 60]
const COUNTDOWN_OPTIONS = [0, 3, 5]
const BITRATE_OPTIONS = [
  { value: 4_000_000, label: '省空间' },
  { value: 8_000_000, label: '均衡' },
  { value: 16_000_000, label: '高清' }
]

export function Prepare({ settings, busy, onStarted, onError, onOpenFolder }: Props) {
  const [sources, setSources] = useState<SourceInfo[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'display' | 'window'>('display')
  const [sourceId, setSourceId] = useState<string | null>(settings.lastSourceId)
  const [region, setRegion] = useState<RegionSelection | null>(null)
  const [fps, setFps] = useState(settings.fps)
  const [bitrate, setBitrate] = useState(settings.bitrate)
  const [systemAudio, setSystemAudio] = useState(settings.systemAudio)
  const [microphone, setMicrophone] = useState(settings.microphone)
  const [countdown, setCountdown] = useState(settings.countdown)
  const [systemVolume, setSystemVolume] = useState(settings.systemVolume ?? 100)
  const [micVolume, setMicVolume] = useState(settings.micVolume ?? 100)
  const [starting, setStarting] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const list = await window.api.listSources()
      setSources(list)
      setSourceId((current) => {
        if (current && list.some((item) => item.id === current)) return current
        const fallback = list.find((item) => item.kind === 'display') ?? list[0]
        return fallback ? fallback.id : null
      })
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setLoading(false)
    }
  }, [onError])

  useEffect(() => {
    void load()
  }, [load])

  const displays = sources.filter((source) => source.kind === 'display')
  const windows = sources.filter((source) => source.kind === 'window')
  const visible = tab === 'display' ? displays : windows

  const selected = region
    ? { id: region.sourceId, name: `${region.sourceName}（区域）`, kind: region.sourceKind }
    : sources.find((source) => source.id === sourceId)

  const pickRegion = async (): Promise<void> => {
    try {
      const selection = await window.api.selectRegion()
      if (selection) {
        setRegion(selection)
        setTab('display')
      }
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  const start = async (): Promise<void> => {
    if (busy || starting) return
    if (!selected) {
      onError('请先选择要录制的屏幕或窗口')
      return
    }
    setStarting(true)
    try {
      await window.api.updateSettings({ fps, bitrate, systemAudio, microphone, countdown, systemVolume, micVolume })
      const { id } = await window.api.startRecording({
        sourceId: selected.id,
        sourceName: selected.name,
        sourceKind: selected.kind,
        crop: region?.crop ?? null,
        fps,
        bitrate,
        systemAudio,
        microphone,
        micDeviceId: settings.micDeviceId,
        systemVolume,
        micVolume,
        countdown
      })
      onStarted(id)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    } finally {
      setStarting(false)
    }
  }

  return (
    <>
      <div className="flex min-h-[72px] shrink-0 items-center gap-3 px-7 py-4 max-[980px]:px-5">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.2px]">新建录制</h1>
          <div className="mt-0.5 text-[13.5px] text-on-surface-variant">
            选择画面来源与声音，录制过程完全在本机完成
          </div>
        </div>
        <div className="flex-1" />
        <Button onClick={onOpenFolder}>
          <Icon name="folder" size={18} />
          打开文件夹
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-2 pb-8 max-[980px]:px-5">
        <div className="mb-4 rounded-m3-lg bg-surface-container-low p-4">
          <div className="mb-3.5 flex flex-wrap items-center gap-2">
            <span className="text-[15px] font-semibold text-on-surface-variant">录制来源</span>
            <div className="flex-1" />
            <Tabs value={tab} onValueChange={(value) => setTab(value as 'display' | 'window')}>
              <TabsList>
                <TabsTrigger value="display">
                  屏幕 {displays.length > 0 ? `(${displays.length})` : ''}
                </TabsTrigger>
                <TabsTrigger value="window">
                  窗口 {windows.length > 0 ? `(${windows.length})` : ''}
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="ghost" size="sm" onClick={() => void load()} disabled={loading}>
              <Icon name="refresh" size={16} />
              刷新
            </Button>
          </div>

          {region && (
            <div className="mb-3.5 flex items-center gap-3 rounded-m3-md bg-primary-container px-4 py-3 text-[13px] font-medium text-on-primary-container">
              <Icon name="crop" size={18} />
              <span>
                已选择区域 {region.crop.width} × {region.crop.height}（{region.sourceName}）
              </span>
              <div className="flex-1" />
              <Button
                variant="quiet"
                size="sm"
                className="text-on-primary-container hover:bg-white/10 hover:text-on-primary-container"
                onClick={() => setRegion(null)}
              >
                取消区域
              </Button>
            </div>
          )}

          <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
            {tab === 'display' && (
              <button
                type="button"
                className={cn(
                  'overflow-hidden rounded-m3-md border bg-surface-container-low text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                  region
                    ? 'border-primary bg-primary-soft ring-1 ring-primary ring-inset'
                    : 'border-outline-variant hover:border-outline hover:bg-surface-container'
                )}
                onClick={() => void pickRegion()}
                title="拖动鼠标框选屏幕的一部分"
              >
                <div className="flex aspect-video items-center justify-center bg-media-bg text-media-placeholder">
                  <Icon name="crop" size={24} />
                </div>
                <div className="truncate px-3 py-2.5 text-[13.5px]">
                  自定义区域
                  <small className="ml-1.5 text-[11px] text-on-surface-variant">框选</small>
                </div>
              </button>
            )}

            {loading && visible.length === 0 && (
              <div className="p-3 text-[13px] text-on-surface-variant">正在读取可录制的内容…</div>
            )}

            {!loading && visible.length === 0 && (
              <div className="p-3 text-[13px] text-on-surface-variant">
                {tab === 'window' ? '没有可录制的窗口，试试切换到“屏幕”。' : '没有检测到可录制的屏幕。'}
              </div>
            )}

            {visible.map((source) => {
              const active = !region && sourceId === source.id
              return (
                <button
                  key={source.id}
                  type="button"
                  className={cn(
                    'overflow-hidden rounded-m3-md border bg-surface-container-low text-left outline-none transition-[background-color,border-color,box-shadow] duration-200 ease-[var(--ease)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary',
                    active
                      ? 'border-primary bg-primary-soft ring-1 ring-primary ring-inset'
                      : 'border-outline-variant hover:border-outline hover:bg-surface-container'
                  )}
                  onClick={() => {
                    setRegion(null)
                    setSourceId(source.id)
                  }}
                >
                  <div className="flex aspect-video items-center justify-center overflow-hidden bg-media-bg text-media-placeholder">
                    {source.thumbnail ? (
                      <img
                        src={source.thumbnail}
                        alt=""
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Icon name="film" size={22} />
                    )}
                  </div>
                  <div className="truncate px-3 py-2.5 text-[13.5px]" title={source.name}>
                    {source.name}
                    <small className="ml-1.5 text-[11px] text-on-surface-variant">
                      {source.kind === 'display' ? '屏幕' : '窗口'}
                    </small>
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-m3-lg bg-surface-container-low">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-4 px-6 py-5">
            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold tracking-[0.2px] text-on-surface-variant">
                帧率
              </label>
              <SegmentedControl
                ariaLabel="帧率"
                value={fps}
                options={FPS_OPTIONS.map((value) => ({ value, label: `${value} fps` }))}
                onChange={setFps}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold tracking-[0.2px] text-on-surface-variant">
                画质（{formatBitrate(bitrate)}）
              </label>
              <SegmentedControl
                ariaLabel="画质"
                value={bitrate}
                options={BITRATE_OPTIONS}
                onChange={setBitrate}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold tracking-[0.2px] text-on-surface-variant">
                倒计时
              </label>
              <SegmentedControl
                ariaLabel="倒计时"
                value={countdown}
                options={COUNTDOWN_OPTIONS.map((value) => ({
                  value,
                  label: value === 0 ? '关闭' : `${value} 秒`
                }))}
                onChange={setCountdown}
              />
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold tracking-[0.2px] text-on-surface-variant">
                声音
              </label>
              <div className="flex h-8 items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="prepare-system-audio"
                    checked={systemAudio}
                    onCheckedChange={setSystemAudio}
                  />
                  <label htmlFor="prepare-system-audio" className="cursor-pointer text-sm">
                    系统声音
                  </label>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    id="prepare-microphone"
                    checked={microphone}
                    onCheckedChange={setMicrophone}
                  />
                  <label htmlFor="prepare-microphone" className="cursor-pointer text-sm">
                    麦克风
                  </label>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <label className="text-[12.5px] font-semibold tracking-[0.2px] text-on-surface-variant">
                音量
              </label>
              <div className="flex flex-col gap-1.5">
                <div className="flex h-6 items-center gap-2.5">
                  <span className="w-11 text-xs text-on-surface-variant">系统</span>
                  <Slider
                    className="w-[140px]"
                    min={0}
                    max={200}
                    step={5}
                    value={[systemVolume]}
                    disabled={!systemAudio}
                    onValueChange={([value]) => setSystemVolume(value)}
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-on-surface-variant">
                    {systemVolume}%
                  </span>
                </div>
                <div className="flex h-6 items-center gap-2.5">
                  <span className="w-11 text-xs text-on-surface-variant">麦克风</span>
                  <Slider
                    className="w-[140px]"
                    min={0}
                    max={200}
                    step={5}
                    value={[micVolume]}
                    disabled={!microphone}
                    onValueChange={([value]) => setMicVolume(value)}
                  />
                  <span className="w-10 text-right text-xs tabular-nums text-on-surface-variant">
                    {micVolume}%
                  </span>
                </div>
              </div>
            </div>

            <div className="flex-1" />

            <Button
              size="lg"
              variant="primary"
              onClick={() => void start()}
              disabled={busy || starting || !selected}
            >
              <span className="size-3 rounded-full bg-on-primary" />
              {busy
                ? '正在录制…'
                : starting
                  ? '准备中…'
                  : countdown > 0
                    ? `开始录制（${countdown} 秒后）`
                    : '开始录制'}
            </Button>
          </div>
          <div className="px-[18px] pb-4 text-xs leading-relaxed text-on-surface-variant">
            录制时主窗口会自动隐藏，屏幕顶部会出现控制条，可随时暂停、静音或停止。
            {!systemAudio && ' 系统声音已关闭。'}
            {region ? ' 当前仅录制所选区域。' : ''}
          </div>
        </div>
      </div>
    </>
  )
}