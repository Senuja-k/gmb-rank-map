-- Supabase Auth RBAC for GBP Manager.

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null check (role in ('super_admin', 'admin', 'user')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  is_active boolean not null default true
);

create index if not exists profiles_role_idx on public.profiles(role);
create index if not exists profiles_is_active_idx on public.profiles(is_active);

create or replace function public.is_super_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role = 'super_admin'
      and is_active = true
  );
$$;

create or replace function public.is_admin_or_super_admin(user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.profiles
    where id = user_id
      and role in ('admin', 'super_admin')
      and is_active = true
  );
$$;

create or replace function public.prevent_last_super_admin_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  active_super_admin_count integer;
begin
  if tg_op = 'UPDATE' then
    if old.role = 'super_admin'
       and (new.role <> 'super_admin' or new.is_active = false) then
      select count(*) into active_super_admin_count
      from public.profiles
      where role = 'super_admin'
        and is_active = true
        and id <> old.id;

      if active_super_admin_count = 0 then
        raise exception 'Cannot remove, demote, or disable the last active super_admin';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'DELETE' and old.role = 'super_admin' and old.is_active = true then
    select count(*) into active_super_admin_count
    from public.profiles
    where role = 'super_admin'
      and is_active = true
      and id <> old.id;

    if active_super_admin_count = 0 then
      raise exception 'Cannot delete the last active super_admin';
    end if;
  end if;

  return old;
end;
$$;

drop trigger if exists profiles_prevent_last_super_admin_change on public.profiles;
create trigger profiles_prevent_last_super_admin_change
before update or delete on public.profiles
for each row execute function public.prevent_last_super_admin_change();

alter table public.profiles enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
drop policy if exists "profiles_admin_read" on public.profiles;
drop policy if exists "profiles_super_admin_update" on public.profiles;

create policy "profiles_select_self_or_admin"
  on public.profiles for select
  to authenticated
  using (id = auth.uid() or public.is_admin_or_super_admin(auth.uid()));

create policy "profiles_admin_read"
  on public.profiles for select
  to authenticated
  using (public.is_admin_or_super_admin(auth.uid()));

create policy "profiles_super_admin_update"
  on public.profiles for update
  to authenticated
  using (public.is_super_admin(auth.uid()))
  with check (public.is_super_admin(auth.uid()));

-- Replace the old single-user anonymous data policies with authenticated access.
drop policy if exists "anon_scans_all" on public.scans;
drop policy if exists "anon_budget_all" on public.budget;
drop policy if exists "anon_gbp_tokens_all" on public.gbp_tokens;

create policy "authenticated_scans_all"
  on public.scans for all
  to authenticated
  using (true)
  with check (true);

create policy "authenticated_budget_all"
  on public.budget for all
  to authenticated
  using (true)
  with check (true);

create policy "admin_gbp_tokens_all"
  on public.gbp_tokens for all
  to authenticated
  using (public.is_admin_or_super_admin(auth.uid()))
  with check (public.is_admin_or_super_admin(auth.uid()));

-- Later migrations add these tables; keep the policies guarded for idempotence.
do $$
begin
  if to_regclass('public.gbp_locations') is not null then
    alter table public.gbp_locations enable row level security;
    drop policy if exists "authenticated_gbp_locations_read" on public.gbp_locations;
    drop policy if exists "admin_gbp_locations_write" on public.gbp_locations;
    create policy "authenticated_gbp_locations_read"
      on public.gbp_locations for select to authenticated using (true);
    create policy "admin_gbp_locations_write"
      on public.gbp_locations for all to authenticated
      using (public.is_admin_or_super_admin(auth.uid()))
      with check (public.is_admin_or_super_admin(auth.uid()));
  end if;

  if to_regclass('public.app_settings') is not null then
    alter table public.app_settings enable row level security;
    drop policy if exists "authenticated_app_settings_read" on public.app_settings;
    drop policy if exists "admin_app_settings_write" on public.app_settings;
    create policy "authenticated_app_settings_read"
      on public.app_settings for select to authenticated using (true);
    create policy "admin_app_settings_write"
      on public.app_settings for all to authenticated
      using (public.is_admin_or_super_admin(auth.uid()))
      with check (public.is_admin_or_super_admin(auth.uid()));
  end if;
end $$;

drop policy if exists "post_images_anon_insert" on storage.objects;
drop policy if exists "post_images_authenticated_insert" on storage.objects;
create policy "post_images_authenticated_insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'post-images');
