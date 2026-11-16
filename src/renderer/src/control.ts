import './tailwind.css'
import type { RecordingState } from '@shared/types'
import { formatClock } from './lib/format'
import { applyAppearance, applyStoredAppearance } from './lib/theme'

applyStoredAppearance()
void window.api
  .getState()
  .then((state) => applyAppearance(state.settings.theme, state.settings.accent))
  .catch(() => undefined)

const dot = document.querySelector<HTMLSpanElement>('.dot')!
const timeEl = document.getElementById('time')!
const hintEl = document.getElementById('hint')!
const pauseBtn = document.getElementById('pause') as HTMLButtonElement
const pauseIcon = document.getElementById('pause-icon')!
const muteBtn = document.getElementById('mute') as HTMLButtonElement
const muteIcon = document.getElementById('mute-icon')!
const stopBtn = document.getElementById('stop') as HTMLButtonElement
const cancelBtn = document.getElementById('cancel') as HTMLButtonElement

const LOUD =
  'M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2-3.74v7.48A4.5 4.5 0 0 0 16.5 12z'
const MUTED =
  'M4 9v6h4l5 4V5L8 9H4zm12.2 1.4L14.8 12l1.4 1.6-1 1-1.5-1.6-1.5 1.6-1-1 1.5-1.6-1.5-1.6 1-1 1.5 1.6 1.5-1.6z'

let state: RecordingState | null = null
let cancelArmed = false
let cancelTimer: number | null = null

function render(): void {
  const phase = state?.phase ?? 'idle'
  const elapsed = state?.elapsedMs ?? 0
  const countdown = state?.countdownRemainingMs ?? 0

  timeEl.textContent =
    phase === 'countdown' && countdown > 0 ? formatClock(Math.ceil(countdown / 1000) * 1000) : formatClock(elapsed)

  switch (phase) {
    case 'countdown':
      hintEl.textContent = `倒计时 ${Math.max(1, Math.ceil(countdown / 1000))} 秒`
      dot.dataset.state = 'paused'
      break
    case 'preparing':
      hintEl.textContent = '正在连接画面…'
      dot.dataset.state = 'paused'
      break
    case 'recording':
      hintEl.textContent = '录制中'
      dot.dataset.state = 'recording'
      break
    case 'paused':
      hintEl.textContent = '已暂停'
      dot.dataset.state = 'paused'
      break
    case 'stopping':
      hintEl.textContent = '正在保存…'
      dot.dataset.state = 'paused'
      break
    default:
      hintEl.textContent = '准备中…'
      dot.dataset.state = 'idle'
      break
  }

  const paused = phase === 'paused'
  pauseIcon.setAttribute('d', paused ? 'M8 5v14l11-7z' : 'M8 5h3v14H8zM13 5h3v14h-3z')
  pauseBtn.title = paused ? '继续录制' : '暂停录制'
  pauseBtn.disabled = phase === 'countdown' || phase === 'preparing' || phase === 'stopping'

  const muted = state?.muted ?? false
  muteIcon.setAttribute('d', muted ? MUTED : LOUD)
  muteBtn.title = muted ? '取消静音' : '静音'
  muteBtn.style.opacity = muted ? '0.5' : '1'

  stopBtn.disabled = phase === 'stopping'
  cancelBtn.disabled = phase === 'stopping'
}

function action(next: 'pause' | 'resume' | 'stop' | 'mute' | 'cancel'): void {
  window.control.action(next)
}

pauseBtn.addEventListener('click', () => {
  if (!state) return
  action(state.phase === 'paused' ? 'resume' : 'pause')
})

muteBtn.addEventListener('click', () => {
  action('mute')
})

stopBtn.addEventListener('click', () => {
  action('stop')
})

cancelBtn.addEventListener('click', () => {
  if (!cancelArmed) {
    cancelArmed = true
    hintEl.textContent = '再点一次放弃录制'
    if (cancelTimer) window.clearTimeout(cancelTimer)
    cancelTimer = window.setTimeout(() => {
      cancelArmed = false
      render()
    }, 3000)
    return
  }
  if (cancelTimer) window.clearTimeout(cancelTimer)
  action('cancel')
})

window.control.onState((next) => {
  state = next
  if (next.phase !== 'countdown' && next.phase !== 'recording' && next.phase !== 'paused') {
    cancelArmed = false
  }
  render()
})

window.api
  .getRecordingState()
  .then((current) => {
    state = current
    render()
  })
  .catch(() => render())

render()