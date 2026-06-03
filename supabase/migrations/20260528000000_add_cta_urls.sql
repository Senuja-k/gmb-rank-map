-- Add per-location CTA URL column
alter table gbp_locations add column if not exists cta_url text not null default '';

-- Global app settings (key/value store for things like common CTA URL)
create table if not exists app_settings (
  key   text primary key,
  value text not null default ''
);

alter table app_settings enable row level security;

create policy "anon_app_settings_all"
  on app_settings
  for all
  using (true)
  with check (true);

-- Seed the common CTA key so GET always returns a row
insert into app_settings (key, value)
values ('common_cta_url', '')
on conflict (key) do nothing;
