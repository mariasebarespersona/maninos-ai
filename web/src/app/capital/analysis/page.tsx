'use client'

import { useEffect, useState } from 'react'
import { Calculator, Search, CheckCircle2, AlertTriangle, XCircle, TrendingUp, DollarSign, Clock, ShieldCheck } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Analysis {
  id: string
  property_id: string
  purchase_price: number
  renovation_cost: number
  total_cost: number
  estimated_market_value: number
  ltv_ratio: number
  suggested_monthly_rent: number
  suggested_purchase_price: number
  suggested_term_months: number
  suggested_down_payment: number
  total_rto_income: number
  gross_profit: number
  roi_percentage: number
  monthly_cashflow: number
  breakeven_months: number
  risk_score: string
  risk_factors: string[]
  recommendation: string
  recommendation_notes: string
  approved_by: string | null
  approved_at: string | null
  created_at: string
  properties?: { address: string; city: string; status: string }
}

const RISK_STYLES: Record<string, { bg: string; color: string; label: string }> = {
  low: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Bajo' },
  medium: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Medio' },
  high: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Alto' },
  very_high: { bg: '#fca5a5', color: '#7f1d1d', label: 'Muy Alto' },
}

const REC_STYLES: Record<string, { bg: string; color: string; label: string; icon: typeof CheckCircle2 }> = {
  proceed: { bg: 'var(--success-light)', color: 'var(--success)', label: 'Proceder', icon: CheckCircle2 },
  caution: { bg: 'var(--warning-light)', color: 'var(--warning)', label: 'Precaución', icon: AlertTriangle },
  reject: { bg: 'var(--error-light)', color: 'var(--error)', label: 'Rechazar', icon: XCircle },
}

export default function AnalysisPage() {
  const toast = useToast()
  const [analyses, setAnalyses] = useState<Analysis[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [evaluating, setEvaluating] = useState(false)
  const [evalResult, setEvalResult] = useState<any>(null)

  // Form
  const [propertyId, setPropertyId] = useState('')
  const [termMonths, setTermMonths] = useState('36')
  const [targetRoi, setTargetRoi] = useState('20')
  const [downPaymentPct, setDownPaymentPct] = useState('5')

  useEffect(() => { loadAnalyses() }, [])

  const loadAnalyses = async () => {
    try {
      const res = await fetch('/api/capital/analysis')
      const data = await res.json()
      if (data.ok) setAnalyses(data.analyses || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleEvaluate = async () => {
    if (!propertyId) { toast.error('Ingresa el ID de la propiedad'); return }
    setEvaluating(true)
    setEvalResult(null)
    try {
      const res = await fetch('/api/capital/analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          suggested_term_months: parseInt(termMonths),
          target_roi: parseFloat(targetRoi),
          down_payment_pct: parseFloat(downPaymentPct),
        })
      })
      const data = await res.json()
      if (data.ok) {
        setEvalResult(data)
        toast.success(`Análisis: ${data.analysis.recommendation.toUpperCase()}`)
        loadAnalyses()
      } else {
        toast.error(data.detail || 'Error al evaluar')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setEvaluating(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) return (
    <div className="flex justify-center py-12">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
    </div>
  )

  return (
    <div className="space-y-6 animate-fade-in max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Análisis de Adquisición</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Evaluación financiera para adquisición RTO</p>
        </div>
        <button onClick={() => { setShowModal(true); setEvalResult(null) }}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white"
          style={{ backgroundColor: 'var(--navy-800)' }}>
          <Calculator className="w-4 h-4" /> Nuevo Análisis
        </button>
      </div>

      {/* Analysis List */}
      {analyses.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <Calculator className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
          <p style={{ color: 'var(--slate)' }}>No hay análisis de adquisición</p>
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Evalúa una propiedad para generar un análisis</p>
        </div>
      ) : (
        <div className="space-y-4">
          {analyses.map(a => {
            const risk = RISK_STYLES[a.risk_score] || RISK_STYLES.medium
            const rec = REC_STYLES[a.recommendation] || REC_STYLES.caution
            const RecIcon = rec.icon
            return (
              <div key={a.id} className="card-luxury p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>
                      {a.properties?.address || 'Propiedad'}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>
                      {a.properties?.city} • {new Date(a.created_at).toLocaleDateString('es-MX')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold"
                      style={{ backgroundColor: risk.bg, color: risk.color }}>
                      Riesgo: {risk.label}
                    </span>
                    <span className="px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                      style={{ backgroundColor: rec.bg, color: rec.color }}>
                      <RecIcon className="w-3 h-3" /> {rec.label}
                    </span>
                    {a.approved_by && (
                      <span className="px-2.5 py-1 rounded-full text-xs font-semibold inline-flex items-center gap-1"
                        style={{ backgroundColor: 'var(--success-light)', color: 'var(--success)' }}>
                        <ShieldCheck className="w-3 h-3" /> Aprobado
                      </span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mt-4 pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
                  {[
                    { label: 'Costo Total', value: fmt(a.total_cost) },
                    { label: 'Renta Sugerida', value: fmt(a.suggested_monthly_rent) + '/mes' },
                    { label: 'Precio RTO', value: fmt(a.suggested_purchase_price) },
                    { label: 'ROI', value: `${a.roi_percentage}%` },
                    { label: 'Breakeven', value: `${a.breakeven_months} meses` },
                  ].map(item => (
                    <div key={item.label}>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{item.label}</p>
                      <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {a.risk_factors.length > 0 && (
                  <div className="mt-3 p-3 rounded-md" style={{ backgroundColor: 'var(--cream)' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--slate)' }}>Factores de riesgo:</p>
                    <ul className="text-xs space-y-0.5" style={{ color: 'var(--charcoal)' }}>
                      {a.risk_factors.map((f, i) => <li key={i}>• {f}</li>)}
                    </ul>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Evaluate Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-ink/20 z-50 flex items-center justify-center p-4" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-lg max-w-lg w-full p-6 shadow-xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Evaluar Propiedad para RTO</h3>

            {!evalResult ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>ID de Propiedad *</label>
                  <input type="text" value={propertyId} onChange={e => setPropertyId(e.target.value)}
                    className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}
                    placeholder="UUID de la propiedad" />
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Plazo (meses)</label>
                    <input type="number" value={termMonths} onChange={e => setTermMonths(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>ROI Target (%)</label>
                    <input type="number" value={targetRoi} onChange={e => setTargetRoi(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }} />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Enganche (%)</label>
                    <input type="number" value={downPaymentPct} onChange={e => setDownPaymentPct(e.target.value)}
                      className="w-full px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }} />
                  </div>
                </div>
                <div className="flex gap-3 pt-2">
                  <button onClick={() => setShowModal(false)}
                    className="flex-1 px-4 py-2 rounded-md border text-sm font-medium" style={{ borderColor: 'var(--stone)' }}>
                    Cancelar
                  </button>
                  <button onClick={handleEvaluate} disabled={evaluating}
                    className="flex-1 px-4 py-2 rounded-md text-sm font-semibold text-white"
                    style={{ backgroundColor: 'var(--navy-800)', opacity: evaluating ? 0.6 : 1 }}>
                    {evaluating ? 'Evaluando...' : 'Evaluar'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Result */}
                <div className="p-4 rounded-lg" style={{
                  backgroundColor: REC_STYLES[evalResult.analysis.recommendation]?.bg || 'var(--cream)',
                }}>
                  <div className="flex items-center gap-2 mb-2">
                    {evalResult.analysis.recommendation === 'proceed' && <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--success)' }} />}
                    {evalResult.analysis.recommendation === 'caution' && <AlertTriangle className="w-5 h-5" style={{ color: 'var(--warning)' }} />}
                    {evalResult.analysis.recommendation === 'reject' && <XCircle className="w-5 h-5" style={{ color: 'var(--error)' }} />}
                    <span className="font-semibold" style={{
                      color: REC_STYLES[evalResult.analysis.recommendation]?.color || 'var(--charcoal)',
                    }}>
                      {REC_STYLES[evalResult.analysis.recommendation]?.label || evalResult.analysis.recommendation}
                    </span>
                  </div>
                  <p className="text-sm">{evalResult.analysis.recommendation_notes}</p>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Costo Total', value: fmt(evalResult.analysis.total_cost) },
                    { label: 'ROI Esperado', value: `${evalResult.analysis.roi_percentage}%` },
                    { label: 'Renta Mensual Sugerida', value: fmt(evalResult.analysis.suggested_monthly_rent) },
                    { label: 'Precio RTO Sugerido', value: fmt(evalResult.analysis.suggested_purchase_price) },
                    { label: 'Ganancia Bruta', value: fmt(evalResult.analysis.gross_profit) },
                    { label: 'Punto de Equilibrio', value: `${evalResult.analysis.breakeven_months} meses` },
                  ].map(item => (
                    <div key={item.label} className="p-3 rounded-md" style={{ backgroundColor: 'var(--cream)' }}>
                      <p className="text-xs" style={{ color: 'var(--ash)' }}>{item.label}</p>
                      <p className="font-semibold" style={{ color: 'var(--charcoal)' }}>{item.value}</p>
                    </div>
                  ))}
                </div>

                {evalResult.analysis.risk_factors.length > 0 && (
                  <div className="p-3 rounded-md" style={{ backgroundColor: 'var(--cream)' }}>
                    <p className="text-xs font-semibold mb-1" style={{ color: 'var(--slate)' }}>Factores de riesgo:</p>
                    <ul className="text-xs space-y-0.5" style={{ color: 'var(--charcoal)' }}>
                      {evalResult.analysis.risk_factors.map((f: string, i: number) => <li key={i}>• {f}</li>)}
                    </ul>
                  </div>
                )}

                <button onClick={() => setShowModal(false)}
                  className="w-full px-4 py-2 rounded-md text-sm font-semibold text-white"
                  style={{ backgroundColor: 'var(--navy-800)' }}>
                  Cerrar
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}


