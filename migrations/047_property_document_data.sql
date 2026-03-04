-- Migration 047: Add document_data JSONB column to properties
-- Stores filled-in template data for Bill of Sale and Title Application
-- so documents display with employee-entered info instead of empty templates.
--
-- Structure:
--   {
--     "bos_purchase": { ...BillOfSaleData },
--     "bos_sale": { ...BillOfSaleData },
--     "title_app_purchase": { ...TitleApplicationData },
--     "title_app_sale": { ...TitleApplicationData }
--   }
--
-- Run this in Supabase SQL Editor

ALTER TABLE properties ADD COLUMN IF NOT EXISTS document_data JSONB DEFAULT '{}'::jsonb;

COMMENT ON COLUMN properties.document_data IS 'Stores filled-in template data for Bill of Sale and Title Application documents (JSON). Keys: bos_purchase, bos_sale, title_app_purchase, title_app_sale.';

