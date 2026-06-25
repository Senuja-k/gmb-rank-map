create table if not exists gbp_review_reports (
  id              text primary key,
  title           text not null,
  start_date      date not null,
  end_date        date not null,
  month_label     text not null,
  locations       jsonb not null default '[]',
  manual_values   jsonb not null default '{}',
  computed_values jsonb not null default '{}',
  created_at      timestamptz not null default now()
);

create index if not exists gbp_review_reports_created_at_idx
  on gbp_review_reports (created_at desc);

create index if not exists gbp_review_reports_date_range_idx
  on gbp_review_reports (start_date, end_date);

alter table gbp_review_reports enable row level security;

create policy "anon_gbp_review_reports_all"
  on gbp_review_reports
  for all
  using (true)
  with check (true);
