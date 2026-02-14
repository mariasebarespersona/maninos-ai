'use client'

import { useEffect, useState } from 'react'
import { BarChart3, Download, Plus, Calendar, TrendingUp, TrendingDown, AlertTriangle, DollarSign } from 'lucide-react'
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

const MONTH_NAMES = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']

export default function ReportsPage() {
  const toast = useToast()
  const [reports, setReports] = useState<Report[]>([])
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())

  useEffect(() => { loadReports() }, [])

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
          <h1 className="font-serif text-2xl" style={{ color: 'var(--ink)' }}>Reportes Mensuales</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Portfolio y métricas financieras</p>
        </div>
      </div>

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
          <p className="text-sm mt-1" style={{ color: 'var(--ash)' }}>Genera tu primer reporte mensual arriba</p>
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
    </div>
  )
}


