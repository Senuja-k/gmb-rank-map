-- Migration: support per-API-key budget tracking
-- Adds api_key_index (0-3) to the budget table and changes the primary key
-- to a composite (month, api_key_index).

-- 1. Add the new column (existing rows get api_key_index = 0)
ALTER TABLE budget ADD COLUMN IF NOT EXISTS api_key_index integer NOT NULL DEFAULT 0;

-- 2. Drop the old single-column primary key
ALTER TABLE budget DROP CONSTRAINT IF EXISTS budget_pkey;

-- 3. Establish the new composite primary key
ALTER TABLE budget ADD PRIMARY KEY (month, api_key_index);
