import './tailwind.css'
import type { RegionInitInfo } from '@shared/types'
import { paintAccent } from './lib/theme'

void window.api
  .getState()
  .then((state) => paintAccent(state.settings.accent))
  .catch(() => undefined)

const stage = document.getElementById('stage')!
const selection = document.getElementById('selection') as HTMLDivElement
const label = document.getElementById('label') as HTMLDivElement
const tip = document.getElementById('tip') as HTMLDivElement

let info: RegionInitInfo | null = null
let startX = 0
let startY = 0
let dragging = false
let moved = false

function draw(x: number, y: number, width: number, height: number): void {
  selection.hidden = false
  selection.style.left = `${x}px`
  selection.style.top = `${y}px`
  selection.style.width = `${Math.max(1, width)}px`
  selection.style.height = `${Math.max(1, height)}px`

  const flipLabel = y < 34
  label.style.top = flipLabel ? '4px' : '-28px'
  label.style.left = flipLabel ? '4px' : '-1px'

  const scale = info?.scaleFactor ?? 1
  const pxWidth = Math.round(width * scale)
  const pxHeight = Math.round(height * scale)
  label.textContent = `${pxWidth} × ${pxHeight}`
}

stage.addEventListener('mousedown', (event) => {
  if (event.button !== 0) return
  dragging = true
  moved = false
  startX = event.clientX
  startY = event.clientY
  draw(startX, startY, 0, 0)
  tip.hidden = true
})

stage.addEventListener('mousemove', (event) => {
  if (!dragging) return
  const x = Math.min(startX, event.clientX)
  const y = Math.min(startY, event.clientY)
  const width = Math.abs(event.clientX - startX)
  const height = Math.abs(event.clientY - startY)
  if (width > 3 || height > 3) moved = true
  draw(x, y, width, height)
})

stage.addEventListener('mouseup', (event) => {
  if (!dragging) return
  dragging = false
  const x = Math.min(startX, event.clientX)
  const y = Math.min(startY, event.clientY)
  const width = Math.abs(event.clientX - startX)
  const height = Math.abs(event.clientY - startY)

  if (!moved || width < 8 || height < 8) {
    selection.hidden = true
    tip.hidden = false
    return
  }

  window.region.finish({ x, y, width, height })
})

window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault()
    window.region.cancel()
  }
})

window.addEventListener('contextmenu', (event) => {
  event.preventDefault()
  window.region.cancel()
})

window.region.onInit((next) => {
  info = next
})

// The overlay may receive focus after init; make sure Esc still works.
window.focus()