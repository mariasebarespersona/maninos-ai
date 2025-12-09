import React from 'react'
import { Property } from '@/types'

interface PropertyHeaderProps {
  property: Property | null
  onReload?: () => void
  showDocsToggle?: boolean
  onToggleDocs?: () => void
  docsCount?: number
}

export function PropertyHeader({ property, onReload, showDocsToggle, onToggleDocs, docsCount }: PropertyHeaderProps) {
  // Early return if no property
  if (!property) {
    return (
      <div className="maninos-card p-4">
        <p className="text-sm text-[color:var(--text-tertiary)]">
          No hay propiedad activa. Comienza diciendo "Quiero evaluar una nueva mobile home".
        </p>
      </div>
    )
  }
  
  // Calculate acquisition status
  const marketValue = property.market_value || 0
  const askingPrice = property.asking_price || 0
  const arv = property.arv || 0
  const repairCosts = property.repair_estimate || 0
  const totalInvestment = askingPrice + repairCosts
  
  // 70% Rule
  const maxOffer70 = marketValue * 0.70
  const passes70 = askingPrice <= maxOffer70
  
  // 80% Rule
  const maxInvestment80 = arv * 0.80
  const passes80 = totalInvestment <= maxInvestment80
  
  // Status Logic
  const titleStatus = property.title_status || null
  const isCleanTitle = titleStatus === 'Clean/Blue'
  const hasTitle = titleStatus !== null
  
  return (
    <div className="maninos-card px-4 py-3 mb-2 bg-[color:var(--brand-50)] border-[color:var(--brand-200)] animate-fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        
        {/* Left: Property Identity */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-xl shadow-sm border border-[color:var(--brand-100)]">
            🏠
          </div>
          <div>
            <h2 className="font-sans font-bold text-[color:var(--brand-900)] text-lg leading-tight">
              {property.name}
            </h2>
            <div className="text-xs text-[color:var(--text-secondary)] flex items-center gap-2">
              <span>📍 {property.address}</span>
              {property.park_name && (
                <span className="bg-white px-1.5 rounded border border-[color:var(--border-subtle)]">
                  🏞️ {property.park_name}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Center: Key Metrics (Compact) */}
        <div className="flex flex-wrap gap-3 text-xs">
          {/* Title Badge - Only show if inspection done */}
          {hasTitle && (
            <div className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
              isCleanTitle 
                ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                : 'bg-red-50 border-red-200 text-red-800'
            }`}>
              <span>{isCleanTitle ? '✅' : '⚠️'}</span>
              <span className="font-medium">Title: {titleStatus}</span>
            </div>
          )}

          {/* 70% Rule Badge */}
          {marketValue > 0 && (
            <div className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
              passes70 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span>70% Rule:</span>
              <span className="font-bold">{passes70 ? 'PASS' : 'FAIL'}</span>
              <span className="opacity-70">(${askingPrice.toLocaleString()} vs ${maxOffer70.toLocaleString()})</span>
            </div>
          )}

          {/* 80% Rule Badge */}
          {arv > 0 && (
            <div className={`px-2 py-1 rounded-md border flex items-center gap-1 ${
              passes80 ? 'bg-blue-50 border-blue-200 text-blue-800' : 'bg-amber-50 border-amber-200 text-amber-800'
            }`}>
              <span>80% ARV:</span>
              <span className="font-bold">{passes80 ? 'PASS' : 'FAIL'}</span>
              <span className="opacity-70">(${totalInvestment.toLocaleString()} vs ${maxInvestment80.toLocaleString()})</span>
            </div>
          )}
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-2">
          {docsCount !== undefined && docsCount > 0 && (
            <button
              onClick={onToggleDocs}
              className="text-xs text-[color:var(--text-tertiary)] bg-white hover:bg-[color:var(--slate-100)] border border-[color:var(--border-subtle)] px-2 py-1 rounded-full transition-colors cursor-pointer shadow-sm"
            >
              📄 {docsCount} Docs {showDocsToggle ? '▼' : '▶'}
            </button>
          )}
          {onReload && (
            <button 
              onClick={onReload}
              className="text-xs px-2 py-1 rounded bg-white hover:bg-[color:var(--slate-100)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] transition-colors shadow-sm"
              title="Recargar datos"
            >
              ↻
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

