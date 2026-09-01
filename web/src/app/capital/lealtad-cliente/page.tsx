'use client'

import { Heart, Construction } from 'lucide-react'

export default function LealtadClientePage() {
  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Lealtad de Cliente</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
          <Heart className="w-4 h-4 inline mr-1" style={{ color: 'var(--gold-700)' }} />
          Comportamiento de pago e historial de permanencia de cada cliente.
        </p>
      </div>

      <div
        className="rounded-lg p-6 flex items-start gap-3"
        style={{ backgroundColor: 'var(--info-light)', border: '1px solid var(--info)' }}
      >
        <Construction className="w-5 h-5 flex-none mt-0.5" style={{ color: 'var(--info)' }} />
        <div>
          <p className="font-semibold" style={{ color: 'var(--ink)' }}>Sección en construcción</p>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
            El apartado existe en el menú y la navegación ya funciona, pero todavía no hay
            funcionalidad detrás. Cuando se defina qué debe mostrar, esta página se sustituye.
          </p>
        </div>
      </div>
    </div>
  )
}
