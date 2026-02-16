'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, Plus, Calendar, TrendingUp, TrendingDown, AlertTriangle, DollarSign, Users, FileText } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

interface Report {
  id: string
  report_month: number
  report_year: number
  period_label: string
  active_contracts: number
  actual_income: number
  collection_rate: number
  overdue_payments: number
  delinquency_rate: number
  pdf_url: string | null
  generated_at: string
}

interface Investor {
  id: string
  name: string
  company: string | null
  email: string | null
}

interface InvestorStatement {
  investor: { name: string; company: string | null; email: string | null; status: string }
  period: string
  summary: {
    total_invested: number
    total_returned: number
    net_outstanding: number
    active_investments: number
    expected_annual_return: number
    notes_outstanding: number
    notes_paid: number
  }
  investments: any[]
  promissory_notes: any[]
  month_flows: any[]
  month_summary: { inflows: number; outflows: number; net: number }
}

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function ReportsPage() {
  const toast = useToast()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  
  // Investor statement
  const [activeTab, setActiveTab] = useState<'portfolio' | 'investors'>('portfolio')
  const [investors, setInvestors] = useState<Investor[]>([])
  const [selectedInvestor, setSelectedInvestor] = useState<string>('')
  const [investorStatement, setInvestorStatement] = useState<InvestorStatement | null>(null)
  const [generatingStatement, setGeneratingStatement] = useState(false)

  useEffect(() => { 
    loadReports()
    loadInvestors()
  }, [])

  const loadReports = async () => {
    try {
      const res = await fetch('/api/capital/reports')
      const data = await res.json()
      if (data.ok) setReports(data.reports || [])
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const loadInvestors = async () => {
    try {
      const res = await fetch('/api/capital/investors')
      const data = await res.json()
      if (data.ok) setInvestors(data.investors || [])
    } catch (err) {
      console.error(err)
    }
  }

  const handleGenerate = async () => {
    setGenerating(true)
    try {
      const res = await fetch('/api/capital/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ month: selectedMonth, year: selectedYear, generated_by: 'admin' })
      })
      const data = await res.json()
      if (data.ok) {
        toast.success(`Reporte de ${data.period} generado`)
        loadReports()
      } else {
        toast.error(data.detail || 'Error al generar reporte')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setGenerating(false)
    }
  }

  const handleDownloadPdf = async (reportId: string, label: string) => {
    try {
      const res = await fetch(`/api/capital/reports/${reportId}/pdf`)
      if (!res.ok) { toast.error('Error al descargar'); return }
      const blob = await res.blob()
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `Reporte_${label.replace(' ', '_')}.pdf`
      document.body.appendChild(a)
      a.click()
      a.remove()
      window.URL.revokeObjectURL(url)
      toast.success('Reporte descargado')
    } catch (err) {
      toast.error('Error al descargar')
    }
  }

  const handleGenerateInvestorStatement = async () => {
    if (!selectedInvestor) { toast.warning('Selecciona un inversionista'); return }
    setGeneratingStatement(true)
    try {
      const res = await fetch('/api/capital/reports/investor-statement', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          investor_id: selectedInvestor,
          month: selectedMonth,
          year: selectedYear,
        })
      })
      const data = await res.json()
      if (data.ok) {
        setInvestorStatement(data.statement)
        toast.success('Estado de cuenta generado')
      } else {
        toast.error(data.detail || 'Error al generar estado de cuenta')
      }
    } catch (err) {
      toast.error('Error de red')
    } finally {
      setGeneratingStatement(false)
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
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Reportes</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Portfolio, inversionistas y métricas financieras</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex rounded-md border overflow-hidden" style={{ borderColor: 'var(--stone)', width: 'fit-content' }}>
        <button 
          onClick={() => setActiveTab('portfolio')}
          className="px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          style={{ backgroundColor: activeTab === 'portfolio' ? 'var(--navy-800)' : 'var(--white)', color: activeTab === 'portfolio' ? 'white' : 'var(--slate)' }}
        >
          <BarChart3 className="w-4 h-4" /> Reportes Mensuales
        </button>
        <button 
          onClick={() => setActiveTab('investors')}
          className="px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2"
          style={{ backgroundColor: activeTab === 'investors' ? 'var(--navy-800)' : 'var(--white)', color: activeTab === 'investors' ? 'white' : 'var(--slate)' }}
        >
          <Users className="w-4 h-4" /> Estado de Cuenta Inversionistas
        </button>
      </div>

      {/* Portfolio Reports Tab */}
      {activeTab === 'portfolio' && (
        <>
          {/* Generate Report */}
          <div className="card-luxury p-5">
            <h2 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Generar Nuevo Reporte</h2>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Mes</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                  className="px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  {MONTH_NAMES.slice(1).map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Año</label>
                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                  className="px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={handleGenerate} disabled={generating}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
                style={{ backgroundColor: 'var(--navy-800)', opacity: generating ? 0.6 : 1 }}>
                <Plus className="w-4 h-4" />
                {generating ? 'Generando...' : 'Generar Reporte'}
              </button>
            </div>
          </div>

          {/* Reports List */}
          {reports.length === 0 ? (
            <div className="card-luxury p-12 text-center">
              <BarChart3 className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--ash)' }} />
              <p style={{ color: 'var(--slate)' }}>No hay reportes generados aún</p>
            </div>
          ) : (
            <div className="space-y-4">
              {reports.map(report => (
                <div key={report.id} className="card-luxury p-5">
                  <div className="flex items-start justify-between gap-4 flex-wrap">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ backgroundColor: 'var(--navy-100)' }}>
                        <Calendar className="w-6 h-6" style={{ color: 'var(--navy-700)' }} />
                      </div>
                      <div>
                        <h3 className="font-serif text-lg" style={{ color: 'var(--ink)' }}>{report.period_label}</h3>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>
                          Generado: {new Date(report.generated_at).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    <button onClick={() => handleDownloadPdf(report.id, report.period_label)}
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium text-white"
                      style={{ backgroundColor: 'var(--navy-800)' }}>
                      <Download className="w-4 h-4" /> PDF
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4 pt-4" style={{ borderTop: '1px solid var(--sand)' }}>
                    <div className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4" style={{ color: 'var(--success)' }} />
                      <div>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Ingreso</p>
                        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{fmt(report.actual_income)}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <TrendingUp className="w-4 h-4" style={{ color: 'var(--navy-700)' }} />
                      <div>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Cobro</p>
                        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{report.collection_rate}%</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <BarChart3 className="w-4 h-4" style={{ color: 'var(--gold-600)' }} />
                      <div>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Contratos</p>
                        <p className="font-semibold text-sm" style={{ color: 'var(--charcoal)' }}>{report.active_contracts}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {report.overdue_payments > 0 ? (
                        <AlertTriangle className="w-4 h-4" style={{ color: 'var(--error)' }} />
                      ) : (
                        <TrendingDown className="w-4 h-4" style={{ color: 'var(--success)' }} />
                      )}
                      <div>
                        <p className="text-xs" style={{ color: 'var(--ash)' }}>Mora</p>
                        <p className="font-semibold text-sm" style={{ color: report.overdue_payments > 0 ? 'var(--error)' : 'var(--charcoal)' }}>
                          {report.delinquency_rate}%
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* Investor Statements Tab */}
      {activeTab === 'investors' && (
        <>
          <div className="card-luxury p-5">
            <h2 className="font-serif text-lg mb-4" style={{ color: 'var(--ink)' }}>Generar Estado de Cuenta</h2>
            <div className="flex items-end gap-4 flex-wrap">
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Inversionista</label>
                <select value={selectedInvestor} onChange={e => setSelectedInvestor(e.target.value)}
                  className="px-3 py-2 rounded-md border text-sm min-w-[200px]" style={{ borderColor: 'var(--stone)' }}>
                  <option value="">Seleccionar...</option>
                  {investors.map(inv => (
                    <option key={inv.id} value={inv.id}>{inv.name}{inv.company ? ` (${inv.company})` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Mes</label>
                <select value={selectedMonth} onChange={e => setSelectedMonth(parseInt(e.target.value))}
                  className="px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  {MONTH_NAMES.slice(1).map((name, i) => (
                    <option key={i + 1} value={i + 1}>{name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--charcoal)' }}>Año</label>
                <select value={selectedYear} onChange={e => setSelectedYear(parseInt(e.target.value))}
                  className="px-3 py-2 rounded-md border text-sm" style={{ borderColor: 'var(--stone)' }}>
                  {[2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
              <button onClick={handleGenerateInvestorStatement} disabled={generatingStatement}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-md text-sm font-semibold text-white transition-all"
                style={{ backgroundColor: 'var(--navy-800)', opacity: generatingStatement ? 0.6 : 1 }}>
                <FileText className="w-4 h-4" />
                {generatingStatement ? 'Generando...' : 'Generar Estado'}
              </button>
            </div>
          </div>

          {/* Investor Statement Display */}
          {investorStatement && (
            <div className="space-y-4">
              <div className="card-luxury p-6">
                <div className="flex items-center justify-between mb-4">
                  <div>
                    <h2 className="font-serif text-xl" style={{ color: 'var(--ink)' }}>
                      Estado de Cuenta — {investorStatement.investor.name}
                    </h2>
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>
                      {investorStatement.investor.company} · {investorStatement.period}
                    </p>
                  </div>
                  <button 
                    onClick={() => window.print()}
                    className="btn-ghost btn-sm text-xs"
                  >
                    🖨️ Imprimir
                  </button>
                </div>

                {/* Summary */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--cream)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Total Invertido</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--charcoal)' }}>{fmt(investorStatement.summary.total_invested)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--success-light)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Retornado</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--success)' }}>{fmt(investorStatement.summary.total_returned)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--warning-light)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Pendiente</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--warning)' }}>{fmt(investorStatement.summary.net_outstanding)}</p>
                  </div>
                  <div className="p-3 rounded-lg" style={{ backgroundColor: 'var(--info-light)' }}>
                    <p className="text-xs" style={{ color: 'var(--ash)' }}>Notas Activas</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--info)' }}>{fmt(investorStatement.summary.notes_outstanding)}</p>
                  </div>
                </div>

                {/* Investments */}
                {investorStatement.investments.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--charcoal)' }}>Inversiones</h3>
                    <div className="overflow-x-auto">
                      <table className="table text-sm">
                        <thead>
                          <tr>
                            <th>Propiedad/Cliente</th>
                            <th>Monto</th>
                            <th>Retorno Esp.</th>
                            <th>Estado</th>
                            <th>Retornado</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investorStatement.investments.map((inv: any) => (
                            <tr key={inv.id}>
                              <td>{inv.property || inv.client || 'N/A'}</td>
                              <td className="font-medium">{fmt(inv.amount)}</td>
                              <td>{inv.expected_return_rate}%</td>
                              <td><span className="badge text-xs">{inv.status}</span></td>
                              <td>{fmt(inv.return_amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Promissory Notes */}
                {investorStatement.promissory_notes.length > 0 && (
                  <div className="mb-6">
                    <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--charcoal)' }}>Promissory Notes</h3>
                    <div className="overflow-x-auto">
                      <table className="table text-sm">
                        <thead>
                          <tr>
                            <th>Monto</th>
                            <th>Tasa</th>
                            <th>Plazo</th>
                            <th>Total Debido</th>
                            <th>Pagado</th>
                            <th>Estado</th>
                            <th>Vencimiento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investorStatement.promissory_notes.map((note: any) => (
                            <tr key={note.id}>
                              <td className="font-medium">{fmt(note.loan_amount)}</td>
                              <td>{note.annual_rate}%</td>
                              <td>{note.term_months}m</td>
                              <td>{fmt(note.total_due)}</td>
                              <td>{fmt(note.paid_amount)}</td>
                              <td><span className="badge text-xs">{note.status}</span></td>
                              <td>{note.maturity_date ? new Date(note.maturity_date).toLocaleDateString('es-MX') : 'N/A'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Month Flows */}
                {investorStatement.month_flows.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-sm mb-2" style={{ color: 'var(--charcoal)' }}>
                      Movimientos del Mes
                    </h3>
                    <div className="overflow-x-auto">
                      <table className="table text-sm">
                        <thead>
                          <tr>
                            <th>Fecha</th>
                            <th>Tipo</th>
                            <th>Monto</th>
                            <th>Descripción</th>
                          </tr>
                        </thead>
                        <tbody>
                          {investorStatement.month_flows.map((flow: any, i: number) => (
                            <tr key={i}>
                              <td>{flow.date ? new Date(flow.date).toLocaleDateString('es-MX') : 'N/A'}</td>
                              <td>{flow.type}</td>
                              <td className="font-medium" style={{ color: flow.amount >= 0 ? 'var(--success)' : 'var(--error)' }}>
                                {fmt(Math.abs(flow.amount))}
                              </td>
                              <td className="text-xs" style={{ color: 'var(--slate)' }}>{flow.description}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="flex justify-end gap-4 mt-3 text-sm">
                      <span style={{ color: 'var(--success)' }}>Entradas: {fmt(investorStatement.month_summary.inflows)}</span>
                      <span style={{ color: 'var(--error)' }}>Salidas: {fmt(investorStatement.month_summary.outflows)}</span>
                      <span className="font-bold" style={{ color: 'var(--charcoal)' }}>Neto: {fmt(investorStatement.month_summary.net)}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
