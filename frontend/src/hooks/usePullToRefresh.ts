import { useEffect, useRef, useState } from 'react'

export type PullStatus = 'idle' | 'pulling' | 'refreshing' | 'success'

const DEAD_ZONE = 10
const MAX_PULL = 80
const RESISTANCE = 0.5
const TRIGGER_THRESHOLD = 60
const SUCCESS_HOLD_MS = 1400

/** The iOS pull-to-refresh gesture, attached to the whole page rather than a
 *  scroll container — the dashboard has none, `window`/`document` is what
 *  scrolls (see Dashboard.tsx's bare `<main>`). Listens on `window` rather
 *  than taking an element ref for the same reason.
 *
 *  `disabled` is checked at `touchstart` only: a sheet open behind the page
 *  means a drag here is almost certainly aimed at the sheet, not the page,
 *  and engaging mid-sheet-interaction would be the surprising thing. */
export function usePullToRefresh({
  onRefresh,
  disabled,
}: {
  onRefresh: () => Promise<boolean>
  disabled: boolean
}) {
  const [status, setStatus] = useState<PullStatus>('idle')
  const [pullDistance, setPullDistance] = useState(0)
  const startY = useRef<number | null>(null)
  // The touchend listener is attached once (see the effect below) and must
  // read current values rather than whatever it closed over at attach time —
  // same idiom as useDashboard's sortRef. Mirrored via their own effects,
  // not during render, so a ref write never happens outside an effect or a
  // handler.
  const statusRef = useRef(status)
  useEffect(() => {
    statusRef.current = status
  }, [status])
  const pullDistanceRef = useRef(pullDistance)
  useEffect(() => {
    pullDistanceRef.current = pullDistance
  }, [pullDistance])
  const onRefreshRef = useRef(onRefresh)
  useEffect(() => {
    onRefreshRef.current = onRefresh
  }, [onRefresh])

  useEffect(() => {
    function onTouchStart(e: TouchEvent) {
      if (disabled || window.scrollY > 0 || e.touches.length !== 1) {
        startY.current = null
        return
      }
      startY.current = e.touches[0].clientY
    }

    function onTouchMove(e: TouchEvent) {
      if (startY.current === null) return
      const delta = e.touches[0].clientY - startY.current
      if (delta <= 0) {
        // Scrolling back up past the start point — not a pull.
        startY.current = null
        setStatus('idle')
        setPullDistance(0)
        return
      }
      if (delta < DEAD_ZONE) return
      setStatus('pulling')
      setPullDistance(Math.min((delta - DEAD_ZONE) * RESISTANCE, MAX_PULL))
    }

    async function onTouchEnd() {
      if (startY.current === null) return
      startY.current = null
      if (statusRef.current !== 'pulling') return
      if (pullDistanceRef.current < TRIGGER_THRESHOLD) {
        setStatus('idle')
        setPullDistance(0)
        return
      }
      setStatus('refreshing')
      setPullDistance(MAX_PULL)
      const ok = await onRefreshRef.current()
      if (ok) {
        setStatus('success')
        setTimeout(() => {
          setStatus('idle')
          setPullDistance(0)
        }, SUCCESS_HOLD_MS)
      } else {
        setStatus('idle')
        setPullDistance(0)
      }
    }

    window.addEventListener('touchstart', onTouchStart, { passive: true })
    window.addEventListener('touchmove', onTouchMove, { passive: true })
    window.addEventListener('touchend', onTouchEnd, { passive: true })
    return () => {
      window.removeEventListener('touchstart', onTouchStart)
      window.removeEventListener('touchmove', onTouchMove)
      window.removeEventListener('touchend', onTouchEnd)
    }
  }, [disabled])

  return { status, pullDistance }
}
