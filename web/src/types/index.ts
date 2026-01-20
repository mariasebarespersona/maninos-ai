/**
 * MANINOS AI - Type Definitions
 * 
 * Core types for the Maninos Capital rent-to-own platform.
 */

// ============================================================================
// CHAT
// ============================================================================

export interface ChatMessage {
  id: string
  role: 'user' | 'assistant'
  content: string
  timestamp?: string
  agent?: string
}

// ============================================================================
// CLIENT (INCORPORAR)
// ============================================================================

export interface Client {
  id: string
  full_name: string
  email: string
  phone?: string
  date_of_birth?: string
  ssn_itin?: string
  marital_status?: 'single' | 'married' | 'other'
  current_address?: string
  city?: string
  state?: string
  zip_code?: string
  residence_type?: 'owned' | 'rented' | 'other'
  
  // Employment
  employer?: string
  occupation?: string
  employer_address?: string
  employer_phone?: string
  monthly_income?: number
  years_at_employer?: number
  months_at_employer?: number
  other_income_source?: boolean
  other_income_amount?: number
  
  // Credit
  credit_requested_amount?: number
  credit_purpose?: string
  desired_term_months?: number
  preferred_payment_method?: string
  
  // KYC
  kyc_status: 'pending' | 'verified' | 'rejected' | 'canceled'
  stripe_verification_session_id?: string
  credit_score?: number
  
  // DTI
  dti_score?: number
  dti_rating?: 'excellent' | 'good' | 'limited' | 'not_qualified'
  
  // References
  reference1_name?: string
  reference1_phone?: string
  reference1_relationship?: string
  reference2_name?: string
  reference2_phone?: string
  reference2_relationship?: string
  
  // Process
  process_stage?: string
  created_at?: string
  updated_at?: string
}

// ============================================================================
// PROPERTY (ADQUIRIR)
// ============================================================================

export interface Property {
  id: string
  name?: string
  address: string
  city?: string
  state?: string
  zip_code?: string
  county?: string
  
  // Financials
  asking_price?: number
  market_value?: number
  arv?: number
  repair_estimate?: number
  max_offer_70?: number
  max_investment_80?: number
  
  // Details
  year_built?: number
  bedrooms?: number
  bathrooms?: number
  square_feet?: number
  lot_size?: string
  vin_number?: string
  
  // Status
  inventory_status: 'sourcing' | 'evaluating' | 'under_contract' | 'owned' | 'listed' | 'sold'
  acquisition_stage?: string
  title_status?: 'clean' | 'liens' | 'unknown'
  
  // Inspection
  checklist_completed?: boolean
  checklist_results?: Record<string, boolean>
  
  created_at?: string
  updated_at?: string
}

// ============================================================================
// INVESTOR (FONDEAR)
// ============================================================================

export interface Investor {
  id: string
  full_name: string
  email: string
  phone?: string
  company_name?: string
  
  // Type
  investor_type: 'individual' | 'entity' | 'accredited'
  accredited_status?: boolean
  
  // KYC
  kyc_status: 'pending' | 'verified' | 'rejected'
  
  // Investment
  total_invested?: number
  active_investments?: number
  
  created_at?: string
  updated_at?: string
}

// ============================================================================
// RTO CONTRACT (GESTIONAR CARTERA)
// ============================================================================

export interface RTOContract {
  id: string
  contract_number?: string
  
  // Relations
  client_id: string
  property_id: string
  
  // Terms
  term_months: number
  monthly_rent: number
  down_payment: number
  purchase_option_price: number
  payment_day: number
  
  // Fees
  late_fee_per_day?: number
  nsf_fee?: number
  
  // Dates
  start_date?: string
  end_date?: string
  
  // Status
  status: 'draft' | 'pending_signature' | 'active' | 'completed' | 'terminated' | 'defaulted'
  
  created_at?: string
  updated_at?: string
}

// ============================================================================
// PAYMENT
// ============================================================================

export interface Payment {
  id: string
  contract_id: string
  client_id: string
  
  amount: number
  payment_date: string
  due_date?: string
  
  payment_type: 'rent' | 'down_payment' | 'late_fee' | 'other'
  payment_method?: 'card' | 'zelle' | 'check' | 'cash'
  
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  
  stripe_payment_id?: string
  
  created_at?: string
}

// ============================================================================
// PROCESS LOG
// ============================================================================

export interface ProcessLog {
  id: string
  entity_type: 'property' | 'client' | 'investor' | 'contract' | 'payment'
  entity_id: string
  process: 'ADQUIRIR' | 'COMERCIALIZAR' | 'INCORPORAR' | 'FONDEAR' | 'GESTIONAR' | 'ENTREGAR'
  action: string
  details?: Record<string, unknown>
  created_at?: string
}
