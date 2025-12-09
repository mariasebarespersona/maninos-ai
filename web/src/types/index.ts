export type TitleStatus = 'Clean/Blue' | 'Missing' | 'Lien' | 'Other' | null;

export interface Property {
  id: string;
  name: string;
  address: string;
  park_name?: string;
  asking_price?: number;
  market_value?: number;
  arv?: number;
  repair_estimate?: number;
  title_status?: TitleStatus;
  status?: string;
  created_at?: string;
}

