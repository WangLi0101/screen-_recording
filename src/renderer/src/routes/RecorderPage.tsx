import { useEffect } from 'react'

/**
 * Hidden recorder window. The capture pipeline (recorder.ts) is loaded on mount
 * so the main window never pays for the mp4-muxer chunk.
 */
export default function RecorderPage() {
  useEffect(() => {
    void import('../recorder')
  }, [])

  return null
}