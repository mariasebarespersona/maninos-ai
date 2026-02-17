'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

interface UseInViewOptions {
  threshold?: number
  rootMargin?: string
  triggerOnce?: boolean
}

/**
 * Hook for scroll-triggered animations via Intersection Observer.
 * Returns a ref to attach and a boolean indicating visibility.
 */
export function useInView<T extends HTMLElement = HTMLDivElement>({
  threshold = 0.15,
  rootMargin = '0px 0px -60px 0px',
  triggerOnce = true,
}: UseInViewOptions = {}) {
  const ref = useRef<T | null>(null)
  const [isInView, setIsInView] = useState(false)

  useEffect(() => {
    const el = ref.current
    if (!el) return

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true)
          if (triggerOnce) observer.unobserve(el)
        } else if (!triggerOnce) {
          setIsInView(false)
        }
      },
      { threshold, rootMargin }
    )

    observer.observe(el)
    return () => observer.disconnect()
  }, [threshold, rootMargin, triggerOnce])

  return { ref, isInView }
}

/**
 * Hook for staggered scroll reveals on a list of children.
 * Attach the containerRef, and each child gets a delay based on index.
 */
export function useStaggerReveal<T extends HTMLElement = HTMLDivElement>(
  opts: UseInViewOptions = {}
) {
  const { ref, isInView } = useInView<T>(opts)

  const getStaggerStyle = useCallback(
    (index: number) => ({
      opacity: isInView ? 1 : 0,
      transform: isInView ? 'translateY(0)' : 'translateY(40px)',
      transition: `opacity 0.7s cubic-bezier(0.16,1,0.3,1) ${index * 0.1}s, transform 0.7s cubic-bezier(0.16,1,0.3,1) ${index * 0.1}s`,
    }),
    [isInView]
  )

  const getStaggerClass = useCallback(
    (index: number) =>
      isInView ? 'mn-revealed' : 'mn-hidden',
    [isInView]
  )

  return { ref, isInView, getStaggerStyle, getStaggerClass }
}

