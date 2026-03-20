'use client'

import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { CallBackProps, STATUS, EVENTS, ACTIONS, Step } from 'react-joyride'
import { TOUR_STEPS, PAGE_TOURS } from './tourSteps'

type Portal = 'homes' | 'capital' | 'clientes'

function getStorageKey(portal: Portal, page?: string) {
  if (page) return `maninos_tour_page_${portal}_${page.replace(/\//g, '_')}`
  return `maninos_tour_completed_${portal}`
}

export function useTour(portal: Portal) {
  const pathname = usePathname()
  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)
  const [steps, setSteps] = useState<Step[]>([])
  const [currentTourKey, setCurrentTourKey] = useState('')

  // Determine which tour to show: main sidebar tour or per-page tour
  useEffect(() => {
    const mainCompleted = localStorage.getItem(getStorageKey(portal))

    // If main tour not completed, show it first
    if (!mainCompleted) {
      const mainSteps = TOUR_STEPS[portal] || []
      const timer = setTimeout(() => {
        const validSteps = mainSteps.filter(step => {
          if (step.target === 'body') return true
          try { return !!document.querySelector(step.target as string) }
          catch { return false }
        })
        if (validSteps.length > 0) {
          setSteps(validSteps)
          setStepIndex(0)
          setCurrentTourKey(getStorageKey(portal))
          setRun(true)
        }
      }, 1500)
      return () => clearTimeout(timer)
    }

    // Main tour done — check for per-page tour
    const pageTours = PAGE_TOURS[portal] || {}
    // Find matching page tour (match by prefix)
    let matchedPage = ''
    let matchedSteps: Step[] = []
    for (const [pagePath, pageSteps] of Object.entries(pageTours)) {
      if (pathname === pagePath || pathname.startsWith(pagePath + '/')) {
        // Use the most specific match
        if (pagePath.length > matchedPage.length) {
          matchedPage = pagePath
          matchedSteps = pageSteps
        }
      }
    }

    if (matchedPage && matchedSteps.length > 0) {
      const pageKey = getStorageKey(portal, matchedPage)
      const pageCompleted = localStorage.getItem(pageKey)
      if (!pageCompleted) {
        const timer = setTimeout(() => {
          const validSteps = matchedSteps.filter(step => {
            if (step.target === 'body') return true
            try { return !!document.querySelector(step.target as string) }
            catch { return false }
          })
          if (validSteps.length > 0) {
            setSteps(validSteps)
            setStepIndex(0)
            setCurrentTourKey(pageKey)
            setRun(true)
          }
        }, 1000)
        return () => clearTimeout(timer)
      }
    }
  }, [portal, pathname])

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, action, type, index } = data

    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      setStepIndex(0)
      if (currentTourKey) localStorage.setItem(currentTourKey, 'true')
      return
    }

    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT) setStepIndex(index + 1)
      else if (action === ACTIONS.PREV) setStepIndex(index - 1)
    }

    if (action === ACTIONS.CLOSE) {
      setRun(false)
      if (currentTourKey) localStorage.setItem(currentTourKey, 'true')
    }
  }, [currentTourKey])

  const restartTour = useCallback(() => {
    // Clear all tour keys for this portal
    localStorage.removeItem(getStorageKey(portal))
    const pageTours = PAGE_TOURS[portal] || {}
    for (const pagePath of Object.keys(pageTours)) {
      localStorage.removeItem(getStorageKey(portal, pagePath))
    }

    // Restart main tour
    const mainSteps = TOUR_STEPS[portal] || []
    const validSteps = mainSteps.filter(step => {
      if (step.target === 'body') return true
      try { return !!document.querySelector(step.target as string) }
      catch { return false }
    })
    setSteps(validSteps)
    setStepIndex(0)
    setCurrentTourKey(getStorageKey(portal))
    setRun(true)
  }, [portal])

  return { run, steps, stepIndex, handleCallback, restartTour }
}
