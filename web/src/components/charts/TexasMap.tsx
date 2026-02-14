'use client'

import React, { useState } from 'react'
import { MapPin } from 'lucide-react'

interface Property {
  id: string
  address: string
  city?: string
  status: string
}

interface TexasMapProps {
  properties: Property[]
}

// Major Texas cities with approximate coordinates (relative to SVG viewBox 0-100)
const TEXAS_CITIES: Record<string, { x: number; y: number; name: string }> = {
  houston: { x: 75, y: 70, name: 'Houston' },
  dallas: { x: 62, y: 28, name: 'Dallas' },
  'san antonio': { x: 48, y: 75, name: 'San Antonio' },
  austin: { x: 52, y: 60, name: 'Austin' },
  'fort worth': { x: 58, y: 30, name: 'Fort Worth' },
  'el paso': { x: 5, y: 55, name: 'El Paso' },
  arlington: { x: 60, y: 32, name: 'Arlington' },
  'corpus christi': { x: 55, y: 90, name: 'Corpus Christi' },
  plano: { x: 64, y: 26, name: 'Plano' },
  laredo: { x: 35, y: 90, name: 'Laredo' },
  lubbock: { x: 30, y: 25, name: 'Lubbock' },
  irving: { x: 61, y: 31, name: 'Irving' },
  garland: { x: 65, y: 28, name: 'Garland' },
  frisco: { x: 63, y: 24, name: 'Frisco' },
  mckinney: { x: 65, y: 23, name: 'McKinney' },
  amarillo: { x: 28, y: 8, name: 'Amarillo' },
  brownsville: { x: 50, y: 98, name: 'Brownsville' },
  'grand prairie': { x: 59, y: 33, name: 'Grand Prairie' },
  killeen: { x: 50, y: 50, name: 'Killeen' },
  pasadena: { x: 77, y: 72, name: 'Pasadena' },
  mesquite: { x: 66, y: 30, name: 'Mesquite' },
  mcallen: { x: 42, y: 96, name: 'McAllen' },
  midland: { x: 22, y: 45, name: 'Midland' },
  denton: { x: 60, y: 22, name: 'Denton' },
  waco: { x: 55, y: 45, name: 'Waco' },
  carrollton: { x: 62, y: 27, name: 'Carrollton' },
  'round rock': { x: 53, y: 58, name: 'Round Rock' },
  abilene: { x: 35, y: 35, name: 'Abilene' },
  pearland: { x: 76, y: 74, name: 'Pearland' },
  richardson: { x: 64, y: 27, name: 'Richardson' },
  'league city': { x: 78, y: 75, name: 'League City' },
  'sugar land': { x: 73, y: 73, name: 'Sugar Land' },
  'the woodlands': { x: 74, y: 62, name: 'The Woodlands' },
  beaumont: { x: 88, y: 65, name: 'Beaumont' },
  odessa: { x: 18, y: 45, name: 'Odessa' },
  conroe: { x: 72, y: 60, name: 'Conroe' },
  texarkana: { x: 80, y: 12, name: 'Texarkana' },
  'royse city': { x: 68, y: 28, name: 'Royse City' },
  tyler: { x: 76, y: 35, name: 'Tyler' },
  temple: { x: 52, y: 48, name: 'Temple' },
}

const STATUS_CONFIG: Record<string, { color: string; label: string; glow: string }> = {
  purchased: { color: '#3b82f6', label: 'Compradas', glow: 'rgba(59,130,246,0.35)' },
  published: { color: '#10b981', label: 'Publicadas', glow: 'rgba(16,185,129,0.35)' },
  renovating: { color: '#f59e0b', label: 'Renovando', glow: 'rgba(245,158,11,0.35)' },
  reserved: { color: '#8b5cf6', label: 'Reservadas', glow: 'rgba(139,92,246,0.35)' },
  sold: { color: '#d4a853', label: 'Vendidas', glow: 'rgba(212,168,83,0.35)' },
}

export default function TexasMap({ properties }: TexasMapProps) {
  const [hoveredCity, setHoveredCity] = useState<string | null>(null)
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 })

  // Group properties by city (lowercase)
  const propertiesByCity = properties.reduce((acc, prop) => {
    const cityKey = (prop.city || 'unknown').toLowerCase().trim()
    if (!acc[cityKey]) acc[cityKey] = []
    acc[cityKey].push(prop)
    return acc
  }, {} as Record<string, Property[]>)

  // Get cities that have properties
  const activeCities = Object.entries(propertiesByCity)
    .filter(([city]) => TEXAS_CITIES[city])
    .map(([city, props]) => ({
      ...TEXAS_CITIES[city],
      key: city,
      properties: props,
      count: props.length,
    }))

  // Get status breakdown for a city
  const getStatusBreakdown = (props: Property[]) => {
    const breakdown: Record<string, number> = {}
    props.forEach((p) => {
      breakdown[p.status] = (breakdown[p.status] || 0) + 1
    })
    return breakdown
  }

  // Get the dominant status color for a city
  const getDominantColor = (props: Property[]): string => {
    const breakdown = getStatusBreakdown(props)
    let maxCount = 0
    let dominant = 'purchased'
    Object.entries(breakdown).forEach(([status, count]) => {
      if (count > maxCount) {
        maxCount = count
        dominant = status
      }
    })
    return STATUS_CONFIG[dominant]?.color || '#6b7280'
  }

  const handleMouseEnter = (city: string, e: React.MouseEvent) => {
    setHoveredCity(city)
    const rect = (e.currentTarget as HTMLElement).closest('svg')?.getBoundingClientRect()
    const circleRect = (e.target as HTMLElement).getBoundingClientRect()
    if (rect) {
      setTooltipPos({ x: circleRect.left + circleRect.width / 2, y: circleRect.top })
    }
  }

  // Count properties by status for the legend
  const statusCounts: Record<string, number> = {}
  properties.forEach((p) => {
    statusCounts[p.status] = (statusCounts[p.status] || 0) + 1
  })

  return (
    <div className="relative">
      {/* Legend */}
      <div
        className="absolute top-2 right-2 rounded-xl p-3 z-10"
        style={{
          background: 'rgba(255,255,255,0.92)',
          backdropFilter: 'blur(8px)',
          boxShadow: '0 4px 20px rgba(0,0,0,0.06)',
          border: '1px solid rgba(0,0,0,0.05)',
        }}
      >
        <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: '#94a3b8' }}>
          Estado
        </p>
        <div className="space-y-1.5">
          {Object.entries(STATUS_CONFIG).map(([status, config]) => {
            const count = statusCounts[status] || 0
            if (count === 0) return null
            return (
              <div key={status} className="flex items-center gap-2 text-xs">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{
                    backgroundColor: config.color,
                    boxShadow: `0 0 6px ${config.glow}`,
                  }}
                />
                <span style={{ color: '#475569' }}>
                  {config.label}
                </span>
                <span className="ml-auto font-semibold" style={{ color: '#1e293b' }}>
                  {count}
                </span>
              </div>
            )
          })}
        </div>
      </div>

      {/* Texas SVG */}
      <svg viewBox="0 0 100 100" className="w-full h-80 md:h-96" style={{ borderRadius: '12px' }}>
        {/* Background gradient */}
        <defs>
          <radialGradient id="mapBg" cx="60%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#f0f9ff" />
            <stop offset="100%" stopColor="#f8fafc" />
          </radialGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="1.5" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <filter id="shadow">
            <feDropShadow dx="0" dy="0.5" stdDeviation="0.8" floodColor="#94a3b8" floodOpacity="0.3" />
          </filter>
          {/* Glow filters per status color */}
          {Object.entries(STATUS_CONFIG).map(([status, config]) => (
            <filter id={`glow-${status}`} key={status}>
              <feGaussianBlur stdDeviation="1.2" result="coloredBlur" />
              <feFlood floodColor={config.color} floodOpacity="0.4" result="glowColor" />
              <feComposite in="glowColor" in2="coloredBlur" operator="in" result="softGlow" />
              <feMerge>
                <feMergeNode in="softGlow" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          ))}
        </defs>

        {/* Background */}
        <rect x="0" y="0" width="100" height="100" fill="url(#mapBg)" />

        {/* Texas outline — filled with a lighter, more modern color */}
        <path
          d="M5,55 L5,35 L15,25 L25,5 L35,5 L45,15 L55,15 L65,5 L75,5 L85,15 L95,25 
             L95,45 L90,55 L90,65 L85,75 L75,80 L65,85 L55,95 L45,100 L35,95 L25,85 
             L20,75 L10,65 Z"
          fill="#e8f4f8"
          stroke="#b8d4e3"
          strokeWidth="0.6"
          filter="url(#shadow)"
        />

        {/* Subtle grid lines */}
        {[20, 40, 60, 80].map((v) => (
          <React.Fragment key={v}>
            <line x1={v} y1="0" x2={v} y2="100" stroke="#e2e8f0" strokeWidth="0.15" strokeDasharray="2 3" />
            <line x1="0" y1={v} x2="100" y2={v} stroke="#e2e8f0" strokeWidth="0.15" strokeDasharray="2 3" />
          </React.Fragment>
        ))}

        {/* Show all major cities as small faded dots */}
        {Object.entries(TEXAS_CITIES)
          .filter(([key]) => !propertiesByCity[key])
          .map(([key, city]) => (
            <circle key={key} cx={city.x} cy={city.y} r="0.7" fill="#cbd5e1" opacity={0.5} />
          ))}

        {/* City markers with properties */}
        {activeCities.map((city) => {
          const dominantColor = getDominantColor(city.properties)
          const breakdown = getStatusBreakdown(city.properties)
          const dominantStatus = Object.entries(breakdown).sort((a, b) => b[1] - a[1])[0]?.[0] || 'purchased'
          const size = Math.min(3.5 + city.count * 0.7, 7)
          const hasMultipleStatuses = Object.keys(breakdown).length > 1

          return (
            <g key={city.key}>
              {/* Outer glow ring */}
              <circle
                cx={city.x}
                cy={city.y}
                r={size + 3}
                fill={dominantColor}
                opacity={0.12}
              />
              <circle
                cx={city.x}
                cy={city.y}
                r={size + 1.5}
                fill={dominantColor}
                opacity={0.2}
              />

              {/* Mini pie chart for multiple statuses */}
              {hasMultipleStatuses ? (
                (() => {
                  const entries = Object.entries(breakdown)
                  const total = entries.reduce((s, [, c]) => s + c, 0)
                  let currentAngle = -90 // start from top

                  return entries.map(([status, count], i) => {
                    const angle = (count / total) * 360
                    const startAngle = currentAngle
                    const endAngle = currentAngle + angle
                    currentAngle = endAngle

                    const startRad = (startAngle * Math.PI) / 180
                    const endRad = (endAngle * Math.PI) / 180

                    const x1 = city.x + size * Math.cos(startRad)
                    const y1 = city.y + size * Math.sin(startRad)
                    const x2 = city.x + size * Math.cos(endRad)
                    const y2 = city.y + size * Math.sin(endRad)

                    const largeArc = angle > 180 ? 1 : 0
                    const color = STATUS_CONFIG[status]?.color || '#6b7280'

                    return (
                      <path
                        key={`${city.key}-${status}`}
                        d={`M ${city.x} ${city.y} L ${x1} ${y1} A ${size} ${size} 0 ${largeArc} 1 ${x2} ${y2} Z`}
                        fill={color}
                        stroke="white"
                        strokeWidth="0.4"
                        filter={`url(#glow-${status})`}
                        className="cursor-pointer"
                        onMouseEnter={(e) => handleMouseEnter(city.key, e)}
                        onMouseLeave={() => setHoveredCity(null)}
                      />
                    )
                  })
                })()
              ) : (
                <circle
                  cx={city.x}
                  cy={city.y}
                  r={size}
                  fill={dominantColor}
                  stroke="white"
                  strokeWidth="0.8"
                  filter={`url(#glow-${dominantStatus})`}
                  className="cursor-pointer"
                  onMouseEnter={(e) => handleMouseEnter(city.key, e)}
                  onMouseLeave={() => setHoveredCity(null)}
                />
              )}

              {/* Count badge */}
              {city.count > 1 && (
                <text
                  x={city.x}
                  y={city.y + 1}
                  textAnchor="middle"
                  fontSize="3.2"
                  fill="white"
                  fontWeight="bold"
                  style={{ pointerEvents: 'none', textShadow: '0 0.5px 1px rgba(0,0,0,0.3)' }}
                >
                  {city.count}
                </text>
              )}

              {/* City label */}
              <text
                x={city.x}
                y={city.y + size + 4.5}
                textAnchor="middle"
                fontSize="2.8"
                fill="#334155"
                fontWeight="600"
                style={{ pointerEvents: 'none' }}
              >
                {city.name}
              </text>
            </g>
          )
        })}
      </svg>

      {/* Tooltip */}
      {hoveredCity && propertiesByCity[hoveredCity] && (
        <div
          className="fixed z-50 rounded-xl pointer-events-none px-4 py-3"
          style={{
            left: tooltipPos.x,
            top: tooltipPos.y,
            transform: 'translate(-50%, calc(-100% - 12px))',
            background: 'rgba(255,255,255,0.97)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 12px 40px rgba(0,0,0,0.15)',
            border: '1px solid rgba(0,0,0,0.06)',
          }}
        >
          <p className="font-semibold text-sm flex items-center gap-1.5" style={{ color: '#1e293b' }}>
            <MapPin className="w-3.5 h-3.5" style={{ color: '#d4a853' }} />
            {TEXAS_CITIES[hoveredCity]?.name || hoveredCity}
          </p>
          <p className="text-xs mt-0.5" style={{ color: '#94a3b8' }}>
            {propertiesByCity[hoveredCity].length} propiedad{propertiesByCity[hoveredCity].length !== 1 ? 'es' : ''}
          </p>
          <div className="mt-2 space-y-1">
            {/* Status breakdown */}
            {Object.entries(getStatusBreakdown(propertiesByCity[hoveredCity])).map(([status, count]) => (
              <div key={status} className="flex items-center gap-2 text-xs">
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: STATUS_CONFIG[status]?.color || '#6b7280' }}
                />
                <span style={{ color: '#475569' }}>
                  {STATUS_CONFIG[status]?.label || status}: {count}
                </span>
              </div>
            ))}
          </div>
          {/* Property list */}
          <div className="mt-2 pt-2 space-y-0.5" style={{ borderTop: '1px solid #f1f5f9' }}>
            {propertiesByCity[hoveredCity].slice(0, 4).map((prop) => (
              <div key={prop.id} className="flex items-center gap-1.5 text-[10px]">
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: STATUS_CONFIG[prop.status]?.color || '#6b7280' }}
                />
                <span className="truncate max-w-[140px]" style={{ color: '#64748b' }}>
                  {prop.address}
                </span>
              </div>
            ))}
            {propertiesByCity[hoveredCity].length > 4 && (
              <p className="text-[10px]" style={{ color: '#94a3b8' }}>
                +{propertiesByCity[hoveredCity].length - 4} más
              </p>
            )}
          </div>
        </div>
      )}

      {/* Empty state */}
      {activeCities.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <div className="w-14 h-14 rounded-full mx-auto mb-3 flex items-center justify-center" style={{ background: 'linear-gradient(135deg, #f1f5f9, #e2e8f0)' }}>
              <MapPin className="w-7 h-7" style={{ color: '#94a3b8' }} />
            </div>
            <p className="text-sm font-medium" style={{ color: '#64748b' }}>
              No hay propiedades con ciudad
            </p>
            <p className="text-xs mt-1" style={{ color: '#94a3b8' }}>
              Agrega ciudades a tus propiedades para verlas en el mapa
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
