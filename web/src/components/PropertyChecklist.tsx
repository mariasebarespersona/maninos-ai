'use client'

import { useState, useEffect } from 'react'
import { CheckCircle2, Circle, Save, Loader2, ClipboardCheck, ChevronDown, ChevronUp } from 'lucide-react'
import { useToast } from './ui/Toast'

// Checklist de 28 puntos para evaluar propiedades ANTES de comprar
// Basado en el checklist oficial de Maninos Homes LLC
// IDs sincronizados con Market Dashboard
const CHECKLIST_ITEMS = [
  // ESTRUCTURA (4 items)
  { id: 'marco_acero', label: 'Marco de acero', category: 'Estructura' },
  { id: 'suelos_subfloor', label: 'Suelos/subfloor', category: 'Estructura' },
  { id: 'techo_techumbre', label: 'Techo/techumbre', category: 'Estructura' },
  { id: 'paredes_ventanas', label: 'Paredes/ventanas', category: 'Estructura' },

  // INSTALACIONES (5 items)
  { id: 'regaderas_tinas', label: 'Regaderas/tinas/coladeras', category: 'Instalaciones' },
  { id: 'electricidad', label: 'Electricidad', category: 'Instalaciones' },
  { id: 'plomeria', label: 'Plomería', category: 'Instalaciones' },
  { id: 'ac', label: 'A/C', category: 'Instalaciones' },
  { id: 'gas', label: 'Gas', category: 'Instalaciones' },

]

const CATEGORIES = [
  { id: 'Estructura', icon: '🏗️', color: 'bg-blue-50 border-blue-200' },
  { id: 'Instalaciones', icon: '⚡', color: 'bg-yellow-50 border-yellow-200' },
]

const MACRO_GROUPS = [
  {
    id: 'inspeccion',
    label: 'Inspección en Campo',
    icon: '🔍',
    description: 'Lo que revisa el empleado en la propiedad',
    categories: ['Estructura', 'Instalaciones'],
    color: 'bg-blue-50 border-blue-200',
  },
]

interface PropertyChecklistProps {
  propertyId: string
  initialChecklist?: Record<string, boolean>
  onSave?: (checklist: Record<string, boolean>) => void
  readOnly?: boolean
}

export default function PropertyChecklist({
  propertyId,
  initialChecklist = {},
  onSave,
  readOnly = false
}: PropertyChecklistProps) {
  const [checklist, setChecklist] = useState<Record<string, boolean>>(initialChecklist)
  const [saving, setSaving] = useState(false)
  const [hasChanges, setHasChanges] = useState(false)
  const [collapsedMacro, setCollapsedMacro] = useState<Record<string, boolean>>({})
  const toast = useToast()

  const toggleMacro = (id: string) => setCollapsedMacro(prev => ({ ...prev, [id]: !prev[id] }))

  useEffect(() => {
    setChecklist(initialChecklist)
  }, [initialChecklist])

  const toggleItem = (itemId: string) => {
    if (readOnly) return
    
    setChecklist(prev => {
      const newChecklist = { ...prev, [itemId]: !prev[itemId] }
      setHasChanges(true)
      return newChecklist
    })
  }

  const handleSave = async () => {
    if (!onSave) return
    
    setSaving(true)
    try {
      await onSave(checklist)
      setHasChanges(false)
      toast.success('Checklist guardado exitosamente')
    } catch (error) {
      toast.error('Error al guardar el checklist')
    } finally {
      setSaving(false)
    }
  }

  const completedCount = Object.values(checklist).filter(Boolean).length
  const totalCount = CHECKLIST_ITEMS.length
  const progressPercent = Math.round((completedCount / totalCount) * 100)

  return (
    <div className="space-y-6">
      {/* Header con progreso */}
      <div className="card-luxury p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-gold-100 rounded-xl">
              <ClipboardCheck className="w-6 h-6 text-gold-600" />
            </div>
            <div>
              <h2 className="font-serif text-xl text-navy-900">Checklist Compra de Casa</h2>
              <p className="text-sm text-navy-500">9 puntos de verificación</p>
            </div>
          </div>
          
          {!readOnly && (
            <button
              onClick={handleSave}
              disabled={saving || !hasChanges}
              className="btn-gold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Guardando...
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  Guardar
                </>
              )}
            </button>
          )}
        </div>

        {/* Barra de progreso */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-navy-600 font-medium">
              {completedCount} de {totalCount} completados
            </span>
            <span className={`font-bold ${progressPercent === 100 ? 'text-emerald-600' : 'text-gold-600'}`}>
              {progressPercent}%
            </span>
          </div>
          <div className="h-3 bg-navy-100 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-500 rounded-full ${
                progressPercent === 100 
                  ? 'bg-gradient-to-r from-emerald-500 to-emerald-400' 
                  : 'bg-gradient-to-r from-gold-500 to-gold-400'
              }`}
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
      </div>

      {/* Macro-groups → Categories → Items */}
      <div className="space-y-5">
        {MACRO_GROUPS.map(macro => {
          const macroItems = CHECKLIST_ITEMS.filter(item => macro.categories.includes(item.category))
          const macroCompleted = macroItems.filter(item => checklist[item.id]).length
          const macroTotal = macroItems.length
          const macroProgress = macroTotal > 0 ? Math.round((macroCompleted / macroTotal) * 100) : 0
          const isCollapsed = collapsedMacro[macro.id]

          return (
            <div key={macro.id} className="rounded-xl border-2 border-navy-200 overflow-hidden">
              {/* Macro-group header */}
              <button
                onClick={() => toggleMacro(macro.id)}
                className="w-full px-4 py-3.5 bg-navy-50 hover:bg-navy-100 transition-colors flex items-center gap-3"
              >
                <span className="text-2xl">{macro.icon}</span>
                <div className="flex-1 text-left">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-navy-900">{macro.label}</h3>
                    <span className="text-xs text-navy-500">({macroTotal} puntos)</span>
                  </div>
                  <p className="text-xs text-navy-400 mt-0.5">{macro.description}</p>
                  {/* Progress bar */}
                  <div className="flex items-center gap-2 mt-1.5">
                    <div className="flex-1 h-2 bg-navy-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          macroProgress === 100 ? 'bg-emerald-500' :
                          macroProgress > 50 ? 'bg-gold-500' :
                          macroProgress > 0 ? 'bg-blue-500' : 'bg-gray-300'
                        }`}
                        style={{ width: `${macroProgress}%` }}
                      />
                    </div>
                    <span className="text-xs font-bold text-navy-600">{macroCompleted}/{macroTotal}</span>
                  </div>
                </div>
                {isCollapsed ? <ChevronDown className="w-5 h-5 text-navy-400" /> : <ChevronUp className="w-5 h-5 text-navy-400" />}
              </button>

              {/* Sub-categories */}
              {!isCollapsed && (
                <div className="space-y-0">
                  {macro.categories.map(catId => {
                    const category = CATEGORIES.find(c => c.id === catId)
                    if (!category) return null
                    const categoryItems = CHECKLIST_ITEMS.filter(item => item.category === catId)
                    const categoryCompleted = categoryItems.filter(item => checklist[item.id]).length

                    return (
                      <div key={catId} className={`border-t-2 ${category.color}`}>
                        {/* Category header */}
                        <div className="px-4 py-2.5 bg-white/50 border-b flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-lg">{category.icon}</span>
                            <h4 className="font-semibold text-navy-800 text-sm">{category.id}</h4>
                          </div>
                          <span className="text-xs text-navy-500 font-medium">
                            {categoryCompleted}/{categoryItems.length} ✓
                          </span>
                        </div>

                        {/* Items */}
                        <div className="divide-y divide-white/50">
                          {categoryItems.map(item => (
                            <div
                              key={item.id}
                              onClick={() => toggleItem(item.id)}
                              className={`
                                flex items-center gap-3 px-4 py-3
                                transition-all duration-200
                                ${!readOnly ? 'cursor-pointer hover:bg-white/50' : ''}
                                ${checklist[item.id] ? 'bg-white/30' : ''}
                              `}
                            >
                              <div className="flex-shrink-0">
                                {checklist[item.id] ? (
                                  <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                                ) : (
                                  <Circle className="w-6 h-6 text-navy-300" />
                                )}
                              </div>
                              <span className={`
                                text-sm flex-1
                                ${checklist[item.id] ? 'text-navy-600 line-through' : 'text-navy-800'}
                              `}>
                                {item.label}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Footer con advertencia */}
      {!readOnly && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
          <p className="text-sm text-amber-800">
            <strong>⚠️ Importante:</strong> Completa todos los puntos antes de finalizar la compra. 
            Los items marcados se guardarán automáticamente al hacer clic en "Guardar".
          </p>
        </div>
      )}
    </div>
  )
}

