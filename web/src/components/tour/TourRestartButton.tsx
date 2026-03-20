'use client'

import { useState } from 'react'
import { HelpCircle } from 'lucide-react'

interface TourRestartButtonProps {
  portal: 'homes' | 'capital' | 'clientes'
  onRestart: () => void
}

export default function TourRestartButton({ portal, onRestart }: TourRestartButtonProps) {
  const [hover, setHover] = useState(false)

  return (
    <button
      onClick={onRestart}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="fixed bottom-6 left-6 z-50 flex items-center gap-2 rounded-full shadow-lg transition-all duration-200"
      style={{
        backgroundColor: hover ? '#1e3a5f' : '#ffffff',
        color: hover ? '#ffffff' : '#1e3a5f',
        border: '2px solid #1e3a5f',
        padding: hover ? '10px 20px' : '10px',
      }}
      title="Ver tour de la aplicación"
    >
      <HelpCircle className="w-5 h-5" />
      {hover && <span className="text-sm font-semibold whitespace-nowrap">Ver Tutorial</span>}
    </button>
  )
}
