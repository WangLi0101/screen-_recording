import { useEffect } from 'react'

/**
 * Floating recording control bar (control window).
 * The markup lives in React; the imperative IPC wiring stays in control.ts and
 * is imported only once the DOM is mounted.
 */
export default function ControlPage() {
  useEffect(() => {
    void import('../control')
  }, [])

  return (
    <div
      id="bar"
      className="drag m-2 flex h-14 select-none items-center gap-2 rounded-[28px] bg-surface-container-high py-0 pr-2 pl-[18px] text-sm text-on-surface shadow-elevation-3"
    >
      <span
        className="dot size-2.5 shrink-0 animate-pulse-ring rounded-full bg-primary data-[state=idle]:animate-none data-[state=idle]:bg-outline data-[state=paused]:animate-none data-[state=paused]:bg-warn"
        data-state="idle"
      />
      <span id="time" className="min-w-[52px] text-[15px] font-medium tracking-[0.4px] tabular-nums">
        00:00
      </span>
      <span id="hint" className="max-w-[124px] truncate text-xs text-on-surface-variant">
        准备中…
      </span>
      <span className="mx-1 ml-auto h-5 w-px bg-outline-variant" />
      <button
        id="pause"
        type="button"
        className="no-drag inline-flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface outline-none transition-[background-color,color,transform] duration-150 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.92] disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:size-5 [&_svg]:fill-current"
        title="暂停 / 继续"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path id="pause-icon" d="M8 5h3v14H8zM13 5h3v14h-3z" />
        </svg>
      </button>
      <button
        id="mute"
        type="button"
        className="no-drag inline-flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface outline-none transition-[background-color,color,transform] duration-150 hover:bg-state-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.92] disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:size-5 [&_svg]:fill-current"
        title="静音"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path
            id="mute-icon"
            d="M4 9v6h4l5 4V5L8 9H4zm12.5 3a4.5 4.5 0 0 0-2-3.74v7.48A4.5 4.5 0 0 0 16.5 12z"
          />
        </svg>
      </button>
      <button
        id="stop"
        type="button"
        className="no-drag inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary outline-none transition-[background-color,color,transform] duration-150 hover:bg-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.92] disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:size-5 [&_svg]:fill-current"
        title="停止并保存"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      </button>
      <button
        id="cancel"
        type="button"
        className="no-drag inline-flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant outline-none transition-[background-color,color,transform] duration-150 hover:bg-error-veil hover:text-error focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.92] disabled:pointer-events-none disabled:opacity-[0.38] [&_svg]:size-5 [&_svg]:fill-current"
        title="取消录制"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12 19 6.4 17.6 5 12 10.6 6.4 5z" />
        </svg>
      </button>
    </div>
  )
}