/**
 * MANINOS AI - Type Definitions
 * 
 * Core types for Portal Homes MVP.
 */

// ============================================================================
// PROPERTY
// ============================================================================

export type PropertyStatus = 'purchased' | 'published' | 'renovating' | 'sold'

export interface Property {
  id: string
  address: string
  city?: string
  state?: string
  zip_code?: string
  hud_number?: string
  year?: number
  purchase_price?: number
  sale_price?: number
  bedrooms?: number
  bathrooms?: number
  square_feet?: number
  status: PropertyStatus
  is_renovated: boolean
  photos: string[]
  checklist_completed: boolean
  checklist_data: Record<string, boolean>
  created_at: string
  updated_at: string
}

export interface PropertyCreate {
  address: string
  city?: string
  state?: string
  zip_code?: string
  hud_number?: string
  year?: number
  purchase_price?: number
  sale_price?: number
  bedrooms?: number
  bathrooms?: number
  square_feet?: number
}

// ============================================================================
// CLIENT
// ============================================================================

export type ClientStatus = 'lead' | 'active' | 'completed'

export interface Client {
  id: string
  name: string
  email?: string
  phone?: string
  terreno?: string
  status: ClientStatus
  created_at: string
  updated_at: string
}

export interface ClientWithSale extends Client {
  property_address?: string
  sale_status?: SaleStatus
  sale_date?: string
}

export interface ClientCreate {
  name: string
  email?: string
  phone?: string
  terreno?: string
}

// ============================================================================
// SALE
// ============================================================================

export type SaleStatus = 'pending' | 'paid' | 'completed' | 'cancelled'
export type SaleType = 'contado' | 'rto'

export interface Sale {
  id: string
  property_id: string
  client_id: string
  sale_type: SaleType
  sale_price: number
  status: SaleStatus
  sold_before_renovation: boolean
  payment_method?: string
  payment_reference?: string
  created_at: string
  completed_at?: string
  updated_at: string
  property_address?: string
  client_name?: string
}

export interface SaleCreate {
  property_id: string
  client_id: string
  sale_price: number
  sale_type: SaleType
}

// ============================================================================
// RENOVATION
// ============================================================================

export type RenovationStatus = 'in_progress' | 'completed'

export interface MaterialItem {
  item: string
  quantity: number
  unit_cost: number
  total: number
}

export interface Renovation {
  id: string
  property_id: string
  materials: MaterialItem[]
  total_cost: number
  notes?: string
  status: RenovationStatus
  was_moved: boolean
  created_at: string
  completed_at?: string
  updated_at: string
}

// ============================================================================
// DOCUMENT
// ============================================================================

export type EntityType = 'property' | 'client' | 'sale' | 'renovation'

export interface Document {
  id: string
  entity_type: EntityType
  entity_id: string
  doc_type: string
  file_name?: string
  file_url: string
  storage_path?: string
  created_at: string
}

// ============================================================================
// USER
// ============================================================================

export type UserRole =
  | 'admin'
  | 'operations'
  | 'treasury'
  | 'yard_manager'
  // Legacy (backward compat)
  | 'comprador'
  | 'renovador'
  | 'vendedor'

export interface User {
  id: string
  email: string
  name: string
  role: UserRole
  department?: string
  portal_access: string[]
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface Yard {
  id: string
  name: string
  address?: string
  city: string
  state: string
  capacity: number
  notes?: string
  is_active: boolean
  created_at: string
  updated_at: string
}

export interface YardAssignment {
  id: string
  user_id: string
  yard_id: string
  is_primary: boolean
  assigned_at: string
}

/** What each role can access */
export const ROLE_PERMISSIONS: Record<UserRole, {
  label: string
  portals: string[]
  description: string
}> = {
  admin: {
    label: 'Administrador',
    portals: ['homes', 'capital', 'clientes'],
    description: 'Acceso total a todos los portales',
  },
  operations: {
    label: 'Operaciones (Compras)',
    portals: ['homes'],
    description: 'Buscar, comprar, renovar y vender propiedades',
  },
  treasury: {
    label: 'Tesorería',
    portals: ['homes', 'capital'],
    description: 'Pagos, contabilidad, comisiones',
  },
  yard_manager: {
    label: 'Encargado de Yard',
    portals: ['homes'],
    description: 'Gestión de yards y propiedades asignadas',
  },
  // Legacy
  comprador: { label: 'Comprador (legacy)', portals: ['homes'], description: '' },
  renovador: { label: 'Renovador (legacy)', portals: ['homes'], description: '' },
  vendedor: { label: 'Vendedor (legacy)', portals: ['homes'], description: '' },
}

// ============================================================================
// VOCABULARY (Maninos terminology — Feb 2026)
// ============================================================================

/** Maninos-specific property type labels */
export const PROPERTY_TYPE_LABELS: Record<string, string> = {
  single_wide: 'Casa de una sección',
  double_wide: 'Casa doble',
  mobile_home: 'Casa móvil',
  manufactured: 'Casa manufacturada',
  // English fallbacks
  'single wide': 'Casa de una sección',
  'double wide': 'Casa doble',
  'mobile home': 'Casa móvil',
}

/** Get the Spanish label for a property type */
export function getPropertyTypeLabel(type?: string | null): string {
  if (!type) return 'Casa móvil'
  const key = type.toLowerCase().trim()
  return PROPERTY_TYPE_LABELS[key] || type
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface ApiError {
  detail: string
}

export interface ClientsSummary {
  lead: number
  active: number
  completed: number
  total: number
}

export interface SalesSummary {
  total_sales: number
  total_revenue: number
  pending: number
  paid: number
  completed: number
  cancelled: number
  contado: number
  rto: number
  sold_before_renovation: number
  sold_after_renovation: number
}
