import { useEffect } from 'react'

/** Full-screen transparent overlay used to pick a recording region (region window). */
export default function RegionPage() {
  useEffect(() => {
    void import('../region')
  }, [])

  return (
    <div id="stage" className="fixed inset-0 cursor-crosshair bg-black/32 select-none">
      <div
        id="selection"
        hidden
        className="absolute box-border border-2 border-primary shadow-[0_0_0_100vmax_rgba(0,0,0,0.42)]"
      >
        <div
          id="label"
          className="absolute rounded-m3-sm bg-primary px-2.5 py-1 text-xs font-medium whitespace-nowrap text-on-primary tabular-nums shadow-elevation-2"
        />
        <span className="pointer-events-none absolute -top-1.5 -left-1.5 size-2.5 rounded-full border-2 border-primary bg-white" />
        <span className="pointer-events-none absolute -top-1.5 -right-1.5 size-2.5 rounded-full border-2 border-primary bg-white" />
        <span className="pointer-events-none absolute -bottom-1.5 -left-1.5 size-2.5 rounded-full border-2 border-primary bg-white" />
        <span className="pointer-events-none absolute -right-1.5 -bottom-1.5 size-2.5 rounded-full border-2 border-primary bg-white" />
      </div>
      <div
        id="tip"
        className="pointer-events-none fixed top-7 left-1/2 -translate-x-1/2 rounded-m3-sm bg-surface-container-high px-[18px] py-2.5 text-[13px] text-on-surface shadow-elevation-2"
      >
        拖动鼠标框选录制区域 · Esc 取消
      </div>
    </div>
  )
}