
-- ============ EXTENSIONS ============
create extension if not exists pg_trgm;

-- ============ ENUMS ============
create type public.app_role as enum ('admin','warehouse','event_manager','technician','accounting','director');
create type public.location_type as enum ('warehouse','shelf','sector','vehicle','field','backstage','event_zone');
create type public.asset_status as enum ('available','reserved','at_event','in_transit','returned','damaged','in_service','written_off');
create type public.event_status as enum ('draft','confirmed','in_progress','completed','cancelled');
create type public.reservation_status as enum ('reserved','picked','returned','missing');
create type public.inventory_status as enum ('open','completed','cancelled');
create type public.inventory_type as enum ('regular','ad_hoc');
create type public.service_type as enum ('repair','maintenance','inspection');
create type public.service_status as enum ('reported','in_progress','completed','cancelled');

-- ============ UTIL: updated_at trigger ============
create or replace function public.tg_set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ============ PROFILES ============
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create trigger set_updated_at before update on public.profiles
  for each row execute function public.tg_set_updated_at();

-- ============ USER ROLES ============
create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique(user_id, role)
);
alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.has_any_role(_user_id uuid, _roles public.app_role[])
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.user_roles where user_id = _user_id and role = any(_roles))
$$;

-- ============ AUTO-CREATE PROFILE + FIRST USER = ADMIN ============
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare _is_first boolean;
begin
  insert into public.profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', new.email));
  select not exists(select 1 from public.user_roles) into _is_first;
  if _is_first then
    insert into public.user_roles (user_id, role) values (new.id, 'admin');
  else
    insert into public.user_roles (user_id, role) values (new.id, 'warehouse');
  end if;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============ LOCATIONS ============
create table public.locations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.location_type not null default 'warehouse',
  parent_id uuid references public.locations(id) on delete set null,
  address text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.locations enable row level security;
create trigger set_updated_at before update on public.locations
  for each row execute function public.tg_set_updated_at();
create index on public.locations(parent_id);

-- ============ CATEGORIES ============
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  parent_id uuid references public.categories(id) on delete set null,
  icon text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create trigger set_updated_at before update on public.categories
  for each row execute function public.tg_set_updated_at();

-- ============ ASSETS ============
create table public.assets (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  serial_number text,
  category_id uuid references public.categories(id) on delete set null,
  description text,
  qr_code text,
  barcode text,
  purchase_date date,
  purchase_value numeric(14,2),
  current_value numeric(14,2),
  depreciation_rate numeric(5,2),
  depreciation_method text,
  status public.asset_status not null default 'available',
  current_location_id uuid references public.locations(id) on delete set null,
  responsible_user_id uuid references auth.users(id) on delete set null,
  quantity integer not null default 1,
  unit text default 'kom',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.assets enable row level security;
create trigger set_updated_at before update on public.assets
  for each row execute function public.tg_set_updated_at();
create index on public.assets(status);
create index on public.assets(current_location_id);
create index on public.assets(category_id);
create index assets_name_trgm_idx on public.assets using gin (name gin_trgm_ops);
create index assets_code_trgm_idx on public.assets using gin (code gin_trgm_ops);

create table public.asset_photos (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  storage_path text not null,
  is_primary boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.asset_photos enable row level security;

create table public.asset_status_history (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  from_status public.asset_status,
  to_status public.asset_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text,
  changed_at timestamptz not null default now()
);
alter table public.asset_status_history enable row level security;
create index on public.asset_status_history(asset_id);

create or replace function public.tg_log_asset_status()
returns trigger language plpgsql as $$
begin
  if (tg_op = 'UPDATE' and new.status is distinct from old.status) then
    insert into public.asset_status_history(asset_id, from_status, to_status, changed_by)
    values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end $$;
create trigger asset_status_history_trg
  after update on public.assets
  for each row execute function public.tg_log_asset_status();

-- ============ CLIENTS ============
create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact text,
  email text,
  phone text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.clients enable row level security;
create trigger set_updated_at before update on public.clients
  for each row execute function public.tg_set_updated_at();

-- ============ EVENTS ============
create table public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id) on delete set null,
  location_text text,
  location_id uuid references public.locations(id) on delete set null,
  start_at timestamptz not null,
  end_at timestamptz not null,
  status public.event_status not null default 'draft',
  manager_id uuid references auth.users(id) on delete set null,
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.events enable row level security;
create trigger set_updated_at before update on public.events
  for each row execute function public.tg_set_updated_at();
create index on public.events(start_at);
create index on public.events(status);

create table public.event_team (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_on_event text,
  created_at timestamptz not null default now(),
  unique(event_id, user_id)
);
alter table public.event_team enable row level security;

create table public.event_assets (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  quantity integer not null default 1,
  reserved_from timestamptz not null,
  reserved_to timestamptz not null,
  status public.reservation_status not null default 'reserved',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.event_assets enable row level security;
create trigger set_updated_at before update on public.event_assets
  for each row execute function public.tg_set_updated_at();
create index on public.event_assets(event_id);
create index on public.event_assets(asset_id);

-- ============ CHECKOUTS (revers) ============
create table public.checkouts (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  event_id uuid references public.events(id) on delete set null,
  checked_out_to uuid references auth.users(id) on delete set null,
  checked_out_to_name text,
  checked_out_by uuid references auth.users(id) on delete set null,
  checked_out_at timestamptz not null default now(),
  expected_return_at timestamptz,
  returned_at timestamptz,
  return_received_by uuid references auth.users(id) on delete set null,
  signature_path text,
  return_signature_path text,
  notes text,
  condition_out text,
  condition_in text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.checkouts enable row level security;
create trigger set_updated_at before update on public.checkouts
  for each row execute function public.tg_set_updated_at();
create index on public.checkouts(asset_id);
create index on public.checkouts(event_id);
create index on public.checkouts(returned_at);

-- ============ INVENTORIES ============
create table public.inventories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type public.inventory_type not null default 'regular',
  location_id uuid references public.locations(id) on delete set null,
  status public.inventory_status not null default 'open',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  started_by uuid references auth.users(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.inventories enable row level security;
create trigger set_updated_at before update on public.inventories
  for each row execute function public.tg_set_updated_at();

create table public.inventory_lines (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  asset_id uuid not null references public.assets(id) on delete cascade,
  expected_qty integer not null default 1,
  counted_qty integer,
  scanned_at timestamptz,
  scanned_by uuid references auth.users(id) on delete set null,
  note text,
  unique(inventory_id, asset_id)
);
alter table public.inventory_lines enable row level security;
create index on public.inventory_lines(inventory_id);

-- ============ SERVICE & DAMAGE ============
create table public.service_records (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  type public.service_type not null default 'repair',
  status public.service_status not null default 'reported',
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  description text,
  service_provider text,
  cost numeric(14,2),
  started_at timestamptz,
  completed_at timestamptz,
  next_service_due date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.service_records enable row level security;
create trigger set_updated_at before update on public.service_records
  for each row execute function public.tg_set_updated_at();
create index on public.service_records(asset_id);

create table public.damage_reports (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  reported_by uuid references auth.users(id) on delete set null,
  reported_at timestamptz not null default now(),
  severity text,
  description text,
  photo_paths text[] default '{}',
  service_record_id uuid references public.service_records(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.damage_reports enable row level security;

-- ============ API KEYS ============
create table public.api_keys (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  key_hash text not null,
  scopes text[] not null default '{read}',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
alter table public.api_keys enable row level security;

-- ============ AUDIT LOG ============
create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  diff jsonb,
  created_at timestamptz not null default now()
);
alter table public.audit_log enable row level security;

-- ============ RLS POLICIES ============

-- profiles
create policy "Profiles: own select" on public.profiles for select using (auth.uid() = id);
create policy "Profiles: admin select all" on public.profiles for select using (public.has_any_role(auth.uid(), array['admin','director']::app_role[]));
create policy "Profiles: own update" on public.profiles for update using (auth.uid() = id);
create policy "Profiles: admin update" on public.profiles for update using (public.has_role(auth.uid(),'admin'));

-- user_roles
create policy "Roles: read own" on public.user_roles for select using (auth.uid() = user_id);
create policy "Roles: admin all" on public.user_roles for all using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- generic helper: any authenticated read, write by privileged roles
-- locations
create policy "Locations: read auth" on public.locations for select to authenticated using (true);
create policy "Locations: write priv" on public.locations for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

-- categories
create policy "Categories: read auth" on public.categories for select to authenticated using (true);
create policy "Categories: write priv" on public.categories for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

-- assets
create policy "Assets: read auth" on public.assets for select to authenticated using (true);
create policy "Assets: write priv" on public.assets for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

-- asset_photos
create policy "AssetPhotos: read auth" on public.asset_photos for select to authenticated using (true);
create policy "AssetPhotos: write priv" on public.asset_photos for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse','technician']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse','technician']::app_role[]));

-- asset_status_history
create policy "StatusHistory: read auth" on public.asset_status_history for select to authenticated using (true);
create policy "StatusHistory: insert auth" on public.asset_status_history for insert to authenticated with check (true);

-- clients
create policy "Clients: read auth" on public.clients for select to authenticated using (true);
create policy "Clients: write priv" on public.clients for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]));

-- events
create policy "Events: read auth" on public.events for select to authenticated using (true);
create policy "Events: write priv" on public.events for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]));

-- event_team
create policy "EventTeam: read auth" on public.event_team for select to authenticated using (true);
create policy "EventTeam: write priv" on public.event_team for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','event_manager']::app_role[]));

-- event_assets
create policy "EventAssets: read auth" on public.event_assets for select to authenticated using (true);
create policy "EventAssets: write priv" on public.event_assets for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','event_manager','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','event_manager','warehouse']::app_role[]));

-- checkouts
create policy "Checkouts: read auth" on public.checkouts for select to authenticated using (true);
create policy "Checkouts: write priv" on public.checkouts for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse','event_manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse','event_manager']::app_role[]));

-- inventories
create policy "Inventories: read auth" on public.inventories for select to authenticated using (true);
create policy "Inventories: write priv" on public.inventories for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

create policy "InventoryLines: read auth" on public.inventory_lines for select to authenticated using (true);
create policy "InventoryLines: write priv" on public.inventory_lines for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

-- service & damage
create policy "Service: read auth" on public.service_records for select to authenticated using (true);
create policy "Service: write priv" on public.service_records for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','technician','warehouse']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','technician','warehouse']::app_role[]));

create policy "Damage: read auth" on public.damage_reports for select to authenticated using (true);
create policy "Damage: write priv" on public.damage_reports for all to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director','technician','warehouse','event_manager']::app_role[]))
  with check (public.has_any_role(auth.uid(), array['admin','director','technician','warehouse','event_manager']::app_role[]));

-- api_keys (admin only)
create policy "ApiKeys: admin all" on public.api_keys for all to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));

-- audit_log
create policy "Audit: admin/director read" on public.audit_log for select to authenticated
  using (public.has_any_role(auth.uid(), array['admin','director']::app_role[]));
create policy "Audit: insert auth" on public.audit_log for insert to authenticated with check (true);

-- ============ STORAGE BUCKETS ============
insert into storage.buckets (id, name, public) values
  ('asset-photos','asset-photos', true),
  ('signatures','signatures', false),
  ('damage-photos','damage-photos', false)
on conflict (id) do nothing;

-- asset-photos: public read, authenticated write
create policy "asset-photos read public" on storage.objects for select using (bucket_id = 'asset-photos');
create policy "asset-photos write auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'asset-photos');
create policy "asset-photos update auth" on storage.objects for update to authenticated
  using (bucket_id = 'asset-photos');
create policy "asset-photos delete priv" on storage.objects for delete to authenticated
  using (bucket_id = 'asset-photos' and public.has_any_role(auth.uid(), array['admin','director','warehouse']::app_role[]));

-- signatures: private auth read/write
create policy "signatures read auth" on storage.objects for select to authenticated
  using (bucket_id = 'signatures');
create policy "signatures write auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'signatures');

-- damage-photos: private auth read/write
create policy "damage-photos read auth" on storage.objects for select to authenticated
  using (bucket_id = 'damage-photos');
create policy "damage-photos write auth" on storage.objects for insert to authenticated
  with check (bucket_id = 'damage-photos');

ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER TABLE public.checkouts REPLICA IDENTITY FULL;
ALTER TABLE public.events REPLICA IDENTITY FULL;
ALTER TABLE public.service_records REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.checkouts;
ALTER PUBLICATION supabase_realtime ADD TABLE public.events;
ALTER PUBLICATION supabase_realtime ADD TABLE public.service_records;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.asset_photos TO authenticated;
GRANT ALL ON public.asset_photos TO service_role;
CREATE OR REPLACE FUNCTION public.add_asset_photo(
  _asset_id uuid,
  _storage_path text,
  _is_primary boolean DEFAULT false
)
RETURNS public.asset_photos
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inserted_photo public.asset_photos;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  IF NOT public.has_any_role(auth.uid(), ARRAY['admin'::public.app_role, 'director'::public.app_role, 'warehouse'::public.app_role, 'technician'::public.app_role]) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  INSERT INTO public.asset_photos (asset_id, storage_path, is_primary)
  VALUES (_asset_id, _storage_path, _is_primary)
  RETURNING * INTO inserted_photo;

  RETURN inserted_photo;
END;
$$;

REVOKE ALL ON FUNCTION public.add_asset_photo(uuid, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.add_asset_photo(uuid, text, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_asset_photo(uuid, text, boolean) TO service_role;
DROP FUNCTION IF EXISTS public.add_asset_photo(uuid, text, boolean);
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'checkout_operator';

DROP POLICY IF EXISTS "Assets: write priv" ON public.assets;
DROP POLICY IF EXISTS "Assets: insert manage" ON public.assets;
DROP POLICY IF EXISTS "Assets: delete manage" ON public.assets;
DROP POLICY IF EXISTS "Assets: update checkout+" ON public.assets;

CREATE POLICY "Assets: insert manage" ON public.assets
  FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse']::app_role[]));

CREATE POLICY "Assets: delete manage" ON public.assets
  FOR DELETE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse']::app_role[]));

CREATE POLICY "Assets: update checkout+" ON public.assets
  FOR UPDATE TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','event_manager','checkout_operator']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','event_manager','checkout_operator']::app_role[]));

DROP POLICY IF EXISTS "Checkouts: write priv" ON public.checkouts;
CREATE POLICY "Checkouts: write priv" ON public.checkouts
  FOR ALL TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','event_manager','checkout_operator']::app_role[]))
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','event_manager','checkout_operator']::app_role[]));


-- Generic audit trigger: logs INSERT/UPDATE/DELETE on selected tables into public.audit_log
create or replace function public.log_audit_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entity_id uuid;
  v_diff jsonb;
begin
  if tg_op = 'DELETE' then
    v_entity_id := (to_jsonb(old)->>'id')::uuid;
    v_diff := jsonb_build_object('old', to_jsonb(old));
  elsif tg_op = 'INSERT' then
    v_entity_id := (to_jsonb(new)->>'id')::uuid;
    v_diff := jsonb_build_object('new', to_jsonb(new));
  else
    v_entity_id := (to_jsonb(new)->>'id')::uuid;
    v_diff := jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new));
  end if;

  insert into public.audit_log (user_id, action, entity_type, entity_id, diff)
  values (auth.uid(), lower(tg_op), tg_table_name, v_entity_id, v_diff);

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- Attach to key tables
drop trigger if exists audit_assets on public.assets;
create trigger audit_assets
  after insert or update or delete on public.assets
  for each row execute function public.log_audit_event();

drop trigger if exists audit_checkouts on public.checkouts;
create trigger audit_checkouts
  after insert or update or delete on public.checkouts
  for each row execute function public.log_audit_event();

drop trigger if exists audit_events on public.events;
create trigger audit_events
  after insert or update or delete on public.events
  for each row execute function public.log_audit_event();

drop trigger if exists audit_user_roles on public.user_roles;
create trigger audit_user_roles
  after insert or update or delete on public.user_roles
  for each row execute function public.log_audit_event();

drop trigger if exists audit_categories on public.categories;
create trigger audit_categories
  after insert or update or delete on public.categories
  for each row execute function public.log_audit_event();

drop trigger if exists audit_locations on public.locations;
create trigger audit_locations
  after insert or update or delete on public.locations
  for each row execute function public.log_audit_event();

drop trigger if exists audit_service_records on public.service_records;
create trigger audit_service_records
  after insert or update or delete on public.service_records
  for each row execute function public.log_audit_event();

-- Index for fast recent lookup
create index if not exists audit_log_created_at_idx on public.audit_log (created_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);


-- 1. clients_table_sensitive_data
DROP POLICY IF EXISTS "Clients: read auth" ON public.clients;
CREATE POLICY "Clients: read priv" ON public.clients FOR SELECT TO authenticated
  USING (public.has_any_role(auth.uid(), ARRAY['admin','director','event_manager']::app_role[]));

-- 2. user_roles_insert_missing (actually audit_log)
DROP POLICY IF EXISTS "Audit: insert auth" ON public.audit_log;
CREATE POLICY "Audit: insert own" ON public.audit_log FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- 3. asset_status_history_unrestricted_insert
DROP POLICY IF EXISTS "StatusHistory: insert auth" ON public.asset_status_history;
CREATE POLICY "StatusHistory: insert priv" ON public.asset_status_history FOR INSERT TO authenticated
  WITH CHECK (public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','technician','event_manager','checkout_operator']::app_role[]));

-- 4. asset_photos_storage_unrestricted_update + tighten INSERT
DROP POLICY IF EXISTS "asset-photos update auth" ON storage.objects;
CREATE POLICY "asset-photos update priv" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'asset-photos' AND public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','technician']::app_role[]))
  WITH CHECK (bucket_id = 'asset-photos' AND public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','technician']::app_role[]));

DROP POLICY IF EXISTS "asset-photos write auth" ON storage.objects;
CREATE POLICY "asset-photos insert priv" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'asset-photos' AND public.has_any_role(auth.uid(), ARRAY['admin','director','warehouse','technician']::app_role[]));

-- 5. SUPA_public_bucket_allows_listing — remove listing policy; public bucket files still served via CDN by direct URL
DROP POLICY IF EXISTS "asset-photos read public" ON storage.objects;

-- 6. realtime_no_channel_authorization — restrict realtime.messages to authenticated
DO $$ BEGIN
  EXECUTE 'ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY';
EXCEPTION WHEN others THEN NULL; END $$;
DROP POLICY IF EXISTS "Realtime: authenticated read" ON realtime.messages;
CREATE POLICY "Realtime: authenticated read" ON realtime.messages FOR SELECT TO authenticated USING (true);

-- 7. SUPA_extension_in_public
ALTER EXTENSION pg_trgm SET SCHEMA extensions;

-- 8. SUPA_function_search_path_mutable
ALTER FUNCTION public.tg_set_updated_at() SET search_path = public;
ALTER FUNCTION public.tg_log_asset_status() SET search_path = public;

-- 9. SECURITY DEFINER function executability
-- Keep has_role / has_any_role callable by authenticated (used in RLS policies).
-- Revoke on trigger-only definer functions.
REVOKE EXECUTE ON FUNCTION public.log_audit_event() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_any_role(uuid, app_role[]) FROM PUBLIC, anon;

