-- Add review_prompt setting to app_settings table.
INSERT INTO app_settings (key, value)
VALUES ('review_prompt', '')
ON CONFLICT (key) DO NOTHING;
