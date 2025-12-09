/**
 * MANINOS AI - TypeScript Types
 * Mobile Home Acquisition & Investment Analysis
 */

export type AcquisitionStage = 
  | 'initial' 
  | 'passed_70_rule' 
  | 'inspection_done' 
  | 'passed_80_rule' 
  | 'rejected';

export type TitleStatus = 
  | 'Clean/Blue' 
  | 'Missing' 
  | 'Lien' 
  | 'Other';

export interface MobileHomeProperty {
  id: string;
  name: string;
  address: string;
  park_name?: string;
  asking_price?: number;
  market_value?: number;
  arv?: number;
  repair_estimate?: number;
  title_status?: TitleStatus;
  acquisition_stage: AcquisitionStage;
  created_at: string;
  updated_at: string;
}

export interface InspectionItem {
  category: string;
  key: string;
  description: string;
  defect?: boolean;
  cost?: number;
}

export interface InspectionChecklist {
  checklist: InspectionItem[];
  defect_costs: Record<string, number>;
  instructions: string;
}

export interface DealMetrics {
  asking_price: number;
  market_value: number;
  arv: number;
  repair_costs: number;
  total_investment: number;
  max_allowable_offer_70: number;
  max_investment_80: number;
  rule_70_status: 'PASS' | 'FAIL' | 'PENDING';
  rule_80_status: 'PASS' | 'FAIL' | 'PENDING';
  roi?: number;
  potential_profit?: number;
}

export interface InspectionRecord {
  id: string;
  property_id: string;
  defects: string[];
  title_status: TitleStatus;
  repair_estimate: number;
  notes?: string;
  created_at: string;
  created_by?: string;
}

export interface BuyContract {
  contract_text: string;
  property_name: string;
  purchase_price: number;
  total_investment: number;
  projected_profit: number;
  roi: number;
  contract_date: string;
  status: 'draft' | 'final';
}

// Stage display configuration
export const STAGE_CONFIG: Record<AcquisitionStage, { label: string; color: string; icon: string }> = {
  initial: { label: 'Initial', color: 'gray', icon: '○' },
  passed_70_rule: { label: '70% Passed', color: 'blue', icon: '◐' },
  inspection_done: { label: 'Inspected', color: 'yellow', icon: '◑' },
  passed_80_rule: { label: '80% Passed', color: 'green', icon: '●' },
  rejected: { label: 'Rejected', color: 'red', icon: '✕' },
};

// Title status colors
export const TITLE_STATUS_CONFIG: Record<TitleStatus, { color: string; severity: 'success' | 'warning' | 'error' }> = {
  'Clean/Blue': { color: 'green', severity: 'success' },
  'Missing': { color: 'red', severity: 'error' },
  'Lien': { color: 'orange', severity: 'warning' },
  'Other': { color: 'yellow', severity: 'warning' },
};

