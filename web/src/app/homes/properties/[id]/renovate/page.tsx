'use client'

import React, { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import {
  ArrowLeft,
  Loader2,
  Save,
  Sparkles,
  Camera,
  FileText,
  Hash,
  Plus,
  Trash2,
  Mic,
  MicOff,
  X,
  DollarSign,
  Wand2,
  FileSpreadsheet,
  Calendar,
  Hammer,
  Package,
  ChevronDown,
  ChevronRight,
  Send,
  CheckCircle2,
  Clock,
  Info,
  ShoppingCart,
  User,
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ============================================
// TYPES — V4 with MO + Mat + Unidad + Subfields + Approval
// ============================================

interface SubfieldDef {
  key: string
  label: string
  type: 'text' | 'number' | 'boolean' | 'select'
  options?: string[]
}

interface RenovationItem {
  id: string
  partida: number
  concepto: string
  mano_obra: number
  materiales: number
  precio: number       // computed = mano_obra + materiales
  dias: number
  start_day: number
  unidad: string       // "día", "proyecto", "casa", "pieza", "ventana"
  notas: string
  responsable?: string
  subfields?: Record<string, any>
  is_custom?: boolean
}

interface QuoteData {
  version: number
  property_id: string
  renovation_id: string | null
  address: string
  square_feet: number | null
  purchase_price: number | null
  has_inspection: boolean
  items: RenovationItem[]
  total: number
  total_mano_obra: number
  total_materiales: number
  dias_estimados: number
  item_subfields?: Record<string, SubfieldDef[]>
  business_rules?: string[]
  responsable?: string
  fecha_inicio?: string
  fecha_fin?: string
  approval_status?: string
}

type TabType = 'cotizacion' | 'cronograma'

// Gantt bar colors by partida group
const GANTT_COLORS: Record<string, string> = {
  demolicion: 'bg-red-400',
  limpieza: 'bg-yellow-400',
  muros: 'bg-blue-400',
  electricidad: 'bg-amber-500',
  techos_ext: 'bg-emerald-500',
  cielos_int: 'bg-emerald-400',
  textura_muros: 'bg-blue-300',
  siding: 'bg-gray-400',
  pisos: 'bg-orange-500',
  gabinetes: 'bg-purple-500',
  pintura_ext: 'bg-pink-500',
  pintura_int: 'bg-pink-400',
  pintura_gab: 'bg-pink-300',
  banos: 'bg-cyan-500',
  cocina: 'bg-cyan-400',
  finishing: 'bg-amber-400',
  plomeria: 'bg-sky-500',
  acabados: 'bg-lime-500',
  cerraduras: 'bg-violet-400',
}

// Short unit labels for column headers
const UNIT_SHORT: Record<string, string> = {
  'día': '/día',
  'proyecto': '/proy',
  'casa': '/casa',
  'pieza': '/pza',
  'ventana': '/vent',
}

// ============================================
// COMPONENT
// ============================================

export default function RenovationPage() {
  const params = useParams()
  const router = useRouter()
  const toast = useToast()
  const propertyId = params.id as string

  // State
  const [quote, setQuote] = useState<QuoteData | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [aiFilling, setAiFilling] = useState(false)
  const [aiAnalysis, setAiAnalysis] = useState<string | null>(null)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showImportReport, setShowImportReport] = useState(false)
  const [importReportNumber, setImportReportNumber] = useState('')
  const [importingReport, setImportingReport] = useState(false)
  const [showAddCustom, setShowAddCustom] = useState(false)
  const [customConcepto, setCustomConcepto] = useState('')
  const [customMO, setCustomMO] = useState('')
  const [customMat, setCustomMat] = useState('')
  const [activeTab, setActiveTab] = useState<TabType>('cotizacion')
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set())
  const [submittingApproval, setSubmittingApproval] = useState(false)

  // Project metadata
  const [projectResponsable, setProjectResponsable] = useState('')
  const [fechaInicio, setFechaInicio] = useState('')
  const [fechaFin, setFechaFin] = useState('')

  // Voice state
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const recognitionRef = useRef<any>(null)

  // Photo upload ref
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ============================================
  // COMPUTED VALUES
  // ============================================

  const totals = quote ? {
    mano_obra: quote.items.reduce((s, i) => s + (i.mano_obra || 0), 0),
    materiales: quote.items.reduce((s, i) => s + (i.materiales || 0), 0),
    total: quote.items.reduce((s, i) => s + (i.precio || 0), 0),
    dias: Math.max(...quote.items.map(i => (i.start_day || 1) + (i.dias || 1)), 0),
  } : { mano_obra: 0, materiales: 0, total: 0, dias: 0 }

  // Max day for Gantt chart
  const maxDay = Math.max(...(quote?.items.map(i => (i.start_day || 1) + (i.dias || 1) - 1) || [1]), 1)

  const approvalStatus = quote?.approval_status || 'draft'

  // ============================================
  // DATA FETCHING
  // ============================================

  useEffect(() => {
    fetchQuote()
  }, [propertyId])

  const fetchQuote = async () => {
    try {
      const res = await fetch(`/api/renovation/${propertyId}/quote`)
      if (res.ok) {
        const data = await res.json()
        // Ensure all items have the new fields (backward compat)
        const items = (data.items || []).map((item: any) => ({
          ...item,
          mano_obra: item.mano_obra ?? item.precio ?? 0,
          materiales: item.materiales ?? 0,
          precio: (item.mano_obra ?? item.precio ?? 0) + (item.materiales ?? 0),
          dias: item.dias ?? 1,
          start_day: item.start_day ?? 1,
          unidad: item.unidad ?? 'proyecto',
          responsable: item.responsable ?? '',
          subfields: item.subfields ?? {},
        }))
        setQuote({ ...data, items })
        setProjectResponsable(data.responsable || '')
        setFechaInicio(data.fecha_inicio || '')
        setFechaFin(data.fecha_fin || '')
      } else {
        toast.error('Error al cargar la cotización')
        router.push(`/homes/properties/${propertyId}`)
      }
    } catch (error) {
      console.error('Error:', error)
      toast.error('Error de conexión')
    } finally {
      setLoading(false)
    }
  }

  // ============================================
  // ITEM UPDATE
  // ============================================

  const updateItem = useCallback((itemId: string, field: keyof RenovationItem, value: number | string) => {
    setQuote(prev => {
      if (!prev) return prev
      const updatedItems = prev.items.map(item => {
        if (item.id !== itemId) return item
        const updated = { ...item, [field]: value }
        // Recompute precio when MO, Mat, or dias changes
        // Formula: (MO × días) + Materiales
        if (field === 'mano_obra' || field === 'materiales' || field === 'dias') {
          const dias = updated.dias || 1
          updated.precio = Math.round(((updated.mano_obra || 0) * dias + (updated.materiales || 0)) * 100) / 100
        }
        return updated
      })
      const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
      const total_mano_obra = updatedItems.reduce((s, i) => s + (i.mano_obra || 0), 0)
      const total_materiales = updatedItems.reduce((s, i) => s + (i.materiales || 0), 0)
      const dias_estimados = Math.max(...updatedItems.map(i => (i.start_day || 1) + (i.dias || 1)))
      return {
        ...prev,
        items: updatedItems,
        total: Math.round(total * 100) / 100,
        total_mano_obra: Math.round(total_mano_obra * 100) / 100,
        total_materiales: Math.round(total_materiales * 100) / 100,
        dias_estimados,
      }
    })
    setHasUnsavedChanges(true)
  }, [])

  const updateSubfield = useCallback((itemId: string, key: string, value: any) => {
    setQuote(prev => {
      if (!prev) return prev
      const updatedItems = prev.items.map(item => {
        if (item.id !== itemId) return item
        return { ...item, subfields: { ...(item.subfields || {}), [key]: value } }
      })
      return { ...prev, items: updatedItems }
    })
    setHasUnsavedChanges(true)
  }, [])

  // ============================================
  // EXPAND/COLLAPSE ROWS
  // ============================================

  const toggleRow = (itemId: string) => {
    setExpandedRows(prev => {
      const next = new Set(prev)
      if (next.has(itemId)) next.delete(itemId)
      else next.add(itemId)
      return next
    })
  }

  // ============================================
  // ADD / REMOVE CUSTOM ITEM
  // ============================================

  const addCustomItem = () => {
    if (!customConcepto.trim()) {
      toast.warning('Ingresa el concepto')
      return
    }
    const nextPartida = (quote?.items.length || 19) + 1
    const mo = parseFloat(customMO) || 0
    const mat = parseFloat(customMat) || 0
    const newItem: RenovationItem = {
      id: `custom_${Date.now()}`,
      partida: nextPartida,
      concepto: customConcepto.trim(),
      mano_obra: mo,
      materiales: mat,
      precio: mo + mat,
      dias: 1,
      start_day: maxDay + 1,
      unidad: 'proyecto',
      notas: '',
      is_custom: true,
    }
    setQuote(prev => {
      if (!prev) return prev
      const items = [...prev.items, newItem]
      const total = items.reduce((s, i) => s + (i.precio || 0), 0)
      const total_mano_obra = items.reduce((s, i) => s + (i.mano_obra || 0), 0)
      const total_materiales = items.reduce((s, i) => s + (i.materiales || 0), 0)
      return {
        ...prev,
        items,
        total: Math.round(total * 100) / 100,
        total_mano_obra: Math.round(total_mano_obra * 100) / 100,
        total_materiales: Math.round(total_materiales * 100) / 100,
      }
    })
    setCustomConcepto('')
    setCustomMO('')
    setCustomMat('')
    setShowAddCustom(false)
    setHasUnsavedChanges(true)
    toast.success('Item personalizado agregado')
  }

  const removeCustomItem = (itemId: string) => {
    setQuote(prev => {
      if (!prev) return prev
      const items = prev.items.filter(i => i.id !== itemId)
      const total = items.reduce((s, i) => s + (i.precio || 0), 0)
      const total_mano_obra = items.reduce((s, i) => s + (i.mano_obra || 0), 0)
      const total_materiales = items.reduce((s, i) => s + (i.materiales || 0), 0)
      return {
        ...prev,
        items,
        total: Math.round(total * 100) / 100,
        total_mano_obra: Math.round(total_mano_obra * 100) / 100,
        total_materiales: Math.round(total_materiales * 100) / 100,
      }
    })
    setHasUnsavedChanges(true)
  }

  // ============================================
  // SAVE
  // ============================================

  const saveQuote = async (submitForApproval = false) => {
    if (!quote) return
    if (submitForApproval) setSubmittingApproval(true)
    else setSaving(true)

    try {
      const itemsPayload: Record<string, any> = {}
      const customItems: any[] = []

      for (const item of quote.items) {
        if (item.is_custom) {
          customItems.push({
            id: item.id,
            partida: item.partida,
            concepto: item.concepto,
            mano_obra: item.mano_obra || 0,
            materiales: item.materiales || 0,
            dias: item.dias || 1,
            start_day: item.start_day || 1,
            notas: item.notas || '',
          })
        } else {
          itemsPayload[item.id] = {
            mano_obra: item.mano_obra || 0,
            materiales: item.materiales || 0,
            dias: item.dias || 1,
            start_day: item.start_day || 1,
            notas: item.notas || '',
            responsable: item.responsable || '',
            subfields: item.subfields || {},
          }
        }
      }

      const res = await fetch(`/api/renovation/${propertyId}/quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: itemsPayload,
          custom_items: customItems,
          notes: '',
          responsable: projectResponsable,
          fecha_inicio: fechaInicio,
          fecha_fin: fechaFin,
          submit_for_approval: submitForApproval,
        }),
      })

      if (res.ok) {
        const result = await res.json()
        if (submitForApproval) {
          setQuote(prev => prev ? { ...prev, approval_status: 'pending_approval' } : prev)
          toast.success('Cotización enviada a aprobación')
        } else {
          toast.success(`Cotización guardada — $${result.total?.toLocaleString() || '0'} (${result.active_items} items)`)
        }
        setHasUnsavedChanges(false)
        // Signal property page to refresh financiero
        localStorage.setItem('renovation_updated', Date.now().toString())
      } else {
        toast.error('Error al guardar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
      setSubmittingApproval(false)
    }
  }

  // ============================================
  // AI AUTO-FILL
  // ============================================

  const runAiFill = async (files?: FileList | null) => {
    setAiFilling(true)
    try {
      const formData = new FormData()
      if (files) {
        Array.from(files).forEach(f => formData.append('files', f))
      }

      const res = await fetch(`/api/renovation/${propertyId}/ai-fill`, {
          method: 'POST',
        body: formData,
      })

      if (res.ok) {
        const result = await res.json()
        setAiAnalysis(result.ai_analysis)

        if (Object.keys(result.suggestions).length > 0) {
          setQuote(prev => {
            if (!prev) return prev
            const updatedItems = prev.items.map(item => {
              const suggestion = result.suggestions[item.id]
              if (suggestion) {
                const mo = suggestion.mano_obra ?? suggestion.precio ?? item.mano_obra
                const mat = suggestion.materiales ?? item.materiales
                return {
                  ...item,
                  mano_obra: mo,
                  materiales: mat,
                  precio: mo + mat,
                  notas: suggestion.notas || item.notas,
                }
              }
              return item
            })
            const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
            const total_mano_obra = updatedItems.reduce((s, i) => s + (i.mano_obra || 0), 0)
            const total_materiales = updatedItems.reduce((s, i) => s + (i.materiales || 0), 0)
            return {
              ...prev,
              items: updatedItems,
              total: Math.round(total * 100) / 100,
              total_mano_obra: Math.round(total_mano_obra * 100) / 100,
              total_materiales: Math.round(total_materiales * 100) / 100,
            }
          })
          setHasUnsavedChanges(true)
          toast.success(`AI sugirió ${result.items_suggested} items`)
        } else {
          toast.info('La AI no encontró reparaciones adicionales')
        }
      } else {
        toast.error('Error en análisis AI')
      }
    } catch (error) {
      toast.error('Error de conexión con AI')
    } finally {
      setAiFilling(false)
    }
  }

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      runAiFill(e.target.files)
    }
  }

  // ============================================
  // IMPORT EVALUATION REPORT
  // ============================================

  const importEvaluationReport = async () => {
    if (!importReportNumber.trim()) {
      toast.error('Ingresa el número de reporte')
      return
    }
    setImportingReport(true)
    try {
      const lookupRes = await fetch(`/api/evaluations/by-number/${importReportNumber.trim()}`)
      if (!lookupRes.ok) {
        toast.error('Reporte de evaluación no encontrado')
        setImportingReport(false)
        return
      }
      const reportData = await lookupRes.json()

      const importRes = await fetch(
        `/api/renovation/${propertyId}/import-report?report_id=${reportData.id}`,
        { method: 'POST' }
      )

      if (!importRes.ok) {
        toast.error('Error al importar el reporte')
        setImportingReport(false)
        return
      }

      const result = await importRes.json()

      if (Object.keys(result.suggestions).length > 0) {
        setQuote(prev => {
          if (!prev) return prev
          const updatedItems = prev.items.map(item => {
            const suggestion = result.suggestions[item.id]
            if (suggestion) {
              const mo = suggestion.mano_obra ?? suggestion.precio ?? item.mano_obra
              const mat = suggestion.materiales ?? item.materiales
              return {
                ...item,
                mano_obra: mo,
                materiales: mat,
                precio: mo + mat,
                notas: suggestion.notas || item.notas,
              }
            }
            return item
          })
          const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
          const total_mano_obra = updatedItems.reduce((s, i) => s + (i.mano_obra || 0), 0)
          const total_materiales = updatedItems.reduce((s, i) => s + (i.materiales || 0), 0)
          return {
            ...prev,
            items: updatedItems,
            total: Math.round(total * 100) / 100,
            total_mano_obra: Math.round(total_mano_obra * 100) / 100,
            total_materiales: Math.round(total_materiales * 100) / 100,
          }
        })
        setHasUnsavedChanges(true)
      }

      setAiAnalysis(result.ai_analysis || `Importado desde Reporte #${result.report_number}`)
      toast.success(`Reporte importado: ${result.items_suggested} items`)
      setShowImportReport(false)
      setImportReportNumber('')
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setImportingReport(false)
    }
  }

  // ============================================
  // VOICE COMMANDS
  // ============================================

  const startVoice = () => {
    if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
      toast.error('Tu navegador no soporta reconocimiento de voz')
      return
    }

    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition
    const recognition = new SpeechRecognition()
    recognition.lang = 'es-MX'
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event: any) => {
      let transcript = ''
      for (let i = event.resultIndex; i < event.results.length; i++) {
        transcript += event.results[i][0].transcript
      }
      setVoiceTranscript(transcript)

      if (event.results[event.resultIndex].isFinal) {
        processVoiceCommand(transcript.toLowerCase().trim())
        setVoiceTranscript('')
      }
    }

    recognition.onerror = () => setIsListening(false)
    recognition.onend = () => setIsListening(false)

    recognitionRef.current = recognition
    recognition.start()
    setIsListening(true)
    toast.info('Escuchando... Di "pon en demolición 500 de materiales" o cualquier comando')
  }

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop()
    setIsListening(false)
    setVoiceTranscript('')
  }

  const [processingVoice, setProcessingVoice] = useState(false)

  const processVoiceCommand = async (text: string) => {
    if (!quote) return

    // Try LLM endpoint first
    setProcessingVoice(true)
    try {
      const res = await fetch('/api/renovation/voice-command', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      })

      if (res.ok) {
        const data = await res.json()
        const actions = data.actions || []

        if (actions.length > 0) {
          for (const action of actions) {
            updateItem(action.item_id, action.field, action.value)
          }
          toast.success(data.message || `${actions.length} cambio(s) aplicado(s)`)
          setProcessingVoice(false)
          return
        } else {
          toast.warning(data.message || 'No pude entender el comando')
          setProcessingVoice(false)
          return
        }
      }
    } catch {
      // LLM failed, fall through to regex fallback
    }
    setProcessingVoice(false)

    // Regex fallback
    processVoiceCommandFallback(text)
  }

  const processVoiceCommandFallback = (text: string) => {
    if (!quote) return

    const numWords: Record<string, number> = {
      'uno': 1, 'una': 1, 'dos': 2, 'tres': 3, 'cuatro': 4, 'cinco': 5,
      'seis': 6, 'siete': 7, 'ocho': 8, 'nueve': 9, 'diez': 10,
      'once': 11, 'doce': 12, 'trece': 13, 'catorce': 14, 'quince': 15,
      'dieciséis': 16, 'diecisiete': 17, 'dieciocho': 18, 'diecinueve': 19,
      'veinte': 20, 'cien': 100, 'doscientos': 200, 'trescientos': 300,
      'cuatrocientos': 400, 'quinientos': 500, 'seiscientos': 600,
      'setecientos': 700, 'ochocientos': 800, 'novecientos': 900, 'mil': 1000,
    }

    const parseNumber = (str: string): number | null => {
      const direct = parseFloat(str.replace(/[,$]/g, ''))
      if (!isNaN(direct)) return direct
      return numWords[str] || null
    }

    // Find partida
    const partidaMatch = text.match(/partida\s+(\w+)/)
    let targetItem: RenovationItem | undefined

    if (partidaMatch) {
      const num = parseNumber(partidaMatch[1])
      if (num) targetItem = quote.items.find(i => i.partida === num)
    }

    // Try by concept name
    if (!targetItem) {
      for (const item of quote.items) {
        if (text.includes(item.concepto.toLowerCase().substring(0, 12))) {
          targetItem = item
          break
        }
      }
    }

    if (!targetItem) {
      toast.warning('No encontré la partida. Di "partida [número]..."')
      return
    }

    // Parse: "mano de obra X", "materiales X", "precio X", or "nota ..."
    const moMatch = text.match(/mano\s*(?:de\s*)?obra\s+(\d[\d,.]*)/)
    const matMatch = text.match(/materiales?\s+(\d[\d,.]*)/)
    const precioMatch = text.match(/precio\s+(\d[\d,.]*)/)
    const notasMatch = text.match(/nota[s]?\s+(.+)/)
    let changed = false

    if (moMatch) {
      const val = parseFloat(moMatch[1].replace(/,/g, ''))
      updateItem(targetItem.id, 'mano_obra', val)
      changed = true
    }
    if (matMatch) {
      const val = parseFloat(matMatch[1].replace(/,/g, ''))
      updateItem(targetItem.id, 'materiales', val)
      changed = true
    }
    if (precioMatch && !moMatch && !matMatch) {
      const val = parseFloat(precioMatch[1].replace(/,/g, ''))
      updateItem(targetItem.id, 'mano_obra', val)
      changed = true
    }
    if (notasMatch) {
      updateItem(targetItem.id, 'notas', notasMatch[1])
      changed = true
    }

    if (changed) {
      toast.success(`Partida ${targetItem.partida}: ${targetItem.concepto} actualizada`)
    } else {
      toast.info(`Partida ${targetItem.partida} encontrada. Di "mano de obra X" o "materiales X"`)
    }
  }

  // ============================================
  // SUBFIELD RENDERER
  // ============================================

  const renderSubfields = (item: RenovationItem) => {
    const subfields = quote?.item_subfields?.[item.id]
    if (!subfields || subfields.length === 0) return null

    return (
      <tr className="bg-blue-50/30">
        <td></td>
        <td colSpan={8} className="px-3 py-2.5">
          <div className="flex flex-wrap gap-3">
            {subfields.map((sf: SubfieldDef) => (
              <div key={sf.key} className="flex items-center gap-1.5">
                <label className="text-[10px] text-gray-500 font-medium whitespace-nowrap">{sf.label}:</label>
                {sf.type === 'boolean' ? (
                  <input
                    type="checkbox"
                    checked={!!item.subfields?.[sf.key]}
                    onChange={(e) => updateSubfield(item.id, sf.key, e.target.checked)}
                    className="rounded border-gray-300 text-gold-500 focus:ring-gold-400"
                  />
                ) : sf.type === 'select' ? (
                  <select
                    value={item.subfields?.[sf.key] || ''}
                    onChange={(e) => updateSubfield(item.id, sf.key, e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs focus:ring-2 focus:ring-gold-400"
                  >
                    <option value="">--</option>
                    {sf.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                  </select>
                ) : (
                  <input
                    type={sf.type === 'number' ? 'number' : 'text'}
                    value={item.subfields?.[sf.key] ?? ''}
                    onChange={(e) => updateSubfield(item.id, sf.key, sf.type === 'number' ? (parseFloat(e.target.value) || '') : e.target.value)}
                    className="border border-gray-200 rounded px-2 py-1 text-xs w-24 focus:ring-2 focus:ring-gold-400"
                    placeholder={sf.label}
                  />
                )}
              </div>
            ))}
          </div>
        </td>
      </tr>
    )
  }

  // ============================================
  // RENDER
  // ============================================

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  if (!quote) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">No se pudo cargar la cotización</p>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href={`/homes/properties/${propertyId}`} className="text-gray-500 hover:text-navy-700">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
              <h1 className="text-lg font-bold text-navy-900">Cotización de Renovación</h1>
              <p className="text-xs text-gray-500">{quote.address}</p>
              </div>
            </div>
          <div className="flex items-center gap-2">
            {/* Approval status badge */}
            {approvalStatus === 'pending_approval' && (
              <span className="flex items-center gap-1 text-xs bg-amber-100 text-amber-700 px-2.5 py-1 rounded-full font-medium">
                <Clock className="w-3 h-3" /> Pendiente
              </span>
            )}
            {approvalStatus === 'approved' && (
              <span className="flex items-center gap-1 text-xs bg-green-100 text-green-700 px-2.5 py-1 rounded-full font-medium">
                <CheckCircle2 className="w-3 h-3" /> Aprobada
              </span>
            )}

            {/* Voice */}
              <button
              onClick={isListening ? stopVoice : startVoice}
              className={`p-2 rounded-lg border transition-all ${
                isListening
                  ? 'bg-red-50 border-red-300 text-red-600 animate-pulse'
                  : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
              title={isListening ? 'Detener voz' : 'Comandos de voz'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
              </button>

            {/* Save */}
                  <button
              onClick={() => saveQuote(false)}
              disabled={saving || !hasUnsavedChanges}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all ${
                hasUnsavedChanges
                  ? 'bg-gold-500 text-white hover:bg-gold-600'
                  : 'bg-gray-100 text-gray-400 cursor-not-allowed'
              }`}
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Guardando...' : hasUnsavedChanges ? 'Guardar' : 'Guardado'}
                  </button>
                </div>
                        </div>

        {/* Voice bar */}
        {isListening && (
          <div className="bg-red-50 border-t border-red-200 px-4 py-2 flex items-center gap-2">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-sm text-red-700">
              {processingVoice ? 'Procesando comando...' : voiceTranscript || 'Escuchando... Di cualquier comando de renovación'}
                        </span>
                      </div>
        )}
                    </div>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">

        {/* Project metadata header */}
        <div className="card-luxury p-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Responsable del Proyecto</label>
              <div className="relative mt-1">
                <User className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400" />
                <input
                  type="text"
                  value={projectResponsable}
                  onChange={(e) => { setProjectResponsable(e.target.value); setHasUnsavedChanges(true) }}
                  className="w-full pl-8 pr-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                  placeholder="Nombre del responsable"
                />
              </div>
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Fecha Inicio</label>
              <input
                type="date"
                value={fechaInicio}
                onChange={(e) => { setFechaInicio(e.target.value); setHasUnsavedChanges(true) }}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">Fecha Fin</label>
              <input
                type="date"
                value={fechaFin}
                onChange={(e) => { setFechaFin(e.target.value); setHasUnsavedChanges(true) }}
                className="w-full mt-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
              />
            </div>
          </div>
        </div>

        {/* Summary cards: MO | Mat | Total | Compra | Días */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-800 font-medium mb-1 text-sm">
              <Hammer className="w-4 h-4" />
              Mano de Obra
            </div>
            <p className="text-xl font-bold text-navy-900 font-mono">
              ${totals.mano_obra.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </p>
          </div>

          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-800 font-medium mb-1 text-sm">
              <Package className="w-4 h-4" />
              Materiales
            </div>
            <p className="text-xl font-bold text-navy-900 font-mono">
              ${totals.materiales.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </p>
          </div>

          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-green-700 font-medium mb-1 text-sm">
              <DollarSign className="w-4 h-4" />
              Total Renovación
            </div>
            <p className="text-xl font-bold text-green-700 font-mono">
              ${totals.total.toLocaleString('en-US', { minimumFractionDigits: 0 })}
            </p>
          </div>

          {quote.purchase_price ? (
            <div className="card-luxury p-4">
              <div className="flex items-center gap-2 text-navy-800 font-medium mb-1 text-sm">
                <ShoppingCart className="w-4 h-4" />
                Precio Compra
              </div>
              <p className="text-xl font-bold text-navy-900 font-mono">
                ${(quote.purchase_price || 0).toLocaleString('en-US', { minimumFractionDigits: 0 })}
              </p>
            </div>
          ) : (
            <div className="card-luxury p-4">
              <div className="flex items-center gap-2 text-navy-800 font-medium mb-1 text-sm">
                <ShoppingCart className="w-4 h-4" />
                Precio Compra
              </div>
              <p className="text-xl font-bold text-gray-300 font-mono">N/A</p>
            </div>
          )}

          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-800 font-medium mb-1 text-sm">
              <Calendar className="w-4 h-4" />
              Días Estimados
            </div>
            <p className="text-xl font-bold text-navy-900">
              {totals.dias} días
            </p>
          </div>
        </div>

        {/* AI tools row + business rules */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={aiFilling}
            className="flex items-center gap-1.5 px-3 py-2 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm hover:bg-purple-100 transition-all"
          >
            {aiFilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
            AI Fotos
          </button>
          <button
            onClick={() => setShowImportReport(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 transition-all"
          >
            <FileText className="w-3.5 h-3.5" />
            Importar Reporte
          </button>

          {/* Business rules tooltip */}
          <div className="relative group ml-auto">
            <button className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600">
              <Info className="w-3.5 h-3.5" />
              Reglas de materiales
            </button>
            <div className="absolute right-0 top-full mt-1 w-72 bg-white border border-gray-200 rounded-lg shadow-lg p-3 hidden group-hover:block z-20">
              <p className="text-xs font-semibold text-navy-900 mb-2">Reglas de Negocio</p>
              <ul className="text-[11px] text-gray-600 space-y-1">
                {(quote.business_rules || []).map((rule, i) => (
                  <li key={i} className="flex gap-1">
                    <span className="text-amber-500 flex-shrink-0">*</span>
                    {rule}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={handlePhotoUpload}
          />
        </div>

        {/* AI Analysis Banner */}
        {aiAnalysis && (
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
            <div className="flex items-start gap-2">
              <Wand2 className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                  <div>
                <p className="font-medium text-purple-900">Análisis AI</p>
                <p className="text-sm text-purple-700 mt-1">{aiAnalysis}</p>
                  </div>
              <button onClick={() => setAiAnalysis(null)} className="text-purple-400 hover:text-purple-600 ml-auto">
                <X className="w-4 h-4" />
              </button>
                  </div>
                  </div>
        )}

        {/* TAB SWITCHER */}
        <div className="flex border-b border-gray-200">
          <button
            onClick={() => setActiveTab('cotizacion')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cotizacion'
                ? 'border-gold-500 text-gold-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Cotización
          </button>
          <button
            onClick={() => setActiveTab('cronograma')}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === 'cronograma'
                ? 'border-gold-500 text-gold-700'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <Calendar className="w-4 h-4 inline mr-1.5 -mt-0.5" />
            Cronograma
          </button>
        </div>

        {/* ============================================ */}
        {/* TAB: COTIZACIÓN */}
        {/* ============================================ */}
        {activeTab === 'cotizacion' && (
          <>
            {/* DESKTOP TABLE */}
            <div className="card-luxury overflow-hidden hidden md:block">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-navy-900 text-white">
                      <th className="px-2 py-3 w-8"></th>
                      <th className="px-3 py-3 text-left font-semibold w-12">#</th>
                      <th className="px-3 py-3 text-left font-semibold">Concepto</th>
                      <th className="px-3 py-3 text-right font-semibold w-28">MO ($)</th>
                      <th className="px-3 py-3 text-right font-semibold w-28">Mat ($)</th>
                      <th className="px-3 py-3 text-right font-semibold w-24">Total</th>
                      <th className="px-3 py-3 text-center font-semibold w-16">Días</th>
                      <th className="px-3 py-3 text-left font-semibold w-28">Responsable</th>
                      <th className="px-3 py-3 text-left font-semibold w-44">Notas</th>
                      <th className="px-2 py-3 w-10 text-center font-semibold" title="Enviar orden de pago">
                        <DollarSign className="w-3.5 h-3.5 mx-auto text-gray-400" />
                      </th>
                      {quote.items.some(i => i.is_custom) && (
                        <th className="px-2 py-3 w-10"></th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {quote.items.map((item) => {
                      const hasSubfields = !!(quote.item_subfields?.[item.id]?.length)
                      const isExpanded = expandedRows.has(item.id)

                      return (
                        <React.Fragment key={item.id}>
                          <tr
                            className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${
                              item.precio > 0 ? 'bg-green-50/20' : ''
                            } ${item.is_custom ? 'bg-amber-50/30' : ''}`}
                          >
                            {/* Expand toggle */}
                            <td className="px-2 py-2.5 text-center">
                              {hasSubfields ? (
                                <button
                                  onClick={() => toggleRow(item.id)}
                                  className="text-gray-400 hover:text-navy-600 transition-colors"
                                >
                                  {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              ) : null}
                            </td>
                            <td className="px-3 py-2.5 text-center font-bold text-navy-700">
                              {item.partida}
                            </td>
                            <td className="px-3 py-2.5">
                              <span className="font-medium text-navy-900 text-xs">{item.concepto}</span>
                              {item.is_custom && (
                                <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                                  Custom
                                </span>
                              )}
                              {item.unidad && (
                                <span className="ml-1.5 text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                  {UNIT_SHORT[item.unidad] || `/${item.unidad}`}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.mano_obra || ''}
                                onChange={(e) => updateItem(item.id, 'mano_obra', parseFloat(e.target.value) || 0)}
                                className="w-full text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                                placeholder="$0"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="0"
                                step="1"
                                value={item.materiales || ''}
                                onChange={(e) => updateItem(item.id, 'materiales', parseFloat(e.target.value) || 0)}
                                className="w-full text-right border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                                placeholder="$0"
                              />
                            </td>
                            <td className="px-3 py-2.5 text-right font-mono text-sm font-semibold text-green-700">
                              ${item.precio.toLocaleString()}
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="number"
                                min="1"
                                max="30"
                                value={item.dias || 1}
                                onChange={(e) => updateItem(item.id, 'dias', parseInt(e.target.value) || 1)}
                                className="w-full text-center border border-gray-200 rounded-lg px-1 py-1.5 text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={item.responsable || ''}
                                onChange={(e) => updateItem(item.id, 'responsable', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-xs focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                                placeholder="Asignar..."
                              />
                            </td>
                            <td className="px-3 py-2.5">
                              <input
                                type="text"
                                value={item.notas || ''}
                                onChange={(e) => updateItem(item.id, 'notas', e.target.value)}
                                className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                                placeholder="Notas..."
                              />
                            </td>
                            <td className="px-2 py-2.5 text-center">
                              {item.precio > 0 && (
                                <button
                                  onClick={async () => {
                                    if (!confirm(`¿Enviar orden de pago por ${item.concepto} ($${item.precio.toLocaleString()})?`)) return
                                    try {
                                      const res = await fetch('/api/payment-orders', {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json' },
                                        body: JSON.stringify({
                                          property_id: propertyId,
                                          property_address: quote?.address || '',
                                          payee_name: item.responsable || 'Contratista',
                                          amount: item.precio,
                                          method: 'transferencia',
                                          notes: `Renovación: ${item.concepto} (MO: $${item.mano_obra.toLocaleString()} + Mat: $${item.materiales.toLocaleString()})`,
                                        }),
                                      })
                                      if (res.ok) {
                                        toast.success(`Orden de pago enviada: ${item.concepto} — $${item.precio.toLocaleString()}`)
                                      } else {
                                        toast.error('Error al crear orden de pago')
                                      }
                                    } catch { toast.error('Error de conexión') }
                                  }}
                                  className="p-1 text-navy-400 hover:text-navy-700 hover:bg-navy-50 rounded transition-colors"
                                  title={`Enviar orden de pago: ${item.concepto}`}
                                >
                                  <Send className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </td>
                            {quote.items.some(i => i.is_custom) && (
                              <td className="px-2 py-2.5 text-center">
                                {item.is_custom && (
                                  <button
                                    onClick={() => removeCustomItem(item.id)}
                                    className="text-red-400 hover:text-red-600 transition-colors"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            )}
                          </tr>
                          {/* Expanded subfields row */}
                          {hasSubfields && isExpanded && renderSubfields(item)}
                        </React.Fragment>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Add custom + Total footer */}
              <div className="border-t border-gray-200 px-4 py-3">
                {!showAddCustom ? (
                  <button
                    onClick={() => setShowAddCustom(true)}
                    className="flex items-center gap-2 text-sm text-gold-700 hover:text-gold-900 font-medium transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar partida personalizada
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={customConcepto}
                      onChange={(e) => setCustomConcepto(e.target.value)}
                      className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                      placeholder="Concepto..."
                      autoFocus
                    />
                    <input
                      type="number"
                      value={customMO}
                      onChange={(e) => setCustomMO(e.target.value)}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                      placeholder="MO"
                    />
                    <input
                      type="number"
                      value={customMat}
                      onChange={(e) => setCustomMat(e.target.value)}
                      className="w-24 border border-gray-200 rounded-lg px-2 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                      placeholder="Mat"
                    />
                    <button onClick={addCustomItem} className="btn-gold text-sm px-3 py-2">
                      <Plus className="w-4 h-4" />
                    </button>
                    <button onClick={() => setShowAddCustom(false)} className="text-gray-400 hover:text-gray-600">
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                )}
              </div>

              {/* Total row */}
              <div className="bg-gray-50 border-t-2 border-navy-200 px-4 py-3">
                <div className="flex justify-end gap-8 text-sm">
                  <div className="text-right">
                    <span className="text-gray-500">MO:</span>{' '}
                    <span className="font-mono font-semibold">${totals.mano_obra.toLocaleString()}</span>
                  </div>
                  <div className="text-right">
                    <span className="text-gray-500">Mat:</span>{' '}
                    <span className="font-mono font-semibold">${totals.materiales.toLocaleString()}</span>
                  </div>
                  <div className="text-right text-base">
                    <span className="font-bold text-navy-900">Total:</span>{' '}
                    <span className="font-bold text-green-700 font-mono">
                      ${totals.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* MOBILE CARDS */}
            <div className="md:hidden space-y-3">
              {quote.items.map((item) => {
                const hasSubfields = !!(quote.item_subfields?.[item.id]?.length)
                const isExpanded = expandedRows.has(item.id)

                return (
                  <div
                    key={item.id}
                    className={`card-luxury p-4 space-y-3 ${item.is_custom ? 'border-amber-200' : ''}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-2">
                        {hasSubfields && (
                          <button onClick={() => toggleRow(item.id)} className="text-gray-400 mt-0.5">
                            {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                          </button>
                        )}
                        <div>
                          <span className="text-xs font-bold text-navy-600">#{item.partida}</span>
                          <p className="font-medium text-navy-900 text-sm">{item.concepto}</p>
                          <div className="flex gap-1.5 mt-0.5">
                            {item.is_custom && (
                              <span className="text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">Custom</span>
                            )}
                            {item.unidad && (
                              <span className="text-[9px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                                {UNIT_SHORT[item.unidad] || `/${item.unidad}`}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="text-lg font-bold text-green-700 font-mono">${item.precio.toLocaleString()}</p>
                        <p className="text-[10px] text-gray-400">{item.dias}d desde día {item.start_day}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">MO ($)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.mano_obra || ''}
                          onChange={(e) => updateItem(item.id, 'mano_obra', parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:ring-2 focus:ring-gold-400"
                          placeholder="$0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Mat ($)</label>
                        <input
                          type="number"
                          min="0"
                          value={item.materiales || ''}
                          onChange={(e) => updateItem(item.id, 'materiales', parseFloat(e.target.value) || 0)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm font-mono text-right focus:ring-2 focus:ring-gold-400"
                          placeholder="$0"
                        />
                      </div>
                      <div>
                        <label className="text-[10px] text-gray-500 font-medium">Días</label>
                        <input
                          type="number"
                          min="1"
                          max="30"
                          value={item.dias || 1}
                          onChange={(e) => updateItem(item.id, 'dias', parseInt(e.target.value) || 1)}
                          className="w-full border border-gray-200 rounded-lg px-2 py-1.5 text-sm text-center focus:ring-2 focus:ring-gold-400"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="text-[10px] text-gray-500 font-medium">Responsable</label>
                      <input
                        type="text"
                        value={item.responsable || ''}
                        onChange={(e) => updateItem(item.id, 'responsable', e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-gold-400"
                        placeholder="Asignar..."
                      />
                    </div>

                    <input
                      type="text"
                      value={item.notas || ''}
                      onChange={(e) => updateItem(item.id, 'notas', e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-gold-400"
                      placeholder="Notas..."
                    />

                    {/* Mobile subfields */}
                    {hasSubfields && isExpanded && (
                      <div className="bg-blue-50/40 rounded-lg p-3 space-y-2">
                        {quote.item_subfields?.[item.id]?.map((sf: SubfieldDef) => (
                          <div key={sf.key} className="flex items-center gap-2">
                            <label className="text-[10px] text-gray-500 font-medium w-20 flex-shrink-0">{sf.label}:</label>
                            {sf.type === 'boolean' ? (
                              <input
                                type="checkbox"
                                checked={!!item.subfields?.[sf.key]}
                                onChange={(e) => updateSubfield(item.id, sf.key, e.target.checked)}
                                className="rounded border-gray-300"
                              />
                            ) : sf.type === 'select' ? (
                              <select
                                value={item.subfields?.[sf.key] || ''}
                                onChange={(e) => updateSubfield(item.id, sf.key, e.target.value)}
                                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs"
                              >
                                <option value="">--</option>
                                {sf.options?.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                              </select>
                            ) : (
                              <input
                                type={sf.type === 'number' ? 'number' : 'text'}
                                value={item.subfields?.[sf.key] ?? ''}
                                onChange={(e) => updateSubfield(item.id, sf.key, sf.type === 'number' ? (parseFloat(e.target.value) || '') : e.target.value)}
                                className="flex-1 border border-gray-200 rounded px-2 py-1 text-xs"
                                placeholder={sf.label}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    )}

                    {item.is_custom && (
                      <button
                        onClick={() => removeCustomItem(item.id)}
                        className="text-red-400 hover:text-red-600 text-xs flex items-center gap-1"
                      >
                        <Trash2 className="w-3 h-3" /> Eliminar
                      </button>
                    )}
                  </div>
                )
              })}

              {/* Mobile add custom */}
              <div className="card-luxury p-4">
                {!showAddCustom ? (
                  <button
                    onClick={() => setShowAddCustom(true)}
                    className="flex items-center gap-2 text-sm text-gold-700 hover:text-gold-900 font-medium w-full justify-center"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar partida personalizada
                  </button>
                ) : (
                  <div className="space-y-2">
                    <input
                      type="text"
                      value={customConcepto}
                      onChange={(e) => setCustomConcepto(e.target.value)}
                      className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                      placeholder="Concepto..."
                      autoFocus
                    />
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="number"
                        value={customMO}
                        onChange={(e) => setCustomMO(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                        placeholder="MO ($)"
                      />
                      <input
                        type="number"
                        value={customMat}
                        onChange={(e) => setCustomMat(e.target.value)}
                        className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                        placeholder="Mat ($)"
                      />
                    </div>
                    <div className="flex gap-2">
                      <button onClick={addCustomItem} className="btn-gold text-sm px-4 py-2 flex-1">
                        Agregar
                      </button>
                      <button onClick={() => setShowAddCustom(false)} className="text-gray-400 hover:text-gray-600 px-3">
                        <X className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        {/* ============================================ */}
        {/* TAB: CRONOGRAMA (Gantt) */}
        {/* ============================================ */}
        {activeTab === 'cronograma' && (
          <div className="card-luxury overflow-hidden">
            <div className="px-4 py-3 bg-navy-900 text-white flex items-center justify-between">
              <h3 className="font-semibold text-sm">Calendario de Obra</h3>
              <span className="text-xs text-navy-200">Duración total: {maxDay} días</span>
            </div>

            <div className="overflow-x-auto">
              <div className="min-w-[400px] sm:min-w-[700px]">
                {/* Day headers */}
                <div className="flex border-b border-gray-200">
                  <div className="w-44 flex-shrink-0 px-3 py-2 text-xs font-semibold text-gray-500 bg-gray-50">
                    Partida
                  </div>
                  <div className="flex-1 flex">
                    {Array.from({ length: maxDay }, (_, i) => (
                      <div
                        key={i}
                        className="flex-1 text-center text-[10px] font-medium text-gray-400 py-2 border-l border-gray-100"
                      >
                        D{i + 1}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Item rows */}
                {quote.items.map((item) => {
                  const barStart = ((item.start_day - 1) / maxDay) * 100
                  const barWidth = (item.dias / maxDay) * 100
                  const colorClass = GANTT_COLORS[item.id] || 'bg-gray-400'

                  return (
                    <div key={item.id} className="flex border-b border-gray-50 hover:bg-gray-50/50">
                      <div className="w-44 flex-shrink-0 px-3 py-2 text-xs text-navy-800 truncate flex items-center gap-1.5">
                        <span className="font-bold text-navy-600 w-5 text-right">{item.partida}</span>
                        <span className="truncate">{item.concepto.split(' ').slice(0, 3).join(' ')}</span>
                      </div>
                      <div className="flex-1 relative py-1.5">
                        {item.precio > 0 && (
                          <div
                            className={`absolute top-1.5 bottom-1.5 rounded ${colorClass} opacity-80`}
                            style={{
                              left: `${barStart}%`,
                              width: `${Math.max(barWidth, 2)}%`,
                            }}
                            title={`${item.concepto}: Día ${item.start_day}–${item.start_day + item.dias - 1} (${item.dias}d)`}
                          >
                            <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium truncate px-1">
                              {item.dias > 1 ? `${item.dias}d` : ''}
                            </span>
                          </div>
                        )}
                        {/* Grid lines */}
                        <div className="absolute inset-0 flex pointer-events-none">
                          {Array.from({ length: maxDay }, (_, i) => (
                            <div key={i} className="flex-1 border-l border-gray-100" />
                          ))}
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            <div className="px-4 py-3 bg-gray-50 border-t text-xs text-gray-400 italic">
              El cronograma es visual y estimado. Los días de inicio se pueden ajustar desde la pestaña Cotización.
            </div>
          </div>
        )}

        {/* Approval actions */}
        <div className="flex flex-wrap items-center gap-3">
          {approvalStatus === 'draft' && (
            <button
              onClick={() => saveQuote(true)}
              disabled={submittingApproval}
              className="flex items-center gap-2 px-5 py-2.5 bg-navy-800 text-white rounded-lg font-medium hover:bg-navy-900 transition-all"
            >
              {submittingApproval ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              Enviar a Aprobación
            </button>
          )}
          {approvalStatus === 'pending_approval' && (
            <span className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 text-amber-700 rounded-lg text-sm font-medium border border-amber-200">
              <Clock className="w-4 h-4" />
              Enviada a Sebastian/Abigail para aprobación
            </span>
          )}
          {approvalStatus === 'approved' && (
            <span className="flex items-center gap-2 px-4 py-2.5 bg-green-50 text-green-700 rounded-lg text-sm font-medium border border-green-200">
              <CheckCircle2 className="w-4 h-4" />
              Cotización aprobada
            </span>
          )}

          {/* Guide text */}
          <p className="text-xs text-gray-400 italic ml-auto">
            Separe Mano de Obra y Materiales por partida. Use el botón + para agregar items personalizados.
          </p>
        </div>
          </div>

      {/* Import Report Modal */}
      {showImportReport && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4" onClick={() => setShowImportReport(false)}>
          <div className="bg-white rounded-2xl p-6 max-w-md w-full space-y-4" onClick={e => e.stopPropagation()}>
            <h3 className="text-lg font-bold text-navy-900">Importar Reporte de Evaluación</h3>
            <p className="text-sm text-gray-600">
              Ingresa el número del reporte (ej: EVL-260213-001) para importar sus hallazgos como sugerencias de renovación.
            </p>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Hash className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                  value={importReportNumber}
                  onChange={e => setImportReportNumber(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-gold-400 text-sm"
                  placeholder="EVL-XXXXXX-XXX"
                  onKeyDown={e => e.key === 'Enter' && importEvaluationReport()}
                  autoFocus
                />
              </div>
              <button
                onClick={importEvaluationReport}
                disabled={importingReport}
                className="btn-gold px-4"
              >
                {importingReport ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Importar'}
              </button>
            </div>
            <button onClick={() => setShowImportReport(false)} className="text-sm text-gray-400 hover:text-gray-600">
              Cancelar
              </button>
          </div>
        </div>
      )}
    </div>
  )
}
