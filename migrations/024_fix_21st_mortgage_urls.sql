-- Migration 024: Fix 21st Mortgage listing URLs to use the detail page format
-- The correct format is: /details?OpenForm&idn={IDN}-0-N (not /locating)

-- Fix URLs that use the old /locating format
UPDATE market_listings
SET source_url = 
  'https://www.21stmortgage.com/web/21stsite.nsf/details?OpenForm&idn=' || 
  REGEXP_REPLACE(source_url, '.*idn=(\d+).*', '\1') || 
  '-0-N'
WHERE source = '21st_mortgage'
  AND source_url LIKE '%locating%';
