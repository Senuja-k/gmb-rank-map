create table if not exists scan_jobs (
  id                 text primary key,
  status             text not null default 'queued' check (status in ('queued', 'running', 'completed', 'failed')),
  request            jsonb not null default '{}',
  total_points       integer not null default 0,
  completed_points   integer not null default 0,
  total_keywords     integer not null default 0,
  completed_keywords integer not null default 0,
  active_keyword     text not null default '',
  scan_ids           jsonb not null default '[]',
  error              text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  finished_at        timestamptz
);

create index if not exists scan_jobs_status_created_at_idx
  on scan_jobs (status, created_at desc);

alter table scan_jobs enable row level security;

drop policy if exists "authenticated_scan_jobs_read" on scan_jobs;
drop policy if exists "admin_scan_jobs_write" on scan_jobs;

create policy "authenticated_scan_jobs_read"
  on scan_jobs for select to authenticated using (true);

create policy "admin_scan_jobs_write"
  on scan_jobs for all to authenticated
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and is_active = true
        and role in ('admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.profiles
      where id = auth.uid()
        and is_active = true
        and role in ('admin', 'super_admin')
    )
  );