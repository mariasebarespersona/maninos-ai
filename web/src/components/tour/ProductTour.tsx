'use client'

import dynamic from 'next/dynamic'
import { useTour } from './useTour'

// Dynamic import to avoid SSR issues with react-joyride
const Joyride = dynamic(() => import('react-joyride'), { ssr: false })

interface ProductTourProps {
  portal: 'homes' | 'capital' | 'clientes'
}

export default function ProductTour({ portal }: ProductTourProps) {
  const { run, steps, stepIndex, handleCallback } = useTour(portal)

  if (!run || steps.length === 0) return null

  return (
    <Joyride
      steps={steps}
      run={run}
      stepIndex={stepIndex}
      callback={handleCallback}
      continuous
      showProgress
      showSkipButton
      scrollToFirstStep
      disableOverlayClose
      spotlightClicks={false}
      locale={{
        back: 'Anterior',
        close: 'Cerrar',
        last: 'Finalizar',
        next: 'Siguiente',
        skip: 'Omitir tour',
      }}
      styles={{
        options: {
          primaryColor: '#1e3a5f',
          zIndex: 10000,
          arrowColor: '#ffffff',
          backgroundColor: '#ffffff',
          textColor: '#2d3748',
        },
        tooltip: {
          borderRadius: '12px',
          padding: '20px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.15)',
        },
        tooltipTitle: {
          fontSize: '16px',
          fontWeight: 700,
          marginBottom: '8px',
        },
        tooltipContent: {
          fontSize: '14px',
          lineHeight: '1.6',
          padding: '8px 0',
        },
        buttonNext: {
          backgroundColor: '#1e3a5f',
          borderRadius: '8px',
          padding: '8px 20px',
          fontSize: '13px',
          fontWeight: 600,
        },
        buttonBack: {
          color: '#718096',
          fontSize: '13px',
          fontWeight: 500,
        },
        buttonSkip: {
          color: '#a0aec0',
          fontSize: '12px',
        },
        spotlight: {
          borderRadius: '8px',
        },
        overlay: {
          backgroundColor: 'rgba(0, 0, 0, 0.5)',
        },
      }}
      floaterProps={{
        disableAnimation: true,
      }}
    />
  )
}
