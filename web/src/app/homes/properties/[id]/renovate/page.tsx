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
} from 'lucide-react'
import { useToast } from '@/components/ui/Toast'

// ============================================
// TYPES — V2 Simplified (concepto + precio)
// ============================================

interface RenovationItem {
  id: string
  partida: number
  concepto: string
  precio: number
  notas: string
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
  const [customPrecio, setCustomPrecio] = useState('')
  
  // Voice state
  const [isListening, setIsListening] = useState(false)
  const [voiceTranscript, setVoiceTranscript] = useState('')
  const recognitionRef = useRef<any>(null)
  
  // Photo upload ref
  const fileInputRef = useRef<HTMLInputElement>(null)

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
        setQuote(data)
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

  const updateItemPrice = useCallback((itemId: string, precio: number) => {
    setQuote(prev => {
      if (!prev) return prev
      const updatedItems = prev.items.map(item =>
        item.id === itemId ? { ...item, precio } : item
      )
      const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
      return { ...prev, items: updatedItems, total: Math.round(total * 100) / 100 }
    })
    setHasUnsavedChanges(true)
  }, [])

  const updateItemNotas = useCallback((itemId: string, notas: string) => {
    setQuote(prev => {
      if (!prev) return prev
      const updatedItems = prev.items.map(item =>
        item.id === itemId ? { ...item, notas } : item
      )
      return { ...prev, items: updatedItems }
    })
    setHasUnsavedChanges(true)
  }, [])

  // ============================================
  // ADD / REMOVE CUSTOM ITEM
  // ============================================

  const addCustomItem = () => {
    if (!customConcepto.trim()) {
      toast.warning('Ingresa el concepto')
      return
    }
    const nextPartida = (quote?.items.length || 19) + 1
    const newItem: RenovationItem = {
      id: `custom_${Date.now()}`,
      partida: nextPartida,
      concepto: customConcepto.trim(),
      precio: parseFloat(customPrecio) || 0,
      notas: '',
      is_custom: true,
    }
    setQuote(prev => {
      if (!prev) return prev
      const items = [...prev.items, newItem]
      const total = items.reduce((s, i) => s + (i.precio || 0), 0)
      return { ...prev, items, total: Math.round(total * 100) / 100 }
    })
    setCustomConcepto('')
    setCustomPrecio('')
    setShowAddCustom(false)
    setHasUnsavedChanges(true)
    toast.success('Item personalizado agregado')
  }

  const removeCustomItem = (itemId: string) => {
    setQuote(prev => {
      if (!prev) return prev
      const items = prev.items.filter(i => i.id !== itemId)
      const total = items.reduce((s, i) => s + (i.precio || 0), 0)
      return { ...prev, items, total: Math.round(total * 100) / 100 }
    })
    setHasUnsavedChanges(true)
  }

  // ============================================
  // SAVE
  // ============================================

  const saveQuote = async () => {
    if (!quote) return
    setSaving(true)
    try {
      const itemsPayload: Record<string, any> = {}
      const customItems: any[] = []

      for (const item of quote.items) {
        if (item.is_custom) {
          customItems.push({
            id: item.id,
            partida: item.partida,
            concepto: item.concepto,
            precio: item.precio,
            notas: item.notas,
          })
        } else {
          itemsPayload[item.id] = {
            precio: item.precio || 0,
            notas: item.notas || '',
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
        }),
      })

      if (res.ok) {
        const result = await res.json()
        toast.success(`✅ Cotización guardada — $${result.total?.toLocaleString() || '0'} (${result.active_items} ítems)`)
        setHasUnsavedChanges(false)
      } else {
        toast.error('Error al guardar')
      }
    } catch (error) {
      toast.error('Error de conexión')
    } finally {
      setSaving(false)
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
                return {
                  ...item,
                  precio: suggestion.precio || item.precio,
                  notas: suggestion.notas || item.notas,
                }
              }
              return item
            })
            const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
            return { ...prev, items: updatedItems, total: Math.round(total * 100) / 100 }
          })
          setHasUnsavedChanges(true)
          toast.success(`🤖 AI sugirió ${result.items_suggested} ítems`)
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
              return {
                ...item,
                precio: suggestion.precio || item.precio,
                notas: suggestion.notas || item.notas,
              }
            }
            return item
          })
          const total = updatedItems.reduce((s, i) => s + (i.precio || 0), 0)
          return { ...prev, items: updatedItems, total: Math.round(total * 100) / 100 }
        })
        setHasUnsavedChanges(true)
      }

      setAiAnalysis(result.ai_analysis || `Importado desde Reporte #${result.report_number}`)
      toast.success(`📋 Reporte importado: ${result.items_suggested} ítems`)
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
    toast.info('🎤 Escuchando... Di "partida [número] precio [monto]"')
  }

  const stopVoice = () => {
    if (recognitionRef.current) recognitionRef.current.stop()
    setIsListening(false)
    setVoiceTranscript('')
  }

  const processVoiceCommand = (text: string) => {
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

    // Parse: "precio X" or just a number
    const precioMatch = text.match(/precio\s+(\d[\d,.]*)/)
    const notasMatch = text.match(/nota[s]?\s+(.+)/)
    let changed = false

    if (precioMatch) {
      const val = parseFloat(precioMatch[1].replace(/,/g, ''))
      updateItemPrice(targetItem.id, val)
      changed = true
    }
    if (notasMatch) {
      updateItemNotas(targetItem.id, notasMatch[1])
      changed = true
    }

    if (changed) {
      toast.success(`✅ Partida ${targetItem.partida}: ${targetItem.concepto} actualizada`)
    } else {
      toast.info(`Partida ${targetItem.partida} encontrada. Di "precio X" o "nota ..."`)
    }
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
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
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
              onClick={saveQuote}
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
              {voiceTranscript || 'Escuchando... Di "partida [número] precio [monto]"'}
                        </span>
                      </div>
        )}
                    </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        {/* Property info + AI tools */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-800 font-medium mb-2">
              <DollarSign className="w-4 h-4" />
              Precio de compra
                </div>
            <p className="text-2xl font-bold text-navy-900">
              ${(quote.purchase_price || 0).toLocaleString()}
            </p>
              </div>

          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-800 font-medium mb-2">
              <FileSpreadsheet className="w-4 h-4" />
              Total Renovación
                          </div>
            <p className="text-2xl font-bold text-green-700">
              ${quote.total.toLocaleString()}
            </p>
                        </div>
                        
          <div className="card-luxury p-4 flex flex-col gap-2">
            <div className="flex items-center gap-2 text-navy-800 font-medium">
              <Sparkles className="w-4 h-4" />
              Herramientas AI
                      </div>
            <div className="flex flex-wrap gap-2">
                            <button
                onClick={() => fileInputRef.current?.click()}
                disabled={aiFilling}
                className="flex items-center gap-1 px-3 py-1.5 bg-purple-50 text-purple-700 border border-purple-200 rounded-lg text-sm hover:bg-purple-100 transition-all"
              >
                {aiFilling ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Camera className="w-3.5 h-3.5" />}
                AI Fotos
                            </button>
                            <button
                onClick={() => setShowImportReport(true)}
                className="flex items-center gap-1 px-3 py-1.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-lg text-sm hover:bg-blue-100 transition-all"
                            >
                <FileText className="w-3.5 h-3.5" />
                Importar Reporte
                            </button>
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

        {/* MAIN TABLE — Simplified: Partida · Concepto · Precio · Notas */}
        <div className="card-luxury overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-navy-900 text-white">
                  <th className="px-4 py-3 text-left font-semibold w-16">#</th>
                  <th className="px-4 py-3 text-left font-semibold">Concepto</th>
                  <th className="px-4 py-3 text-right font-semibold w-36">Precio ($)</th>
                  <th className="px-4 py-3 text-left font-semibold w-64">Notas</th>
                  {quote.items.some(i => i.is_custom) && (
                    <th className="px-2 py-3 w-10"></th>
                  )}
                </tr>
              </thead>
              <tbody>
                {quote.items.map((item) => (
                  <tr
                    key={item.id}
                    className={`border-b border-gray-100 hover:bg-blue-50/30 transition-colors ${
                      item.precio > 0 ? 'bg-green-50/20' : ''
                    } ${item.is_custom ? 'bg-amber-50/30' : ''}`}
                  >
                    <td className="px-4 py-3 text-center font-bold text-navy-700">
                      {item.partida}
                    </td>
                    <td className="px-4 py-3">
                      <span className="font-medium text-navy-900">{item.concepto}</span>
                      {item.is_custom && (
                        <span className="ml-2 text-[10px] bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full">
                          Personalizado
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={item.precio || ''}
                        onChange={(e) => updateItemPrice(item.id, parseFloat(e.target.value) || 0)}
                        className="w-full text-right border border-gray-200 rounded-lg px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                        placeholder="$0.00"
                      />
                    </td>
                    <td className="px-4 py-3">
                      <input
                        type="text"
                        value={item.notas || ''}
                        onChange={(e) => updateItemNotas(item.id, e.target.value)}
                        className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400 focus:border-gold-400"
                        placeholder="Notas..."
                      />
                    </td>
                    {quote.items.some(i => i.is_custom) && (
                      <td className="px-2 py-3 text-center">
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
                ))}
              </tbody>
            </table>
          </div>

          {/* Add custom item */}
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
              <div className="flex items-center gap-3">
                <input
                  type="text"
                  value={customConcepto}
                  onChange={(e) => setCustomConcepto(e.target.value)}
                  className="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                  placeholder="Nombre del concepto..."
                  autoFocus
                />
                <input
                  type="number"
                  value={customPrecio}
                  onChange={(e) => setCustomPrecio(e.target.value)}
                  className="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-gold-400"
                  placeholder="Precio"
                />
                <button onClick={addCustomItem} className="btn-gold text-sm px-3 py-2">
                  <Plus className="w-4 h-4" />
                  Agregar
                </button>
                <button onClick={() => setShowAddCustom(false)} className="text-gray-400 hover:text-gray-600">
                  <X className="w-5 h-5" />
                </button>
              </div>
            )}
            </div>
            
          {/* Total */}
          <div className="bg-gray-50 border-t-2 border-navy-200 px-4 py-4">
            <div className="max-w-xs ml-auto">
              <div className="flex justify-between text-lg font-bold">
                <span className="text-navy-900">Total:</span>
                <span className="text-green-700 font-mono">
                  ${quote.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
          </div>
        </div>
      </div>

        {/* Guide text */}
        <p className="text-xs text-gray-400 text-center italic">
          Complete el precio de cada partida que aplique. Use el botón + para agregar ítems personalizados.
        </p>
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
