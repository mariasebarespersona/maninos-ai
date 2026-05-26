'use client'

import { useEffect } from 'react'

/**
 * Prevents the mouse wheel from changing the value of focused
 * <input type="number"> elements.
 *
 * Browsers natively treat wheel events on a focused number input as
 * increment/decrement by `step`. With `step={0.01}` this silently shaves
 * cents off purchase prices and payment amounts whenever an employee
 * scrolls the page with a money field still focused. We attach a single
 * capture-phase listener at the document root that blurs any focused
 * number input before the browser applies the default behavior — the
 * page still scrolls, the value stays put.
 */
export default function NumberInputWheelGuard() {
  useEffect(() => {
    const onWheel = (e: WheelEvent) => {
      const active = document.activeElement as HTMLInputElement | null
      if (
        active &&
        active.tagName === 'INPUT' &&
        (active.type === 'number' || active.getAttribute('type') === 'number') &&
        active === e.target
      ) {
        active.blur()
      }
    }
    document.addEventListener('wheel', onWheel, { capture: true, passive: true })
    return () => document.removeEventListener('wheel', onWheel, { capture: true } as any)
  }, [])
  return null
}
