import type { ThemeMode } from '@shared/types'

export interface AccentOption {
  id: string
  label: string
  value: string
}

export const THEME_OPTIONS: Array<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
  { value: 'system', label: '跟随系统' }
]

export const DEFAULT_THEME: ThemeMode = 'dark'
export const DEFAULT_ACCENT = '#ef4444'

export const ACCENT_OPTIONS: AccentOption[] = [
  { id: 'red', label: '赤红', value: '#ef4444' },
  { id: 'orange', label: '橙色', value: '#f97316' },
  { id: 'green', label: '翠绿', value: '#22c55e' },
  { id: 'cyan', label: '青蓝', value: '#06b6d4' },
  { id: 'blue', label: '蔚蓝', value: '#3b82f6' },
  { id: 'violet', label: '紫罗兰', value: '#8b5cf6' },
  { id: 'pink', label: '桃粉', value: '#ec4899' }
]

const STORAGE_KEY = 'screenrec.appearance'
const HEX = /^#[0-9a-fA-F]{6}$/
const FALLBACK_RGB: [number, number, number] = [239, 68, 68]

function parseHex(hex: string): [number, number, number] | null {
  if (!HEX.test(hex)) return null
  return [
    Number.parseInt(hex.slice(1, 3), 16),
    Number.parseInt(hex.slice(3, 5), 16),
    Number.parseInt(hex.slice(5, 7), 16)
  ]
}

function toHex(rgb: [number, number, number]): string {
  return `#${rgb.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`
}

/** Blend `hex` toward `target` by `weight` (0–1). */
function mix(hex: string, target: string, weight: number): string {
  const base = parseHex(hex) ?? FALLBACK_RGB
  const other = parseHex(target) ?? [255, 255, 255]
  return toHex([
    base[0] + (other[0] - base[0]) * weight,
    base[1] + (other[1] - base[1]) * weight,
    base[2] + (other[2] - base[2]) * weight
  ])
}

function alpha(hex: string, opacity: number): string {
  const [r, g, b] = parseHex(hex) ?? FALLBACK_RGB
  return `rgba(${r}, ${g}, ${b}, ${opacity})`
}

function luminance(hex: string): number {
  const rgb = parseHex(hex) ?? FALLBACK_RGB
  const [r, g, b] = rgb.map((value) => {
    const channel = value / 255
    return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

/** Write the accent-derived custom properties used by every stylesheet. */
export function paintAccent(accent: string): void {
  const color = HEX.test(accent) ? accent : DEFAULT_ACCENT
  const root = document.documentElement.style
  root.setProperty('--accent', color)
  root.setProperty('--accent-hover', mix(color, '#ffffff', 0.16))
  root.setProperty('--accent-strong', mix(color, '#000000', 0.18))
  root.setProperty('--accent-soft', alpha(color, 0.12))
  root.setProperty('--accent-glow', alpha(color, 0.2))
  root.setProperty('--accent-ring', alpha(color, 0.38))
  root.setProperty('--accent-selection', alpha(color, 0.32))
  root.setProperty('--accent-fade', alpha(color, 0))
  root.setProperty('--accent-contrast', luminance(color) > 0.3 ? '#101828' : '#ffffff')
}

export function resolveTheme(theme: ThemeMode): 'light' | 'dark' {
  if (theme === 'system') {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
  }
  return theme
}

function paintTheme(theme: ThemeMode): void {
  document.documentElement.dataset.theme = resolveTheme(theme)
}

/** Apply appearance and mirror it locally so the next window paints without a flash. */
export function applyAppearance(theme: ThemeMode, accent: string): () => void {
  paintAccent(accent)
  paintTheme(theme)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ theme, accent }))
  } catch {
    // Local storage may be unavailable (private mode); theming still works for this run.
  }

  if (theme !== 'system') return () => undefined

  const media = window.matchMedia('(prefers-color-scheme: dark)')
  const onChange = (): void => paintTheme('system')
  media.addEventListener('change', onChange)
  return () => media.removeEventListener('change', onChange)
}

/** Synchronous paint from the cached appearance, before React mounts. */
export function applyStoredAppearance(): void {
  let theme = DEFAULT_THEME
  let accent = DEFAULT_ACCENT
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<{ theme: ThemeMode; accent: string }>
      if (parsed.theme === 'light' || parsed.theme === 'dark' || parsed.theme === 'system') {
        theme = parsed.theme
      }
      if (typeof parsed.accent === 'string' && HEX.test(parsed.accent)) accent = parsed.accent
    }
  } catch {
    // Ignore malformed cache and fall back to defaults.
  }
  paintAccent(accent)
  paintTheme(theme)
}