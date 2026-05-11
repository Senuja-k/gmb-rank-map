-- Add google_email to gbp_tokens so we know which Google account is connected
alter table gbp_tokens add column if not exists google_email text;

-- GBP locations selected by the user in the Connect page
create table if not exists gbp_locations (
  location_name text primary key,        -- "accounts/X/locations/Y"
  account_name  text not null,           -- "accounts/X"
  display_name  text not null,           -- Business display name
  address       text not null default '',
  is_enabled    boolean not null default true,
  created_at    timestamptz not null default now()
);

alter table gbp_locations enable row level security;

create policy "anon_gbp_locations_all"
  on gbp_locations
  for all
  using (true)
  with check (true);
