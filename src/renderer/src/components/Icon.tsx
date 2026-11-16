import {
  AppWindow,
  Check,
  ChevronDown,
  CircleDot,
  Crop,
  Download,
  Film,
  FolderOpen,
  LayoutList,
  Mic,
  Monitor,
  Pause,
  Play,
  RefreshCw,
  Search,
  Settings2,
  Square,
  Trash,
  TriangleExclamationPoint,
  Volume2,
  X,
  type LucideIcon
} from 'lucide-react'

const icons = {
  library: LayoutList,
  record: CircleDot,
  settings: Settings2,
  folder: FolderOpen,
  film: Film,
  download: Download,
  trash: Trash,
  close: X,
  play: Play,
  refresh: RefreshCw,
  crop: Crop,
  check: Check,
  chevron: ChevronDown,
  warn: TriangleExclamationPoint,
  stop: Square,
  pause: Pause,
  mic: Mic,
  speaker: Volume2,
  monitor: Monitor,
  window: AppWindow,
  search: Search
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof icons

export function Icon({
  name,
  size = 16,
  className
}: {
  name: IconName
  size?: number
  className?: string
}) {
  const Component = icons[name]
  return <Component size={size} strokeWidth={2} className={className} aria-hidden="true" />
}