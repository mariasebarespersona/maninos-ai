'use client'

import React, { useState, useRef, useEffect, useCallback } from 'react'
import {
  ClipboardCheck, Camera, Loader2, Plus, X, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, AlertTriangle, HelpCircle, Save, Wand2,
  Sparkles, FileText, StickyNote, Image as ImageIcon, RotateCcw,
  Edit3, Hash, Copy, Upload,
} from 'lucide-react'

interface DesktopEvaluatorPanelProps {
  propertyId: string
  /** Called after a report is successfully generated & linked */
  onReportGenerated?: (report: any) => void
}

/**
 * Desktop version of the EvaluatorPanel.
 * Full interactive evaluation flow:
 *   1. Start evaluation → draft with blank checklist
 *   2. Upload photos → AI fills checklist
 *   3. Manual edits on any item
 *   4. Extra notes
 *   5. Generate final report → auto-linked to this property
 */
export default function DesktopEvaluatorPanel({ propertyId, onReportGenerated }: DesktopEvaluatorPanelProps) {
  // Core state
  const [evaluationId, setEvaluationId] = useState<string | null>(null)
  const [reportNumber, setReportNumber] = useState<string | null>(null)
  const [checklist, setChecklist] = useState<any[]>([])
  const [extraNotes, setExtraNotes] = useState<string[]>([])
  const [newNote, setNewNote] = useState('')
  const [status, setStatus] = useState<'idle' | 'draft' | 'completed'>('idle')
  const [isLoading, setIsLoading] = useState(false)
  const [isAnalyzing, setIsAnalyzing] = useState(false)
  const [isGenerating, setIsGenerating] = useState(false)
  const [completedReport, setCompletedReport] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)
  const [editingItem, setEditingItem] = useState<string | null>(null)
  const [editNote, setEditNote] = useState('')
  const [photos, setPhotos] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [showChecklist, setShowChecklist] = useState(true)
  const [showPhotos, setShowPhotos] = useState(true)
  const [showExtraNotes, setShowExtraNotes] = useState(false)
  const [copiedNumber, setCopiedNumber] = useState(false)

  // Linking existing report
  const [linkMode, setLinkMode] = useState(false)
  const [linkReportNumber, setLinkReportNumber] = useState('')
  const [linking, setLinking] = useState(false)

  const fileInputRef = useRef<HTMLInputElement>(null)

  // ─── Start new evaluation ───
  const startEvaluation = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/evaluations', { method: 'POST' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()
      setEvaluationId(data.id)
      setReportNumber(data.report_number)
      setChecklist(data.checklist || [])
      setExtraNotes(data.extra_notes || [])
      setStatus('draft')
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsLoading(false)
    }
  }

  // ─── Link existing report by number ───
  const linkExistingReport = async () => {
    if (!linkReportNumber.trim()) return
    setLinking(true)
    setError(null)
    try {
      // Find report by number
      const lookupRes = await fetch(`/api/evaluations/by-number/${linkReportNumber.trim().toUpperCase()}`)
      if (!lookupRes.ok) {
        setError('Reporte no encontrado. Verifica el número.')
        return
      }
      const report = await lookupRes.json()

      // Link to this property
      const linkRes = await fetch(`/api/evaluations/${report.id}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })
      if (!linkRes.ok) {
        setError('Error al vincular el reporte.')
        return
      }

      // If report is completed, show completed state
      if (report.status === 'completed') {
        setCompletedReport(report)
        setStatus('completed')
        onReportGenerated?.(report)
      } else {
        // Load draft for editing
        setEvaluationId(report.id)
        setReportNumber(report.report_number)
        setChecklist(report.checklist || [])
        setExtraNotes(report.extra_notes || [])
        setStatus('draft')
      }
      setLinkMode(false)
      setLinkReportNumber('')
    } catch (err: any) {
      setError(err.message || 'Error de conexión')
    } finally {
      setLinking(false)
    }
  }

  // ─── Handle file selection ───
  const handleFiles = (files: FileList | null) => {
    if (!files) return
    const newFiles = Array.from(files)
    setPhotos(prev => [...prev, ...newFiles])
    newFiles.forEach(file => {
      const reader = new FileReader()
      reader.onload = (e) => setPreviews(prev => [...prev, e.target?.result as string])
      reader.readAsDataURL(file)
    })
  }

  // ─── Upload photos for AI analysis ───
  const analyzePhotos = async () => {
    if (!evaluationId || photos.length === 0) return
    setIsAnalyzing(true)
    setError(null)
    try {
      const formData = new FormData()
      photos.forEach(p => formData.append('files', p))
      const res = await fetch(`/api/evaluations/${evaluationId}/analyze-photos`, {
        method: 'POST',
        body: formData,
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: `Error ${res.status}` }))
        throw new Error(err.detail || `Error ${res.status}`)
      }
      const data = await res.json()
      setChecklist(data.checklist || [])
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsAnalyzing(false)
    }
  }

  // ─── Update a single checklist item ───
  const updateChecklistItem = async (itemId: string, newStatus: string, note?: string) => {
    const updated = checklist.map(item =>
      item.id === itemId
        ? { ...item, status: newStatus, confidence: 'high', note: note !== undefined ? note : item.note }
        : item
    )
    setChecklist(updated)
    setEditingItem(null)
    if (evaluationId) {
      fetch(`/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist: updated }),
      }).catch(() => {})
    }
  }

  // ─── Extra notes ───
  const addExtraNote = async () => {
    if (!newNote.trim() || !evaluationId) return
    const updated = [...extraNotes, newNote.trim()]
    setExtraNotes(updated)
    setNewNote('')
    fetch(`/api/evaluations/${evaluationId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ extra_notes: updated }),
    }).catch(() => {})
  }

  const removeExtraNote = (idx: number) => {
    const updated = extraNotes.filter((_, i) => i !== idx)
    setExtraNotes(updated)
    if (evaluationId) {
      fetch(`/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ extra_notes: updated }),
      }).catch(() => {})
    }
  }

  // ─── Generate final report ───
  const generateReport = async () => {
    if (!evaluationId) return
    setIsGenerating(true)
    setError(null)
    try {
      // Save final checklist + notes
      await fetch(`/api/evaluations/${evaluationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ checklist, extra_notes: extraNotes }),
      })

      // Generate report
      const res = await fetch(`/api/evaluations/${evaluationId}/generate-report`, { method: 'POST' })
      if (!res.ok) throw new Error(`Error ${res.status}`)
      const data = await res.json()

      // Auto-link to this property
      await fetch(`/api/evaluations/${evaluationId}/link`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ property_id: propertyId }),
      })

      setCompletedReport(data)
      setStatus('completed')
      onReportGenerated?.(data)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setIsGenerating(false)
    }
  }

  const resetAll = () => {
    setEvaluationId(null)
    setReportNumber(null)
    setChecklist([])
    setExtraNotes([])
    setNewNote('')
    setStatus('idle')
    setCompletedReport(null)
    setPhotos([])
    setPreviews([])
    setError(null)
    setEditingItem(null)
    setCopiedNumber(false)
  }

  const copyReportNumber = () => {
    const num = completedReport?.report_number || reportNumber
    if (num) {
      navigator.clipboard?.writeText(num).catch(() => {})
      setCopiedNumber(true)
      setTimeout(() => setCopiedNumber(false), 2000)
    }
  }

  // ─── Status helpers ───
  const getStatusIcon = (s: string) => {
    switch (s) {
      case 'pass': return <CheckCircle2 className="w-4 h-4 text-emerald-500" />
      case 'fail': return <XCircle className="w-4 h-4 text-red-500" />
      case 'warning': return <AlertTriangle className="w-4 h-4 text-amber-500" />
      case 'needs_photo': return <Camera className="w-4 h-4 text-blue-500" />
      case 'not_evaluable': return <HelpCircle className="w-4 h-4 text-gray-400" />
      case 'pending': return <HelpCircle className="w-4 h-4 text-gray-300" />
      default: return <HelpCircle className="w-4 h-4 text-gray-300" />
    }
  }

  const getStatusColor = (s: string) => {
    switch (s) {
      case 'pass': return 'bg-emerald-50 border-emerald-200'
      case 'fail': return 'bg-red-50 border-red-200'
      case 'warning': return 'bg-amber-50 border-amber-200'
      case 'needs_photo': return 'bg-blue-50 border-blue-200'
      case 'pending': return 'bg-gray-50 border-gray-200'
      default: return 'bg-gray-50 border-gray-200'
    }
  }

  const STATUS_OPTIONS = [
    { value: 'pass', label: '✅ Aprobado', color: 'bg-emerald-50 text-emerald-700 border-emerald-300' },
    { value: 'fail', label: '❌ Falla', color: 'bg-red-50 text-red-700 border-red-300' },
    { value: 'warning', label: '⚠️ Alerta', color: 'bg-amber-50 text-amber-700 border-amber-300' },
    { value: 'needs_photo', label: '📸 Necesita foto', color: 'bg-blue-50 text-blue-700 border-blue-300' },
    { value: 'not_evaluable', label: '—  N/A', color: 'bg-gray-50 text-gray-500 border-gray-300' },
  ]

  const categoryIcons: Record<string, string> = {
    'Estructura': '🏗️', 'Instalaciones': '⚡', 'Documentación': '📄',
    'Financiero': '💰', 'Especificaciones': '📋', 'Cierre': '🔑',
  }

  // Group checklist
  const groupedChecklist = checklist.reduce((acc: Record<string, any[]>, item: any) => {
    const cat = item.category || 'Otro'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {})

  // Summary
  const summary = {
    total: checklist.length,
    passed: checklist.filter(i => i.status === 'pass').length,
    failed: checklist.filter(i => i.status === 'fail').length,
    warnings: checklist.filter(i => i.status === 'warning').length,
    needs_photo: checklist.filter(i => i.status === 'needs_photo').length,
    pending: checklist.filter(i => i.status === 'pending').length,
    not_evaluable: checklist.filter(i => i.status === 'not_evaluable').length,
  }

  const getRecStyle = (rec: string) => {
    if (rec === 'COMPRAR') return 'bg-emerald-50 border-emerald-200 text-emerald-700'
    if (rec === 'NO COMPRAR') return 'bg-red-50 border-red-200 text-red-700'
    return 'bg-amber-50 border-amber-200 text-amber-700'
  }

  return (
    <div className="card-luxury p-6">
      <h3 className="font-medium text-navy-900 mb-4 flex items-center gap-2">
        <ClipboardCheck className="w-5 h-5 text-gold-500" />
        Evaluación de Casa
        {reportNumber && (
          <span className="ml-auto text-sm font-normal text-navy-500">#{reportNumber}</span>
        )}
      </h3>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => { handleFiles(e.target.files); if (e.target) e.target.value = '' }}
        className="hidden"
      />

      {/* ═══════════ IDLE STATE ═══════════ */}
      {status === 'idle' && !isLoading && (
        <div className="space-y-4">
          {!linkMode ? (
            <div className="text-center py-6 bg-navy-50 rounded-xl border border-navy-100">
              <ClipboardCheck className="w-10 h-10 text-gold-500 mx-auto mb-3" />
              <h4 className="text-base font-semibold text-navy-900 mb-1">Evaluación de 28 puntos</h4>
              <p className="text-sm text-navy-500 mb-4 max-w-md mx-auto">
                Evalúa la condición de la casa con fotos y el checklist de Maninos.<br />
                La IA analiza las fotos y rellena lo que detecte.
              </p>
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={startEvaluation}
                  className="flex items-center gap-2 px-5 py-2.5 bg-gold-500 text-white rounded-lg font-medium hover:bg-gold-600 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Iniciar Nueva Evaluación
                </button>
                <button
                  onClick={() => setLinkMode(true)}
                  className="flex items-center gap-2 px-5 py-2.5 border border-navy-200 text-navy-700 rounded-lg font-medium hover:bg-navy-50 transition-colors"
                >
                  <Hash className="w-4 h-4" />
                  Vincular por Número
                </button>
              </div>
              <div className="mt-5 grid grid-cols-5 gap-2 max-w-lg mx-auto text-[11px] text-navy-500">
                {[
                  { n: '1', t: 'Iniciar evaluación' },
                  { n: '2', t: 'Subir fotos' },
                  { n: '3', t: 'IA rellena checklist' },
                  { n: '4', t: 'Revisar / editar' },
                  { n: '5', t: 'Generar reporte' },
                ].map(step => (
                  <div key={step.n} className="text-center">
                    <div className="w-6 h-6 rounded-full bg-gold-100 text-gold-600 text-xs font-bold flex items-center justify-center mx-auto mb-1">
                      {step.n}
                    </div>
                    {step.t}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            // Link mode
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl p-5">
              <h4 className="text-sm font-semibold text-indigo-800 mb-2 flex items-center gap-2">
                <Hash className="w-4 h-4" />
                Vincular Reporte Existente
              </h4>
              <p className="text-xs text-indigo-600 mb-3">
                ¿Ya hiciste la evaluación desde el móvil? Ingresa el número de reporte para vincularla a esta propiedad.
              </p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={linkReportNumber}
                  onChange={e => setLinkReportNumber(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') linkExistingReport() }}
                  placeholder="Ej: EVL-260216-001"
                  className="flex-1 px-3 py-2 border border-indigo-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-400"
                  autoFocus
                />
                <button
                  onClick={linkExistingReport}
                  disabled={linking || !linkReportNumber.trim()}
                  className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors flex items-center gap-2"
                >
                  {linking ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                  Vincular
                </button>
                <button
                  onClick={() => { setLinkMode(false); setLinkReportNumber('') }}
                  className="px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {isLoading && (
        <div className="text-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-gold-500 mx-auto mb-2" />
          <p className="text-sm text-navy-500">Creando evaluación...</p>
        </div>
      )}

      {/* ═══════════ DRAFT STATE ═══════════ */}
      {status === 'draft' && (
        <div className="space-y-5">
          {/* Report Number Banner */}
          <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-xs text-indigo-600 uppercase tracking-wider font-medium">Número de Reporte</p>
              <p className="text-xl font-bold text-navy-900 tracking-wider">{reportNumber}</p>
            </div>
            <button
              onClick={copyReportNumber}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-100 border border-indigo-200 text-indigo-700 rounded-lg text-xs font-medium hover:bg-indigo-200 transition-colors"
            >
              {copiedNumber ? <><CheckCircle2 className="w-3.5 h-3.5" /> Copiado</> : <><Copy className="w-3.5 h-3.5" /> Copiar</>}
            </button>
          </div>

          {/* Summary Stats */}
          {checklist.length > 0 && (
            <div className="grid grid-cols-6 gap-2">
              {[
                { n: summary.passed, l: 'Aprobado', c: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
                { n: summary.failed, l: 'Falla', c: 'text-red-700 bg-red-50 border-red-200' },
                { n: summary.warnings, l: 'Alerta', c: 'text-amber-700 bg-amber-50 border-amber-200' },
                { n: summary.needs_photo, l: 'Foto', c: 'text-blue-700 bg-blue-50 border-blue-200' },
                { n: summary.pending, l: 'Pendiente', c: 'text-gray-600 bg-gray-50 border-gray-200' },
                { n: summary.not_evaluable, l: 'N/A', c: 'text-gray-400 bg-gray-50 border-gray-100' },
              ].map((s, i) => (
                <div key={i} className={`border rounded-lg p-2 text-center ${s.c}`}>
                  <p className="text-lg font-bold">{s.n}</p>
                  <p className="text-[10px] font-medium">{s.l}</p>
                </div>
              ))}
            </div>
          )}

          {/* ─── PHOTOS SECTION ─── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowPhotos(!showPhotos)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <Camera className="w-4 h-4 text-gold-500" />
                <span className="text-sm font-semibold text-navy-900">Fotos ({photos.length})</span>
              </div>
              {showPhotos ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showPhotos && (
              <div className="p-4 space-y-3">
                {previews.length > 0 && (
                  <div className="grid grid-cols-6 gap-2">
                    {previews.map((p, i) => (
                      <div key={i} className="relative aspect-square rounded-lg overflow-hidden group">
                        <img src={p} alt={`Foto ${i + 1}`} className="w-full h-full object-cover" />
                        <button
                          onClick={() => { setPhotos(prev => prev.filter((_, j) => j !== i)); setPreviews(prev => prev.filter((_, j) => j !== i)) }}
                          className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="flex items-center gap-2 px-4 py-2.5 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-600 hover:border-gold-400 hover:text-gold-700 transition-colors"
                  >
                    <Upload className="w-4 h-4" />
                    Agregar Fotos
                  </button>
                  <button
                    onClick={analyzePhotos}
                    disabled={photos.length === 0 || isAnalyzing}
                    className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors"
                  >
                    {isAnalyzing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />}
                    {isAnalyzing ? 'Analizando...' : `IA Analizar (${photos.length} fotos)`}
                  </button>
                </div>
                <p className="text-[11px] text-gray-400">La IA rellena el checklist con lo que detecte en las fotos. Puedes editar cualquier punto después.</p>
              </div>
            )}
          </div>

          {isAnalyzing && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-5 text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500 mx-auto mb-2" />
              <p className="text-sm font-medium text-blue-800">Analizando {photos.length} fotos con IA...</p>
              <p className="text-xs text-blue-600">15-30 segundos. Los ítems que ya editaste se mantienen.</p>
            </div>
          )}

          {/* ─── EDITABLE CHECKLIST ─── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowChecklist(!showChecklist)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <ClipboardCheck className="w-4 h-4 text-gold-500" />
                <span className="text-sm font-semibold text-navy-900">Checklist ({checklist.length} puntos)</span>
              </div>
              {showChecklist ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showChecklist && (
              <div>
                {Object.entries(groupedChecklist).map(([category, items]: [string, any[]]) => {
                  const catPassed = items.filter(i => i.status === 'pass').length
                  return (
                    <div key={category}>
                      <div className="bg-gray-100 px-4 py-2 flex items-center gap-2 border-t border-gray-200">
                        <span className="text-sm">{categoryIcons[category] || '📌'}</span>
                        <span className="text-xs font-semibold text-navy-700">{category}</span>
                        <span className="text-[10px] text-gray-500 ml-auto">{catPassed}/{items.length} ✓</span>
                      </div>
                      <div className="divide-y divide-gray-100">
                        {items.map((item: any) => (
                          <div key={item.id} className={`px-4 py-3 ${getStatusColor(item.status)} border-l-4 ${
                            item.status === 'pass' ? 'border-l-emerald-400' :
                            item.status === 'fail' ? 'border-l-red-400' :
                            item.status === 'warning' ? 'border-l-amber-400' :
                            item.status === 'needs_photo' ? 'border-l-blue-400' :
                            'border-l-gray-200'
                          }`}>
                            <div className="flex items-start gap-3">
                              <div className="mt-0.5 flex-shrink-0">{getStatusIcon(item.status)}</div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="text-sm font-medium text-navy-800 flex-1">{item.label}</p>
                                  <button
                                    onClick={() => { setEditingItem(editingItem === item.id ? null : item.id); setEditNote(item.note || '') }}
                                    className="p-1.5 rounded-lg hover:bg-white/50 transition-colors"
                                    title="Editar"
                                  >
                                    <Edit3 className="w-3.5 h-3.5 text-gray-400 hover:text-navy-600" />
                                  </button>
                                </div>
                                {item.note && editingItem !== item.id && (
                                  <p className="text-xs text-gray-500 mt-0.5">{item.note}</p>
                                )}
                              </div>
                            </div>

                            {/* Inline edit */}
                            {editingItem === item.id && (
                              <div className="mt-3 ml-7 space-y-2">
                                <div className="flex flex-wrap gap-1.5">
                                  {STATUS_OPTIONS.map(opt => (
                                    <button
                                      key={opt.value}
                                      onClick={() => updateChecklistItem(item.id, opt.value, editNote || item.note)}
                                      className={`text-xs px-2.5 py-1.5 rounded-lg border transition-all ${
                                        item.status === opt.value
                                          ? opt.color + ' font-bold ring-2 ring-offset-1'
                                          : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
                                      }`}
                                    >
                                      {opt.label}
                                    </button>
                                  ))}
                                </div>
                                <div className="flex gap-2">
                                  <input
                                    type="text"
                                    value={editNote}
                                    onChange={e => setEditNote(e.target.value)}
                                    placeholder="Nota (opcional)"
                                    className="flex-1 bg-white border border-gray-200 rounded-lg px-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-gold-400"
                                  />
                                  <button
                                    onClick={() => updateChecklistItem(item.id, item.status, editNote)}
                                    className="bg-gold-100 border border-gold-300 text-gold-700 rounded-lg px-3 py-1.5 text-xs font-medium hover:bg-gold-200 transition-colors"
                                  >
                                    <Save className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

          {/* ─── EXTRA NOTES ─── */}
          <div className="border border-gray-200 rounded-xl overflow-hidden">
            <button
              onClick={() => setShowExtraNotes(!showExtraNotes)}
              className="w-full px-4 py-3 flex items-center justify-between bg-gray-50 hover:bg-gray-100 transition-colors"
            >
              <div className="flex items-center gap-2">
                <StickyNote className="w-4 h-4 text-purple-500" />
                <span className="text-sm font-semibold text-navy-900">Notas Extra ({extraNotes.length})</span>
              </div>
              {showExtraNotes ? <ChevronUp className="w-4 h-4 text-gray-400" /> : <ChevronDown className="w-4 h-4 text-gray-400" />}
            </button>
            {showExtraNotes && (
              <div className="p-4 space-y-2">
                <p className="text-xs text-gray-500">Observaciones adicionales que no están en el checklist estándar</p>
                {extraNotes.map((note, i) => (
                  <div key={i} className="flex items-start gap-2 bg-purple-50 border border-purple-100 rounded-lg p-3">
                    <span className="text-xs text-purple-600 font-bold mt-0.5">{i + 1}.</span>
                    <p className="text-xs text-navy-700 flex-1">{note}</p>
                    <button onClick={() => removeExtraNote(i)} className="text-gray-400 hover:text-red-500 transition-colors p-0.5">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newNote}
                    onChange={e => setNewNote(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') addExtraNote() }}
                    placeholder="Ej: Hay que cambiar todo el suelo de la cocina"
                    className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-purple-400"
                  />
                  <button
                    onClick={addExtraNote}
                    disabled={!newNote.trim()}
                    className="bg-purple-100 border border-purple-200 text-purple-700 rounded-lg px-3 py-2 disabled:opacity-30 hover:bg-purple-200 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ─── ACTION BUTTONS ─── */}
          <div className="flex items-center gap-3">
            <button
              onClick={generateReport}
              disabled={isGenerating || summary.pending === summary.total}
              className="flex-1 flex items-center justify-center gap-2 px-5 py-3 bg-gold-500 text-white rounded-lg font-medium hover:bg-gold-600 disabled:opacity-40 transition-colors"
            >
              {isGenerating ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
              {isGenerating ? 'Generando Reporte...' : 'Generar Reporte Final'}
            </button>
            <button
              onClick={resetAll}
              className="px-4 py-3 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
              title="Descartar y empezar de nuevo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
          {summary.pending > 0 && summary.pending < summary.total && (
            <p className="text-xs text-amber-600 text-center">{summary.pending} puntos pendientes — puedes generar el reporte así o completarlos</p>
          )}
          {summary.pending === summary.total && (
            <p className="text-xs text-gray-400 text-center">Sube fotos o edita el checklist para poder generar el reporte</p>
          )}
        </div>
      )}

      {/* ═══════════ COMPLETED STATE ═══════════ */}
      {status === 'completed' && completedReport && (
        <div className="space-y-5">
          {/* Score & Recommendation */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className={`p-4 rounded-lg border text-center ${getRecStyle(completedReport.recommendation)}`}>
              <div className="text-xs uppercase tracking-wider opacity-70 mb-1">Recomendación AI</div>
              <div className="text-lg font-bold flex items-center justify-center gap-1.5">
                {completedReport.recommendation === 'COMPRAR' && <Sparkles className="w-5 h-5" />}
                {completedReport.recommendation === 'NO COMPRAR' && <XCircle className="w-5 h-5" />}
                {completedReport.recommendation === 'REVISAR CON CUIDADO' && <AlertTriangle className="w-5 h-5" />}
                {completedReport.recommendation || 'Sin recomendación'}
              </div>
            </div>
            <div className="p-4 rounded-lg border bg-blue-50 border-blue-200 text-center">
              <div className="text-xs uppercase tracking-wider text-navy-500 mb-1">Puntuación</div>
              <div className="text-2xl font-bold text-blue-700">{completedReport.score ?? '—'}<span className="text-sm font-normal">/100</span></div>
            </div>
            <div className="p-4 rounded-lg border bg-gray-50 border-gray-200 text-center">
              <div className="text-xs uppercase tracking-wider text-navy-500 mb-1">Reporte</div>
              <div className="flex items-center justify-center gap-2">
                <span className="text-lg font-bold text-navy-900">#{completedReport.report_number}</span>
                <button onClick={copyReportNumber} className="p-1 hover:bg-gray-200 rounded transition-colors">
                  {copiedNumber ? <CheckCircle2 className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4 text-gray-400" />}
                </button>
              </div>
            </div>
          </div>

          {/* Recommendation Reason */}
          {completedReport.recommendation_reason && (
            <div className="p-4 bg-navy-50 rounded-lg border border-navy-200">
              <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                <Sparkles className="w-3 h-3" /> Análisis AI
              </div>
              <p className="text-sm text-navy-700">{completedReport.recommendation_reason}</p>
            </div>
          )}

          {/* AI Summary */}
          {completedReport.ai_summary && (
            <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
              <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> Resumen AI
              </div>
              <p className="text-sm text-navy-700 whitespace-pre-wrap">{completedReport.ai_summary}</p>
            </div>
          )}

          {/* Checklist Summary */}
          {completedReport.checklist && completedReport.checklist.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-navy-700 mb-3">Checklist ({completedReport.checklist.length} puntos)</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {completedReport.checklist.map((item: any) => (
                  <div key={item.id} className={`p-3 rounded-lg border ${getStatusColor(item.status)}`}>
                    <div className="flex items-center gap-2">
                      {getStatusIcon(item.status)}
                      <span className="text-sm font-medium text-navy-800">{item.label}</span>
                    </div>
                    {item.note && (
                      <p className="text-xs text-navy-500 mt-1 ml-6">{item.note}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Extra Notes */}
          {(completedReport.extra_notes || []).length > 0 && (
            <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-xs uppercase tracking-wider text-navy-500 mb-1 flex items-center gap-1">
                <StickyNote className="w-3 h-3" /> Notas del Empleado
              </div>
              <ul className="text-sm text-navy-700 list-disc list-inside space-y-1">
                {(completedReport.extra_notes as string[]).map((note: string, i: number) => (
                  <li key={i}>{note}</li>
                ))}
              </ul>
            </div>
          )}

          {/* New Evaluation */}
          <button
            onClick={resetAll}
            className="flex items-center justify-center gap-2 w-full py-2.5 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors text-sm"
          >
            <RotateCcw className="w-4 h-4" /> Nueva Evaluación
          </button>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="mt-4 bg-red-50 border border-red-200 rounded-lg p-4 flex items-start gap-3">
          <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-medium text-red-700">Error</p>
            <p className="text-xs text-red-600 mt-0.5">{error}</p>
          </div>
          <button onClick={() => setError(null)} className="text-xs text-red-500 hover:text-red-700 font-medium">
            Cerrar
          </button>
        </div>
      )}
    </div>
  )
}

