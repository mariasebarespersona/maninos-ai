'use client'

import { useState, useEffect } from 'react'
import { 
  Plus, 
  Trash2, 
  Package, 
  DollarSign, 
  CheckCircle2,
  Loader2,
  Search,
  ShoppingCart
} from 'lucide-react'
import { useToast } from './ui/Toast'

interface Material {
  id: string
  name: string
  unit: string
  unit_price: number
  category: string
}

interface RenovationItem {
  id: string
  material_id?: string
  material_name: string
  material_unit: string
  material_category: string
  quantity: number
  unit_price: number
  total_price: number
  notes?: string
  purchased: boolean
  supplier?: string
}

interface RenovationSummary {
  total_items: number
  total_cost: number
  purchased_cost: number
  pending_cost: number
  by_category: Record<string, { items: number; cost: number }>
}

interface Props {
  propertyId: string
  onTotalChange?: (total: number) => void
}

const CATEGORY_LABELS: Record<string, string> = {
  paredes: '🧱 Paredes / Tablaroca',
  pintura: '🎨 Pintura',
  techos: '🏠 Techos / Exterior',
  plomeria: '🚿 Plomería',
  electrico: '⚡ Eléctrico',
  cerrajeria: '🔐 Cerrajería',
  otros: '📦 Otros',
}

const CATEGORY_COLORS: Record<string, string> = {
  paredes: 'bg-amber-50 text-amber-700 border-amber-200',
  pintura: 'bg-purple-50 text-purple-700 border-purple-200',
  techos: 'bg-blue-50 text-blue-700 border-blue-200',
  plomeria: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  electrico: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  cerrajeria: 'bg-slate-50 text-slate-700 border-slate-200',
  otros: 'bg-gray-50 text-gray-700 border-gray-200',
}

export default function RenovationMaterials({ propertyId, onTotalChange }: Props) {
  const toast = useToast()
  
  const [materials, setMaterials] = useState<Material[]>([])
  const [items, setItems] = useState<RenovationItem[]>([])
  const [summary, setSummary] = useState<RenovationSummary | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Add item form
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedMaterial, setSelectedMaterial] = useState<Material | null>(null)
  const [quantity, setQuantity] = useState('1')
  const [customPrice, setCustomPrice] = useState('')
  const [notes, setNotes] = useState('')
  const [searchTerm, setSearchTerm] = useState('')
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null)

  useEffect(() => {
    fetchData()
  }, [propertyId])

  useEffect(() => {
    if (summary && onTotalChange) {
      // Round to avoid floating point issues
      onTotalChange(Math.round(summary.total_cost * 100) / 100)
    }
  }, [summary, onTotalChange])

  const fetchData = async () => {
    setLoading(true)
    try {
      const [materialsRes, itemsRes, summaryRes] = await Promise.all([
        fetch('/api/materials'),
        fetch(`/api/materials/renovation-items/${propertyId}`),
        fetch(`/api/materials/renovation-items/${propertyId}/summary`),
      ])

      if (materialsRes.ok) setMaterials(await materialsRes.json())
      if (itemsRes.ok) setItems(await itemsRes.json())
      if (summaryRes.ok) setSummary(await summaryRes.json())
    } catch (error) {
      console.error('Error fetching data:', error)
      toast.error('Error al cargar datos')
    } finally {
      setLoading(false)
    }
  }

  const handleAddItem = async () => {
    if (!selectedMaterial) return
    
    setSaving(true)
    try {
      const res = await fetch('/api/materials/renovation-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          property_id: propertyId,
          material_id: selectedMaterial.id,
          quantity: parseFloat(quantity) || 1,
          unit_price: customPrice ? parseFloat(customPrice) : selectedMaterial.unit_price,
          notes: notes || undefined,
        }),
      })

      if (res.ok) {
        toast.success('Material agregado')
        setShowAddForm(false)
        setSelectedMaterial(null)
        setQuantity('1')
        setCustomPrice('')
        setNotes('')
        fetchData()
      } else {
        throw new Error('Error al agregar')
      }
    } catch (error) {
      toast.error('Error al agregar material')
    } finally {
      setSaving(false)
    }
  }

  const handleTogglePurchased = async (item: RenovationItem) => {
    try {
      const res = await fetch(`/api/materials/renovation-items?id=${item.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ purchased: !item.purchased }),
      })

      if (res.ok) {
        fetchData()
      }
    } catch (error) {
      toast.error('Error al actualizar')
    }
  }

  const handleDeleteItem = async (itemId: string) => {
    try {
      const res = await fetch(`/api/materials/renovation-items?id=${itemId}`, {
        method: 'DELETE',
      })

      if (res.ok) {
        toast.info('Material eliminado')
        fetchData()
      }
    } catch (error) {
      toast.error('Error al eliminar')
    }
  }

  const filteredMaterials = materials.filter(m => {
    const matchesSearch = m.name.toLowerCase().includes(searchTerm.toLowerCase())
    const matchesCategory = !selectedCategory || m.category === selectedCategory
    return matchesSearch && matchesCategory
  })

  const groupedItems = items.reduce((acc, item) => {
    const cat = item.material_category || 'otros'
    if (!acc[cat]) acc[cat] = []
    acc[cat].push(item)
    return acc
  }, {} as Record<string, RenovationItem[]>)

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-8 h-8 animate-spin text-gold-500" />
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-500 text-sm">
              <Package className="w-4 h-4" />
              Items
            </div>
            <p className="text-2xl font-serif font-bold text-navy-900 mt-1">
              {summary.total_items}
            </p>
          </div>
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-navy-500 text-sm">
              <DollarSign className="w-4 h-4" />
              Costo Total
            </div>
            <p className="text-2xl font-serif font-bold text-gold-600 mt-1">
              ${summary.total_cost.toLocaleString()}
            </p>
          </div>
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-emerald-600 text-sm">
              <CheckCircle2 className="w-4 h-4" />
              Comprado
            </div>
            <p className="text-2xl font-serif font-bold text-emerald-600 mt-1">
              ${summary.purchased_cost.toLocaleString()}
            </p>
          </div>
          <div className="card-luxury p-4">
            <div className="flex items-center gap-2 text-amber-600 text-sm">
              <ShoppingCart className="w-4 h-4" />
              Pendiente
            </div>
            <p className="text-2xl font-serif font-bold text-amber-600 mt-1">
              ${summary.pending_cost.toLocaleString()}
            </p>
          </div>
        </div>
      )}

      {/* Add Material Button */}
      <div className="flex justify-between items-center">
        <h3 className="font-serif text-lg text-navy-900">Materiales de Renovación</h3>
        <button
          onClick={() => setShowAddForm(true)}
          className="btn-gold"
        >
          <Plus className="w-5 h-5" />
          Agregar Material
        </button>
      </div>

      {/* Add Material Form */}
      {showAddForm && (
        <div className="card-luxury p-6 space-y-4 border-2 border-gold-200">
          <h4 className="font-medium text-navy-900">Seleccionar Material</h4>
          
          {/* Search and Filter */}
          <div className="flex gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-navy-400" />
              <input
                type="text"
                placeholder="Buscar material..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="input-luxury pl-10"
              />
            </div>
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="input-luxury w-48"
            >
              <option value="">Todas las categorías</option>
              {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                <option key={key} value={key}>{label}</option>
              ))}
            </select>
          </div>

          {/* Material List */}
          <div className="max-h-60 overflow-y-auto space-y-2 border rounded-lg p-2">
            {filteredMaterials.map((material) => (
              <button
                key={material.id}
                onClick={() => {
                  setSelectedMaterial(material)
                  setCustomPrice(material.unit_price.toString())
                }}
                className={`w-full p-3 rounded-lg text-left transition-all ${
                  selectedMaterial?.id === material.id
                    ? 'bg-gold-50 border-2 border-gold-400'
                    : 'bg-navy-50 hover:bg-navy-100 border border-transparent'
                }`}
              >
                <div className="flex justify-between items-center">
                  <div>
                    <p className="font-medium text-navy-900">{material.name}</p>
                    <p className="text-sm text-navy-500">
                      {CATEGORY_LABELS[material.category] || material.category}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-semibold text-gold-600">
                      ${material.unit_price.toFixed(2)}
                    </p>
                    <p className="text-xs text-navy-500">por {material.unit}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>

          {/* Quantity and Price */}
          {selectedMaterial && (
            <div className="grid grid-cols-2 gap-4 pt-4 border-t">
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">
                  Cantidad ({selectedMaterial.unit})
                </label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  min="0.01"
                  step="0.01"
                  className="input-luxury"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-navy-700 mb-1">
                  Precio Unitario ($)
                </label>
                <input
                  type="number"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  min="0"
                  step="0.01"
                  className="input-luxury"
                />
              </div>
            </div>
          )}

          {/* Notes */}
          {selectedMaterial && (
            <div>
              <label className="block text-sm font-medium text-navy-700 mb-1">
                Notas (opcional)
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ej: Para baño principal"
                className="input-luxury"
              />
            </div>
          )}

          {/* Total Preview */}
          {selectedMaterial && (
            <div className="p-4 bg-gold-50 rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-navy-700">Total estimado:</span>
                <span className="text-2xl font-bold text-gold-600">
                  ${((parseFloat(quantity) || 0) * (parseFloat(customPrice) || 0)).toFixed(2)}
                </span>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4">
            <button
              onClick={() => {
                setShowAddForm(false)
                setSelectedMaterial(null)
              }}
              className="btn-ghost"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddItem}
              disabled={!selectedMaterial || saving}
              className="btn-gold disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Plus className="w-5 h-5" />
              )}
              Agregar
            </button>
          </div>
        </div>
      )}

      {/* Items List by Category */}
      {items.length === 0 ? (
        <div className="card-luxury p-12 text-center">
          <Package className="w-12 h-12 text-navy-300 mx-auto mb-4" />
          <h3 className="font-serif text-xl text-navy-900 mb-2">Sin materiales</h3>
          <p className="text-navy-500 mb-4">
            Agrega los materiales necesarios para la renovación
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {Object.entries(groupedItems).map(([category, categoryItems]) => (
            <div key={category} className="card-luxury overflow-hidden">
              <div className={`px-4 py-2 ${CATEGORY_COLORS[category] || CATEGORY_COLORS.otros} border-b`}>
                <h4 className="font-medium">
                  {CATEGORY_LABELS[category] || category}
                </h4>
              </div>
              <div className="divide-y divide-navy-100">
                {categoryItems.map((item) => (
                  <div
                    key={item.id}
                    className={`p-4 flex items-center gap-4 ${
                      item.purchased ? 'bg-emerald-50/50' : ''
                    }`}
                  >
                    <button
                      onClick={() => handleTogglePurchased(item)}
                      className={`p-2 rounded-lg transition-colors ${
                        item.purchased
                          ? 'bg-emerald-100 text-emerald-600'
                          : 'bg-navy-100 text-navy-400 hover:bg-navy-200'
                      }`}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className={`font-medium ${item.purchased ? 'text-navy-500 line-through' : 'text-navy-900'}`}>
                        {item.material_name}
                      </p>
                      <p className="text-sm text-navy-500">
                        {item.quantity} {item.material_unit} × ${item.unit_price.toFixed(2)}
                        {item.notes && ` • ${item.notes}`}
                      </p>
                    </div>
                    
                    <div className="text-right">
                      <p className="font-semibold text-gold-600">
                        ${item.total_price.toFixed(2)}
                      </p>
                    </div>
                    
                    <button
                      onClick={() => handleDeleteItem(item.id)}
                      className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

