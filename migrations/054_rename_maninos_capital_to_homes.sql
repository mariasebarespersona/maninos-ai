-- Migration 054: Rename "Maninos Capital LLC" to "Maninos Homes LLC" in all existing records
-- This ensures existing clients see "Maninos Homes" in all their documents and data.

-- 1. rto_contracts: signed_by_company
UPDATE rto_contracts
SET signed_by_company = 'Maninos Homes LLC'
WHERE signed_by_company = 'Maninos Capital LLC';

-- 2. title_transfers: from_name
UPDATE title_transfers
SET from_name = 'Maninos Homes LLC'
WHERE from_name = 'Maninos Capital LLC';

-- 3. title_transfers: to_name
UPDATE title_transfers
SET to_name = 'Maninos Homes LLC'

WHERE to_name = 'Maninos Capital LLC';
