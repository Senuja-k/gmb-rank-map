-- ============================================================================
-- GMB Rank Map – Supabase schema
-- Run this in the Supabase SQL Editor (Dashboard → SQL Editor → New query)
-- ============================================================================

-- 1. Scans table – one row per scan
create table if not exists scans (
  id             text primary key,
  business_name  text not null,
  place_id       text not null,
  keyword        text not null default '',
  center         jsonb not null,          -- { lat, lng }
  grid_size      integer not null,
  spacing_km     real not null default 1,
  created_at     timestamptz not null default now(),
  grid_points    jsonb not null default '[]',  -- array of { lat, lng, rank, competitors }
  competitors    jsonb not null default '[]',  -- aggregated competitor summaries
  avg_rank       real,
  top3_pct       real,
  total_points   integer not null default 0
);

-- Index for listing scans newest-first
create index if not exists scans_created_at_idx on scans (created_at desc);

-- 2. Budget table – one row per calendar month
create table if not exists budget (
  month               text primary key,       -- e.g. "2026-04"
  text_search_calls   integer not null default 0,
  nearby_search_calls integer not null default 0
);

-- 3. Enable Row Level Security (tables are open via anon key for now)
alter table scans  enable row level security;
alter table budget enable row level security;

-- Allow full access with the anon key (single-user app)
create policy "anon_scans_all"  on scans  for all using (true) with check (true);
create policy "anon_budget_all" on budget for all using (true) with check (true);

-- 4. GBP OAuth tokens – one row per connected Google account
create table if not exists gbp_tokens (
  account_id    text primary key,           -- GBP account ID (e.g. "123456789")
  access_token  text not null,
  refresh_token text,                        -- null until first offline grant
  expiry_date   bigint,                      -- Unix ms timestamp
  updated_at    timestamptz not null default now()
);

alter table gbp_tokens enable row level security;
create policy "anon_gbp_tokens_all" on gbp_tokens for all using (true) with check (true);
