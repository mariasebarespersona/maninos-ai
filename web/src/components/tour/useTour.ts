'use client'

import { useState, useEffect, useCallback } from 'react'
import { CallBackProps, STATUS, EVENTS, ACTIONS } from 'react-joyride'
import { TOUR_STEPS } from './tourSteps'

type Portal = 'homes' | 'capital' | 'clientes'

function getStorageKey(portal: Portal) {
  return `maninos_tour_completed_${portal}`
}

export function useTour(portal: Portal) {
  const [run, setRun] = useState(false)
  const [stepIndex, setStepIndex] = useState(0)

  // Get steps for this portal, filter to only elements that exist in DOM
  const allSteps = TOUR_STEPS[portal] || []
  const [steps, setSteps] = useState(allSteps)

  // Auto-start on first visit (after a delay to let DOM render)
  useEffect(() => {
    const completed = localStorage.getItem(getStorageKey(portal))
    if (!completed) {
      const timer = setTimeout(() => {
        // Filter to only steps whose targets exist in the DOM
        const validSteps = allSteps.filter(step => {
          if (step.target === 'body') return true
          try {
            return !!document.querySelector(step.target as string)
          } catch { return false }
        })
        setSteps(validSteps)
        if (validSteps.length > 0) {
          setRun(true)
        }
      }, 1500)
      return () => clearTimeout(timer)
    }
  }, [portal]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleCallback = useCallback((data: CallBackProps) => {
    const { status, action, type, index } = data

    // Tour finished or skipped
    if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
      setRun(false)
      setStepIndex(0)
      localStorage.setItem(getStorageKey(portal), 'true')
      return
    }

    // Handle step navigation
    if (type === EVENTS.STEP_AFTER) {
      if (action === ACTIONS.NEXT) {
        setStepIndex(index + 1)
      } else if (action === ACTIONS.PREV) {
        setStepIndex(index - 1)
      }
    }

    // Handle close button
    if (action === ACTIONS.CLOSE) {
      setRun(false)
      localStorage.setItem(getStorageKey(portal), 'true')
    }
  }, [portal])

  const restartTour = useCallback(() => {
    localStorage.removeItem(getStorageKey(portal))
    // Re-filter steps
    const validSteps = allSteps.filter(step => {
      if (step.target === 'body') return true
      try {
        return !!document.querySelector(step.target as string)
      } catch { return false }
    })
    setSteps(validSteps)
    setStepIndex(0)
    setRun(true)
  }, [portal, allSteps])

  return { run, steps, stepIndex, handleCallback, restartTour }
}
