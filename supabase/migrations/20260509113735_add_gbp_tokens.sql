-- GBP OAuth tokens – one row per connected Google Business Profile account
create table if not exists gbp_tokens (
  account_id    text primary key,           -- GBP account ID (e.g. "123456789")
  access_token  text not null,
  refresh_token text,                        -- populated after first offline grant
  expiry_date   bigint,                      -- Unix ms timestamp
  updated_at    timestamptz not null default now()
);

alter table gbp_tokens enable row level security;

create policy "anon_gbp_tokens_all"
  on gbp_tokens
  for all
  using (true)
  with check (true);
