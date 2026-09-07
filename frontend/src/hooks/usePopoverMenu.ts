import { useEffect, useRef, useState } from 'react'

/** Open state plus the outside-click/Escape dismissal every popover menu in
 *  this app needs — first written for AccountMenu, now shared with
 *  AddTransactionMenu rather than copied. Both listeners exist only while
 *  `open` is true, matching the "no listener while closed" shape used
 *  elsewhere; Escape returns focus to the trigger rather than dropping it. */
export function usePopoverMenu<TContainer extends HTMLElement, TTrigger extends HTMLElement>() {
  const [open, setOpen] = useState(false)
  const containerRef = useRef<TContainer>(null)
  const triggerRef = useRef<TTrigger>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false)
        triggerRef.current?.focus()
      }
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return { open, setOpen, containerRef, triggerRef }
}
