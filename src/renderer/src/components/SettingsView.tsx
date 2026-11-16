import { useEffect, useState } from 'react'
import type { AppState, PermissionStatus, Settings } from '@shared/types'
import { cn } from '@renderer/lib/utils'
import { formatBitrate } from '../lib/format'
import { ACCENT_OPTIONS, THEME_OPTIONS } from '../lib/theme'
import { Icon } from './Icon'
import { SegmentedControl } from './segmented-control'
import { Badge } from './ui/badge'
import { Button } from './ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from './ui/select'
import { Slider } from './ui/slider'
import { Switch } from './ui/switch'

interface Props {
  state: AppState
  onSettings: (settings: Settings) => void
  onError: (message: string) => void
}

const BITRATE_OPTIONS = [
  { value: 4_000_000, label: '省空间 · 4 Mbps' },
  { value: 8_000_000, label: '均衡 · 8 Mbps' },
  { value: 16_000_000, label: '高清 · 16 Mbps' }
]

const DEFAULT_MIC = '__default__'

function PermissionPill({ status }: { status: PermissionStatus }) {
  const map: Record<
    PermissionStatus,
    { text: string; variant: 'default' | 'ok' | 'warn'; led: string }
  > = {
    granted: { text: '已授权', variant: 'ok', led: 'bg-ok' },
    denied: { text: '未授权', variant: 'warn', led: 'bg-warn' },
    unknown: { text: '未知（首次录制时询问）', variant: 'default', led: 'bg-outline' },
    'not-applicable': { text: '无需授权', variant: 'ok', led: 'bg-ok' }
  }
  const info = map[status]
  return (
    <Badge variant={info.variant}>
      <span className={cn('size-2 rounded-full', info.led)} />
      {info.text}
    </Badge>
  )
}

export function SettingsView({ state, onSettings, onError }: Props) {
  const { settings } = state
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([])
  const [permissions, setPermissions] = useState(state.permissions)

  useEffect(() => {
    void navigator.mediaDevices
      .enumerateDevices()
      .then((list) => setDevices(list.filter((device) => device.kind === 'audioinput')))
      .catch(() => setDevices([]))
  }, [])

  useEffect(() => {
    void window.api
      .getPermissions()
      .then(setPermissions)
      .catch(() => undefined)
  }, [])

  const patch = async (next: Partial<Settings>): Promise<void> => {
    try {
      const updated = await window.api.updateSettings(next)
      onSettings(updated)
    } catch (error) {
      onError(error instanceof Error ? error.message : String(error))
    }
  }

  const chooseDir = async (): Promise<void> => {
    const dir = await window.api.chooseDirectory()
    if (dir) await patch({ recordingsDir: dir })
  }

  const isMac = state.platform === 'darwin'
  const shortcut = isMac ? '⌘ + ⇧ + R' : 'Ctrl + Alt + R'

  return (
    <>
      <div className="flex min-h-[72px] shrink-0 items-center gap-3 px-7 py-4 max-[980px]:px-5">
        <div className="min-w-0">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.2px]">设置</h1>
          <div className="mt-0.5 text-[13.5px] text-on-surface-variant">
            默认值会应用到下一次录制
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-7 pt-2 pb-8 max-[980px]:px-5">
        <div className="mb-4 rounded-m3-lg bg-surface-container-low px-[18px] py-1">
          <div className="max-w-[760px]">
            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">外观</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  跟随系统会随系统的深色模式自动切换
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SegmentedControl
                  ariaLabel="外观"
                  value={settings.theme}
                  options={THEME_OPTIONS}
                  onChange={(value) => void patch({ theme: value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4 last:border-0">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">主题色</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  用于按钮、选中状态与录制指示
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <div className="flex items-center gap-2.5" role="radiogroup" aria-label="主题色">
                  {ACCENT_OPTIONS.map((option) => {
                    const active = settings.accent.toLowerCase() === option.value
                    return (
                      <button
                        key={option.id}
                        type="button"
                        className={cn(
                          'size-8 rounded-full outline-none transition-transform duration-150 hover:scale-105 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary',
                          active && 'ring-2 ring-primary ring-offset-2 ring-offset-surface-container-low'
                        )}
                        style={{ background: option.value }}
                        title={option.label}
                        aria-label={option.label}
                        aria-checked={active}
                        role="radio"
                        onClick={() => void patch({ accent: option.value })}
                      />
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-m3-lg bg-surface-container-low px-[18px] py-1">
          <div className="max-w-[760px]">
            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">素材保存位置</strong>
                <span
                  className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant"
                  title={settings.recordingsDir}
                >
                  {settings.recordingsDir}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button size="sm" onClick={() => void chooseDir()}>
                  更改…
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => void window.api.openPath(settings.recordingsDir)}
                >
                  <Icon name="folder" size={15} />
                  打开
                </Button>
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">默认帧率</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  60 fps 更流畅，文件也更大
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SegmentedControl
                  ariaLabel="默认帧率"
                  value={settings.fps}
                  options={[30, 60].map((value) => ({ value, label: `${value} fps` }))}
                  onChange={(value) => void patch({ fps: value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">默认画质</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  当前 {formatBitrate(settings.bitrate)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={String(settings.bitrate)}
                  onValueChange={(value) => void patch({ bitrate: Number(value) })}
                >
                  <SelectTrigger aria-label="默认画质" className="w-[190px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {BITRATE_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={String(option.value)}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">默认倒计时</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  开始录制前的准备时间
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <SegmentedControl
                  ariaLabel="默认倒计时"
                  value={settings.countdown}
                  options={[0, 3, 5].map((value) => ({
                    value,
                    label: value === 0 ? '关闭' : `${value} 秒`
                  }))}
                  onChange={(value) => void patch({ countdown: value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">录制系统声音</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  {state.platform === 'win32'
                    ? '通过系统回环捕获扬声器输出'
                    : 'macOS 14.2+ 首次使用时需要授权'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  aria-label="录制系统声音"
                  checked={settings.systemAudio}
                  onCheckedChange={(checked) => void patch({ systemAudio: checked })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">录制麦克风</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  与系统声音自动混合为一条音轨
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Switch
                  aria-label="录制麦克风"
                  checked={settings.microphone}
                  onCheckedChange={(checked) => void patch({ microphone: checked })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">麦克风设备</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  {settings.micDeviceId ? '使用指定设备' : '系统默认设备'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Select
                  value={settings.micDeviceId ?? DEFAULT_MIC}
                  onValueChange={(value) =>
                    void patch({ micDeviceId: value === DEFAULT_MIC ? null : value })
                  }
                >
                  <SelectTrigger aria-label="麦克风设备" className="w-[240px]">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={DEFAULT_MIC}>系统默认</SelectItem>
                    {devices.map((device, index) => (
                      <SelectItem key={device.deviceId} value={device.deviceId}>
                        {device.label || `麦克风 ${index + 1}`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">系统声音音量</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  {settings.systemVolume ?? 100}%（0–200%）
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Slider
                  className="w-[160px]"
                  min={0}
                  max={200}
                  step={5}
                  value={[settings.systemVolume ?? 100]}
                  onValueChange={([value]) => void patch({ systemVolume: value })}
                />
              </div>
            </div>

            <div className="flex items-center gap-6 py-4 last:border-0">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">麦克风音量</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  {settings.micVolume ?? 100}%（0–200%）
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Slider
                  className="w-[160px]"
                  min={0}
                  max={200}
                  step={5}
                  value={[settings.micVolume ?? 100]}
                  onValueChange={([value]) => void patch({ micVolume: value })}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="mb-4 rounded-m3-lg bg-surface-container-low px-[18px] py-1">
          <div className="max-w-[760px]">
            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">屏幕录制权限</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  系统级屏幕采集授权
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PermissionPill status={permissions.screen} />
                {isMac && permissions.screen !== 'granted' && (
                  <Button
                    size="sm"
                    onClick={() => void window.api.openSystemSettings('screen')}
                  >
                    打开设置
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">麦克风权限</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  录制人声需要此权限
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PermissionPill status={permissions.microphone} />
                {isMac && permissions.microphone !== 'granted' && (
                  <Button
                    size="sm"
                    onClick={() => void window.api.openSystemSettings('microphone')}
                  >
                    打开设置
                  </Button>
                )}
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">系统声音</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  {isMac
                    ? 'macOS 14.2+ 需要单独授权屏幕录制'
                    : 'Windows 通过回环采集，无需额外授权'}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <PermissionPill status={permissions.systemAudio} />
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">ffmpeg</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  用于导出时转码与快速定位（faststart）
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge variant={state.ffmpeg ? 'ok' : 'warn'}>
                  <span
                    className={cn('size-2 rounded-full', state.ffmpeg ? 'bg-ok' : 'bg-warn')}
                  />
                  {state.ffmpeg ? '可用' : '未检测到 · 仅支持原样导出'}
                </Badge>
              </div>
            </div>

            <div className="flex items-center gap-6 border-b border-outline-variant/55 py-4">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">全局快捷键</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  有上次的录制来源时立即开始录制，否则打开此窗口
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className="inline-flex h-7 items-center rounded-m3-xs bg-surface-container-high px-2 font-mono text-[11px] font-medium">
                  {shortcut}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-6 py-4 last:border-0">
              <div className="min-w-0 flex-1">
                <strong className="block text-[15px] font-medium text-on-surface">关于</strong>
                <span className="mt-0.5 block truncate text-[12.5px] leading-normal text-on-surface-variant">
                  ScreenRec {state.version} · Electron · 本地优先，无遥测，录制内容不会离开这台设备
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2" />
            </div>
          </div>
        </div>
      </div>
    </>
  )
}