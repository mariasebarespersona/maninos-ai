'use client'

/**
 * Alta Manual de cliente RTO antiguo (legacy) — Capital.
 *
 * Camino paralelo al flujo automático Homes→Capital: crea la cadena completa
 * (cliente → casa → venta → solicitud → contrato activo → cronograma) en una
 * sola llamada, con los pagos históricos ya marcados como pagados (sin
 * asientos) y la casa/venta visibles SOLO en Capital.
 */

import { useEffect, useMemo, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft, ArrowRight, User, Home, DollarSign, ShieldCheck,
  FileText, CheckCircle2, Loader2, Search, AlertTriangle,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface ExistingClient { id: string; name: string; email: string | null; phone: string | null }
// Casas reutilizables = SOLO las de "Casas Financiadas" de Capital (ventas RTO),
// nunca el inventario general de Homes (esas no son operaciones RTO).
interface ExistingProperty {
  id: string
  property_code: string | null
  address: string
  city: string | null
  sale_price: number | null
  client_name?: string | null
  bucket?: string | null
}

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n || 0)

const STEPS = [
  { n: 1, label: 'Cliente', icon: User },
  { n: 2, label: 'Casa', icon: Home },
  { n: 3, label: 'Modelo de Pago', icon: DollarSign },
  { n: 4, label: 'Identidad y Contrato', icon: ShieldCheck },
  { n: 5, label: 'Revisar y Crear', icon: CheckCircle2 },
]

export default function AltaManualPage() {
  const router = useRouter()
  const toast = useToast()
  const [step, setStep] = useState(1)
  const [submitting, setSubmitting] = useState(false)
  const [result, setResult] = useState<any>(null)

  // ── Paso 1: Cliente ──
  const [clientMode, setClientMode] = useState<'new' | 'existing'>('new')
  const [existingClients, setExistingClients] = useState<ExistingClient[]>([])
  const [clientSearch, setClientSearch] = useState('')
  const [selectedClientId, setSelectedClientId] = useState('')
  const [cName, setCName] = useState('')
  const [cEmail, setCEmail] = useState('')
  const [cPhone, setCPhone] = useState('')
  const [cIncome, setCIncome] = useState('')

  // ── Paso 2: Casa ──
  const [propMode, setPropMode] = useState<'new' | 'existing'>('new')
  const [existingProps, setExistingProps] = useState<ExistingProperty[]>([])
  const [propSearch, setPropSearch] = useState('')
  const [selectedPropId, setSelectedPropId] = useState('')
  const [pCode, setPCode] = useState('')
  const [pAddress, setPAddress] = useState('')
  const [pCity, setPCity] = useState('')
  const [pBeds, setPBeds] = useState('')
  const [pBaths, setPBaths] = useState('')

  // ── Paso 3: Modelo de pago ──
  const [purchasePrice, setPurchasePrice] = useState('')
  const [downPayment, setDownPayment] = useState('')
  const [monthlyRent, setMonthlyRent] = useState('')
  const [termMonths, setTermMonths] = useState('36')
  const [startDate, setStartDate] = useState('')
  const [dueDay, setDueDay] = useState('15')
  const [paidThrough, setPaidThrough] = useState('')
  const [dpPaid, setDpPaid] = useState(true)

  // ── Paso 4: Identidad + contrato ──
  const [markVerified, setMarkVerified] = useState(true)
  const [idFront, setIdFront] = useState<File | null>(null)
  const [idBack, setIdBack] = useState<File | null>(null)
  const [selfie, setSelfie] = useState<File | null>(null)
  const [contractPdf, setContractPdf] = useState<File | null>(null)
  const [notes, setNotes] = useState('')

  useEffect(() => {
    fetch('/api/clients').then(r => r.json())
      .then(d => setExistingClients(Array.isArray(d) ? d : (d.clients || [])))
      .catch(() => {})
    // Casas existentes = las de Casas Financiadas (ventas RTO de Capital),
    // deduplicadas por propiedad. El inventario general de Homes NO aplica aquí.
    fetch('/api/capital/financed-houses').then(r => r.json())
      .then(d => {
        const seen = new Set<string>()
        const props: ExistingProperty[] = []
        for (const h of (d.houses || [])) {
          const p = h.property || {}
          if (!p.id || seen.has(p.id)) continue
          seen.add(p.id)
          props.push({
            id: p.id,
            property_code: p.code || null,
            address: p.address || '—',
            city: p.city || null,
            sale_price: h.terms?.sale_price ?? null,
            client_name: h.client?.name || null,
            bucket: h.bucket || null,
          })
        }
        setExistingProps(props)
      })
      .catch(() => {})
  }, [])

  const filteredClients = useMemo(() => {
    const q = clientSearch.toLowerCase()
    return existingClients.filter(c =>
      !q || c.name?.toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q) || (c.phone || '').includes(q)
    ).slice(0, 8)
  }, [existingClients, clientSearch])

  const filteredProps = useMemo(() => {
    const q = propSearch.toLowerCase()
    return existingProps.filter(p =>
      !q || (p.property_code || '').toLowerCase().includes(q) || p.address?.toLowerCase().includes(q)
    ).slice(0, 8)
  }, [existingProps, propSearch])

  // Mensualidades históricas estimadas (el backend calcula la cifra exacta)
  const historicalEstimate = useMemo(() => {
    if (!startDate || !paidThrough) return 0
    const s = new Date(startDate + 'T00:00:00')
    const p = new Date(paidThrough + 'T00:00:00')
    if (p < s) return 0
    const months = (p.getFullYear() - s.getFullYear()) * 12 + (p.getMonth() - s.getMonth()) + 1
    return Math.max(0, Math.min(months, parseInt(termMonths) || 0))
  }, [startDate, paidThrough, termMonths])

  const clientLabel = clientMode === 'existing'
    ? existingClients.find(c => c.id === selectedClientId)?.name || '—'
    : cName || '—'
  const propLabel = propMode === 'existing'
    ? (() => { const p = existingProps.find(x => x.id === selectedPropId); return p ? `${p.property_code ? p.property_code + ' · ' : ''}${p.address}` : '—' })()
    : `${pCode ? pCode + ' · ' : ''}${pAddress || '—'}`

  const stepValid = (s: number): string | null => {
    if (s === 1) {
      if (clientMode === 'existing' && !selectedClientId) return 'Selecciona un cliente existente'
      if (clientMode === 'new' && !cName.trim()) return 'El nombre del cliente es obligatorio'
    }
    if (s === 2) {
      if (propMode === 'existing' && !selectedPropId) return 'Selecciona una casa existente'
      if (propMode === 'new' && !pAddress.trim()) return 'La dirección de la casa es obligatoria'
    }
    if (s === 3) {
      if (!purchasePrice || parseFloat(purchasePrice) <= 0) return 'Precio de venta RTO obligatorio'
      if (!monthlyRent || parseFloat(monthlyRent) <= 0) return 'Mensualidad obligatoria'
      if (!termMonths || parseInt(termMonths) <= 0) return 'Plazo obligatorio'
      if (!startDate) return 'Fecha de inicio obligatoria'
      if (paidThrough && paidThrough > new Date().toISOString().slice(0, 10)) return '"Pagado hasta" no puede ser futura'
    }
    return null
  }

  const next = () => {
    const err = stepValid(step)
    if (err) { toast.warning(err); return }
    setStep(Math.min(5, step + 1))
  }

  const handleSubmit = async () => {
    for (const s of [1, 2, 3]) {
      const err = stepValid(s)
      if (err) { toast.error(err); setStep(s); return }
    }
    setSubmitting(true)
    try {
      // 1) Crear la cadena completa
      const body: any = {
        terms: {
          purchase_price: parseFloat(purchasePrice),
          down_payment: parseFloat(downPayment || '0'),
          monthly_rent: parseFloat(monthlyRent),
          term_months: parseInt(termMonths),
          start_date: startDate,
          payment_due_day: parseInt(dueDay || '15'),
        },
        paid_through: paidThrough || null,
        down_payment_paid: dpPaid,
        mark_kyc_verified: markVerified,
        notes: notes || null,
      }
      if (clientMode === 'existing') body.client_id = selectedClientId
      else body.client = { name: cName.trim(), email: cEmail.trim() || null, phone: cPhone.trim() || null, monthly_income: cIncome ? parseFloat(cIncome) : null }
      if (propMode === 'existing') body.property_id = selectedPropId
      else body.property = { property_code: pCode.trim() || null, address: pAddress.trim(), city: pCity.trim() || null, sale_price: parseFloat(purchasePrice), bedrooms: pBeds ? parseInt(pBeds) : null, bathrooms: pBaths ? parseFloat(pBaths) : null }

      const res = await fetch('/api/capital/manual-intake', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) throw new Error(data.detail || data.error || 'Error creando el alta')

      // 2) Docs de identidad (opcional)
      if (idFront) {
        const fd = new FormData()
        fd.append('id_front', idFront)
        if (idBack) fd.append('id_back', idBack)
        if (selfie) fd.append('selfie', selfie)
        fd.append('mark_verified', String(markVerified))
        const kr = await fetch(`/api/capital/manual-intake/clients/${data.client_id}/kyc-documents`, { method: 'POST', body: fd })
        const kd = await kr.json()
        if (!kr.ok || !kd.ok) toast.warning(`Alta creada, pero falló la subida de identidad: ${kd.detail || kd.error}`)
      }

      // 3) Contrato escaneado (opcional)
      if (contractPdf) {
        const fd = new FormData()
        fd.append('file', contractPdf)
        const cr = await fetch(`/api/capital/manual-intake/contracts/${data.contract_id}/upload-contract`, { method: 'POST', body: fd })
        const cd = await cr.json()
        if (!cr.ok || !cd.ok) toast.warning(`Alta creada, pero falló la subida del contrato: ${cd.detail || cd.error}`)
      }

      setResult(data)
      toast.success(data.message || 'Cliente RTO antiguo dado de alta')
    } catch (e: any) {
      toast.error(e.message || 'Error en el alta manual')
    } finally {
      setSubmitting(false)
    }
  }

  // ── Pantalla de éxito ──
  if (result) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 animate-fade-in">
        <div className="card-luxury p-8 text-center">
          <CheckCircle2 className="w-14 h-14 mx-auto mb-4" style={{ color: 'var(--success)' }} />
          <h1 className="font-serif text-2xl mb-2" style={{ color: 'var(--ink)' }}>Alta completada</h1>
          <p style={{ color: 'var(--slate)' }}>{result.message}</p>
          <div className="grid grid-cols-2 gap-3 mt-6 text-sm">
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Mensualidades creadas</p>
              <p className="font-serif text-xl font-semibold" style={{ color: 'var(--navy-800)' }}>{result.payments_created}</p>
            </div>
            <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--success-light)' }}>
              <p className="text-xs" style={{ color: 'var(--ash)' }}>Ya pagadas (históricas)</p>
              <p className="font-serif text-xl font-semibold" style={{ color: 'var(--success)' }}>{result.historical_paid}</p>
            </div>
          </div>
          <div className="flex flex-wrap justify-center gap-3 mt-6">
            <Link href={`/capital/applications/${result.application_id}`} className="btn-primary btn-sm">Ver Cliente RTO</Link>
            <Link href={`/capital/contracts/${result.contract_id}`} className="btn-secondary btn-sm">Ver Contrato</Link>
            <Link href="/capital/financed-houses" className="btn-ghost btn-sm">Casas Financiadas</Link>
          </div>
          <button onClick={() => { setResult(null); setStep(1) }} className="btn-ghost btn-sm mt-4">
            Dar de alta otro cliente
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <button onClick={() => router.push('/capital/applications')} className="btn-ghost btn-sm">
        <ArrowLeft className="w-4 h-4" /> Volver a Clientes RTO
      </button>

      <div>
        <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Alta Manual — Cliente RTO Antiguo</h1>
        <p className="mt-1 text-sm" style={{ color: 'var(--slate)' }}>
          Para clientes que ya venían pagando antes de usar la app. Se crea todo linkeado (solicitud,
          contrato, cronograma, casa financiada) sin tocar el portal Homes ni su contabilidad.
        </p>
      </div>

      {/* Stepper */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1">
        {STEPS.map((s, i) => (
          <div key={s.n} className="flex items-center gap-1 flex-shrink-0">
            <button
              onClick={() => s.n < step && setStep(s.n)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor: step === s.n ? 'var(--gold-700)' : step > s.n ? 'var(--success-light)' : 'var(--cream)',
                color: step === s.n ? 'white' : step > s.n ? 'var(--success)' : 'var(--ash)',
                cursor: s.n < step ? 'pointer' : 'default',
              }}
            >
              <s.icon className="w-3.5 h-3.5" /> {s.label}
            </button>
            {i < STEPS.length - 1 && <ArrowRight className="w-3 h-3" style={{ color: 'var(--ash)' }} />}
          </div>
        ))}
      </div>

      <div className="card-luxury p-6 space-y-5">
        {/* ═══ Paso 1: Cliente ═══ */}
        {step === 1 && (
          <>
            <div className="flex gap-2">
              {(['new', 'existing'] as const).map(m => (
                <button key={m} onClick={() => setClientMode(m)} className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: clientMode === m ? 'var(--navy-800)' : 'var(--cream)', color: clientMode === m ? 'white' : 'var(--slate)' }}>
                  {m === 'new' ? 'Cliente nuevo' : 'Cliente existente'}
                </button>
              ))}
            </div>
            {clientMode === 'existing' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
                  <input className="input w-full pl-10" placeholder="Buscar por nombre, email o teléfono…"
                    value={clientSearch} onChange={e => setClientSearch(e.target.value)} />
                </div>
                <div className="divide-y rounded-lg border" style={{ borderColor: 'var(--sand)' }}>
                  {filteredClients.map(c => (
                    <button key={c.id} onClick={() => setSelectedClientId(c.id)}
                      className="w-full text-left p-3 flex items-center justify-between hover:bg-cream/50"
                      style={{ backgroundColor: selectedClientId === c.id ? 'var(--gold-100)' : 'transparent' }}>
                      <span>
                        <span className="font-medium block" style={{ color: 'var(--charcoal)' }}>{c.name}</span>
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>{c.email || c.phone || '—'}</span>
                      </span>
                      {selectedClientId === c.id && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />}
                    </button>
                  ))}
                  {filteredClients.length === 0 && <p className="p-3 text-sm" style={{ color: 'var(--ash)' }}>Sin resultados — crea uno nuevo</p>}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Nombre completo *</label>
                  <input className="input w-full" value={cName} onChange={e => setCName(e.target.value)} placeholder="Juan Pérez" /></div>
                <div><label className="label">Teléfono</label>
                  <input className="input w-full" value={cPhone} onChange={e => setCPhone(e.target.value)} placeholder="832-..." /></div>
                <div><label className="label">Email</label>
                  <input className="input w-full" type="email" value={cEmail} onChange={e => setCEmail(e.target.value)} placeholder="cliente@email.com" /></div>
                <div><label className="label">Ingreso mensual (opcional)</label>
                  <input className="input w-full" type="number" value={cIncome} onChange={e => setCIncome(e.target.value)} placeholder="3500" /></div>
              </div>
            )}
          </>
        )}

        {/* ═══ Paso 2: Casa ═══ */}
        {step === 2 && (
          <>
            <div className="flex gap-2">
              {(['new', 'existing'] as const).map(m => (
                <button key={m} onClick={() => setPropMode(m)} className="px-4 py-2 rounded-lg text-sm font-medium"
                  style={{ backgroundColor: propMode === m ? 'var(--navy-800)' : 'var(--cream)', color: propMode === m ? 'white' : 'var(--slate)' }}>
                  {m === 'new' ? 'Casa nueva (solo Capital)' : 'Casa existente'}
                </button>
              ))}
            </div>
            {propMode === 'new' && (
              <div className="rounded-lg p-3 text-xs flex items-start gap-2" style={{ backgroundColor: 'var(--info-light)', color: 'var(--charcoal)' }}>
                <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" style={{ color: 'var(--info)' }} />
                La casa se registra marcada como legacy: solo se ve en Capital (Casas Financiadas), nunca en el portal Homes ni en el catálogo público.
              </div>
            )}
            {propMode === 'existing' ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--ash)' }} />
                  <input className="input w-full pl-10" placeholder="Buscar por código (H13) o dirección…"
                    value={propSearch} onChange={e => setPropSearch(e.target.value)} />
                </div>
                <p className="text-xs" style={{ color: 'var(--ash)' }}>
                  Solo se muestran casas de <strong>Casas Financiadas</strong> (operaciones RTO de Capital). Si la casa del cliente antiguo no está aquí, créala nueva.
                </p>
                <div className="divide-y rounded-lg border" style={{ borderColor: 'var(--sand)' }}>
                  {filteredProps.map(p => (
                    <button key={p.id} onClick={() => setSelectedPropId(p.id)}
                      className="w-full text-left p-3 flex items-center justify-between hover:bg-cream/50"
                      style={{ backgroundColor: selectedPropId === p.id ? 'var(--gold-100)' : 'transparent' }}>
                      <span>
                        <span className="font-medium block" style={{ color: 'var(--charcoal)' }}>
                          {p.property_code ? `${p.property_code} · ` : ''}{p.address}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--ash)' }}>
                          {p.city || ''} {p.sale_price ? `· ${fmt(p.sale_price)}` : ''}
                          {p.client_name ? ` · cliente actual: ${p.client_name}` : ''}
                          {p.bucket === 'activa' ? ' · ⚠ contrato activo' : p.bucket === 'liquidada' ? ' · liquidada' : ''}
                        </span>
                      </span>
                      {selectedPropId === p.id && <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--gold-700)' }} />}
                    </button>
                  ))}
                  {filteredProps.length === 0 && (
                    <p className="p-3 text-sm" style={{ color: 'var(--ash)' }}>
                      No hay casas financiadas que coincidan — créala nueva (pestaña &ldquo;Casa nueva&rdquo;)
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className="label">Código de casa</label>
                  <input className="input w-full" value={pCode} onChange={e => setPCode(e.target.value.toUpperCase())} placeholder="H13 / B2 / DFW1" /></div>
                <div><label className="label">Dirección *</label>
                  <input className="input w-full" value={pAddress} onChange={e => setPAddress(e.target.value)} placeholder="123 Main St" /></div>
                <div><label className="label">Ciudad</label>
                  <input className="input w-full" value={pCity} onChange={e => setPCity(e.target.value)} placeholder="Houston" /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="label">Recámaras</label>
                    <input className="input w-full" type="number" value={pBeds} onChange={e => setPBeds(e.target.value)} /></div>
                  <div><label className="label">Baños</label>
                    <input className="input w-full" type="number" step="0.5" value={pBaths} onChange={e => setPBaths(e.target.value)} /></div>
                </div>
              </div>
            )}
          </>
        )}

        {/* ═══ Paso 3: Modelo de pago ═══ */}
        {step === 3 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="label">Precio de venta RTO *</label>
              <input className="input w-full" type="number" value={purchasePrice} onChange={e => setPurchasePrice(e.target.value)} placeholder="45000" /></div>
            <div><label className="label">Enganche</label>
              <input className="input w-full" type="number" value={downPayment} onChange={e => setDownPayment(e.target.value)} placeholder="13500" /></div>
            <div><label className="label">Mensualidad *</label>
              <input className="input w-full" type="number" value={monthlyRent} onChange={e => setMonthlyRent(e.target.value)} placeholder="900" /></div>
            <div><label className="label">Plazo (meses) *</label>
              <input className="input w-full" type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)} /></div>
            <div><label className="label">Fecha de inicio del contrato *</label>
              <input className="input w-full" type="date" value={startDate} onChange={e => setStartDate(e.target.value)} />
              <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>La fecha REAL en que empezó (puede ser de hace meses/años)</p></div>
            <div><label className="label">Día de pago del mes</label>
              <input className="input w-full" type="number" min="1" max="28" value={dueDay} onChange={e => setDueDay(e.target.value)} /></div>
            <div className="sm:col-span-2 rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--cream)' }}>
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Pagos ya cobrados (antes de la app)</p>
              <div><label className="label">Pagado hasta (fecha)</label>
                <input className="input w-full sm:w-64" type="date" value={paidThrough} onChange={e => setPaidThrough(e.target.value)} />
                <p className="text-[11px] mt-1" style={{ color: 'var(--ash)' }}>
                  Las mensualidades con vencimiento hasta esta fecha se marcan como pagadas (históricas, sin asientos contables).
                  {historicalEstimate > 0 && <> ≈ <strong>{historicalEstimate}</strong> mensualidades{monthlyRent ? ` (${fmt(historicalEstimate * parseFloat(monthlyRent))})` : ''}.</>}
                </p></div>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={dpPaid} onChange={e => setDpPaid(e.target.checked)} />
                El enganche ya fue cobrado
              </label>
            </div>
          </div>
        )}

        {/* ═══ Paso 4: Identidad y contrato ═══ */}
        {step === 4 && (
          <div className="space-y-5">
            <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--cream)' }}>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <ShieldCheck className="w-4 h-4" style={{ color: 'var(--gold-700)' }} /> Identidad verificada
              </p>
              <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--charcoal)' }}>
                <input type="checkbox" checked={markVerified} onChange={e => setMarkVerified(e.target.checked)} />
                Marcar identidad como verificada (verificación manual por empleado)
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div><label className="label">ID (frente)</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setIdFront(e.target.files?.[0] || null)} className="text-xs" /></div>
                <div><label className="label">ID (reverso)</label>
                  <input type="file" accept="image/*,.pdf" onChange={e => setIdBack(e.target.files?.[0] || null)} className="text-xs" /></div>
                <div><label className="label">Selfie (opcional)</label>
                  <input type="file" accept="image/*" onChange={e => setSelfie(e.target.files?.[0] || null)} className="text-xs" /></div>
              </div>
              <p className="text-[11px]" style={{ color: 'var(--ash)' }}>Los documentos son opcionales; puedes subirlos después desde el detalle del cliente.</p>
            </div>
            <div className="rounded-lg p-4 space-y-3" style={{ backgroundColor: 'var(--cream)' }}>
              <p className="text-sm font-semibold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                <FileText className="w-4 h-4" style={{ color: 'var(--gold-700)' }} /> Contrato firmado
              </p>
              <div><label className="label">PDF escaneado del contrato en papel (opcional)</label>
                <input type="file" accept="application/pdf" onChange={e => setContractPdf(e.target.files?.[0] || null)} className="text-xs" /></div>
              <p className="text-[11px]" style={{ color: 'var(--ash)' }}>
                Si no lo subes, podrás generarlo con los datos capturados (botón PDF en el detalle del contrato) o subir el escaneado más tarde.
              </p>
            </div>
            <div><label className="label">Notas (opcional)</label>
              <textarea className="input w-full" rows={2} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Contexto del cliente antiguo…" /></div>
          </div>
        )}

        {/* ═══ Paso 5: Revisar ═══ */}
        {step === 5 && (
          <div className="space-y-3 text-sm">
            {[
              ['Cliente', clientLabel + (clientMode === 'new' ? ' (nuevo)' : ' (existente)')],
              ['Casa', propLabel + (propMode === 'new' ? ' (nueva, solo Capital)' : ' (existente)')],
              ['Precio de venta RTO', fmt(parseFloat(purchasePrice || '0'))],
              ['Enganche', `${fmt(parseFloat(downPayment || '0'))}${dpPaid ? ' — ya cobrado' : ' — pendiente'}`],
              ['Mensualidad', `${fmt(parseFloat(monthlyRent || '0'))} × ${termMonths} meses (día ${dueDay})`],
              ['Inicio', startDate || '—'],
              ['Pagado hasta', paidThrough ? `${paidThrough} (≈ ${historicalEstimate} mensualidades históricas)` : 'Ninguna mensualidad pagada aún'],
              ['Identidad', markVerified ? `Verificada manualmente${idFront ? ' + documentos' : ''}` : 'Sin verificar'],
              ['Contrato', contractPdf ? `Escaneado: ${contractPdf.name}` : 'Se podrá generar/subir después'],
            ].map(([l, v]) => (
              <div key={l as string} className="flex justify-between gap-4 py-2 border-b last:border-0" style={{ borderColor: 'var(--sand)' }}>
                <span style={{ color: 'var(--slate)' }}>{l}</span>
                <span className="font-medium text-right" style={{ color: 'var(--charcoal)' }}>{v}</span>
              </div>
            ))}
            <div className="rounded-lg p-3 text-xs" style={{ backgroundColor: 'var(--info-light)', color: 'var(--charcoal)' }}>
              Se creará: solicitud aprobada + contrato activo + cronograma completo + casa financiada.
              Los pagos históricos NO generan asientos contables; los pagos futuros siguen el flujo normal.
            </div>
          </div>
        )}

        {/* Nav buttons */}
        <div className="flex justify-between pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
          <button onClick={() => setStep(Math.max(1, step - 1))} className="btn-ghost btn-sm" disabled={step === 1 || submitting}>
            <ArrowLeft className="w-4 h-4" /> Anterior
          </button>
          {step < 5 ? (
            <button onClick={next} className="btn-primary btn-sm">
              Siguiente <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <button onClick={handleSubmit} className="btn-primary btn-sm" disabled={submitting}>
              {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Creando…</> : <>Crear Alta Manual <CheckCircle2 className="w-4 h-4" /></>}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
