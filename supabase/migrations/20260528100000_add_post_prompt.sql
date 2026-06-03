-- Add post_prompt setting to app_settings table.
-- app_settings was created in 20260519000000_multi_api_key_budget.sql
-- This just inserts a default (no-op if row already exists).
INSERT INTO app_settings (key, value)
VALUES ('post_prompt', '')
ON CONFLICT (key) DO NOTHING;
