ALTER TABLE budget
  ADD COLUMN IF NOT EXISTS text_search_essentials_calls integer NOT NULL DEFAULT 0;

ALTER TABLE scans
  ADD COLUMN IF NOT EXISTS rank_only boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scan_mode text NOT NULL DEFAULT 'pro_full';

