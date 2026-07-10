-- Track Gemini Grounding with Google Search monthly free-prompt usage.
-- This is a shared monthly pool, stored on api_key_index = 0 after the
-- multi-key budget migration.

ALTER TABLE budget
ADD COLUMN IF NOT EXISTS gemini_search_grounding_prompts integer NOT NULL DEFAULT 0;
