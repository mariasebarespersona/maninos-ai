'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Landmark, Plus, User, DollarSign, Briefcase, Phone, Mail, TrendingUp, ArrowRight, FileText, Search } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Investor {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  total_invested: number
  available_capital: number
  status: string
  notes: string | null
  created_at: string
}

interface InvestmentsSummary {
  total_investments: number
  active_investments: number
  total_invested: number
  total_returned: number
  net_outstanding: number
}

// Uses Next.js proxy routes (/api/capital/...)

export default function InvestorsPage() {
  const router = useRouter()
  const toast = useToast()
  const [investors, setInvestors] = useState<Investor[]>([])
  const [summary, setSummary] = useState<InvestmentsSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [showCreate, setShowCreate] = useState(false)
  
  // Create form
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [company, setCompany] = useState('')
  const [capital, setCapital] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      const [investorsRes, summaryRes] = await Promise.all([
        fetch(`/api/capital/investors`),
        fetch(`/api/capital/investors/investments/summary`),
      ])
      
      const investorsData = await investorsRes.json()
      const summaryData = await summaryRes.json()
      
      if (investorsData.ok) setInvestors(investorsData.investors)
      if (summaryData.ok) setSummary(summaryData.summary)
    } catch (err) {
      console.error('Error loading investors:', err)
    } finally {
      setLoading(false)
    }
  }

  const handleCreate = async () => {
    if (!name) { toast.warning('Ingresa el nombre del inversionista'); return }
    setCreating(true)
    try {
      const res = await fetch(`/api/capital/investors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          email: email || undefined,
          phone: phone || undefined,
          company: company || undefined,
          available_capital: capital ? parseFloat(capital) : 0,
        })
      })
      const data = await res.json()
      if (data.ok) {
        toast.success('Inversionista registrado')
        setShowCreate(false)
        setName(''); setEmail(''); setPhone(''); setCompany(''); setCapital('')
        loadData()
      } else {
        toast.error('Error al crear inversionista')
      }
    } catch (err) {
      toast.error('Error al crear inversionista')
    } finally {
      setCreating(false)
    }
  }

  const fmt = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(n)

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2" style={{ borderColor: 'var(--gold-600)' }} />
      </div>
    )
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Seguimiento de Inversionistas</h1>
          <p style={{ color: 'var(--slate)' }}>Perfiles, inversiones y notas promisorias</p>
        </div>
        <button onClick={() => setShowCreate(true)} className="btn-primary btn-sm">
          <Plus className="w-4 h-4" />
          Nuevo Inversionista
        </button>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <DollarSign className="w-5 h-5" style={{ color: 'var(--gold-600)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Total Invertido</span>
            </div>
            <div className="stat-value text-2xl">{fmt(summary.total_invested)}</div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5" style={{ color: 'var(--success)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Retornado</span>
            </div>
            <div className="stat-value text-2xl" style={{ color: 'var(--success)' }}>
              {fmt(summary.total_returned)}
            </div>
          </div>
          <div className="stat-card">
            <div className="flex items-center gap-2 mb-2">
              <Landmark className="w-5 h-5" style={{ color: 'var(--info)' }} />
              <span className="stat-label" style={{ margin: 0 }}>Pendiente</span>
            </div>
            <div className="stat-value text-2xl">{fmt(summary.net_outstanding)}</div>
          </div>
        </div>
      )}

      {/* Investors List */}
      {investors.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <Landmark className="w-12 h-12 mx-auto mb-4" style={{ color: 'var(--ash)' }} />
          <h3 className="font-serif text-lg" style={{ color: 'var(--charcoal)' }}>
            No hay inversionistas registrados
          </h3>
          <p className="mt-2" style={{ color: 'var(--slate)' }}>
            Registra inversionistas para gestionar el fondeo de propiedades
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {investors.map((inv) => (
            <div key={inv.id} className="card-luxury p-5">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0"
                     style={{ backgroundColor: 'var(--gold-100)' }}>
                  <User className="w-6 h-6" style={{ color: 'var(--gold-700)' }} />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="font-semibold" style={{ color: 'var(--ink)' }}>{inv.name}</h3>
                  {inv.company && (
                    <p className="text-sm flex items-center gap-1" style={{ color: 'var(--slate)' }}>
                      <Briefcase className="w-3 h-3" /> {inv.company}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-3 mt-2 text-sm" style={{ color: 'var(--ash)' }}>
                    {inv.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" /> {inv.email}
                      </span>
                    )}
                    {inv.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" /> {inv.phone}
                      </span>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-2 gap-3 mt-4">
                    <div className="card-flat py-2 px-3 text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Invertido</p>
                      <p className="font-serif font-semibold" style={{ color: 'var(--charcoal)' }}>
                        {fmt(inv.total_invested)}
                      </p>
                    </div>
                    <div className="card-flat py-2 px-3 text-center">
                      <p className="text-xs uppercase tracking-wide" style={{ color: 'var(--ash)' }}>Disponible</p>
                      <p className="font-serif font-semibold" style={{ color: 'var(--success)' }}>
                        {fmt(inv.available_capital)}
                      </p>
                    </div>
                  </div>
                  
                  <button 
                    onClick={() => router.push(`/capital/investors/${inv.id}`)}
                    className="btn-ghost btn-sm w-full mt-3 justify-center"
                  >
                    Ver Detalle <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/20">
          <div className="bg-white rounded-lg p-6 w-full max-w-md shadow-lg">
            <h3 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>
              Nuevo Inversionista
            </h3>
            <div className="space-y-4">
              <div>
                <label className="label">Nombre *</label>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="input" placeholder="Nombre completo" />
              </div>
              <div>
                <label className="label">Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="input" placeholder="email@ejemplo.com" />
              </div>
              <div>
                <label className="label">Teléfono</label>
                <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} className="input" placeholder="(555) 000-0000" />
              </div>
              <div>
                <label className="label">Empresa</label>
                <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} className="input" placeholder="Empresa o grupo" />
              </div>
              <div>
                <label className="label">Capital Disponible</label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate">$</span>
                  <input type="number" value={capital} onChange={(e) => setCapital(e.target.value)} className="input pl-8" placeholder="0" />
                </div>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button onClick={handleCreate} disabled={creating} className="btn-primary flex-1">
                {creating ? 'Creando...' : 'Registrar'}
              </button>
              <button onClick={() => setShowCreate(false)} className="btn-secondary">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

