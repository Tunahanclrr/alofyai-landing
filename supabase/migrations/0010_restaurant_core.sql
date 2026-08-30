-- AlofyAI Phase 6 (öne alındı) — Restaurant Core
-- restaurant_tables, reservations + reservation_tables (denormalize edilmiş,
-- race-safe EXCLUDE constraint — README §3.5 tasarımı), menu_categories,
-- menu_items, book_reservation/cancel_reservation/reschedule_reservation RPC'leri.

-- ---------------------------------------------------------------------------
-- restaurant_tables
-- ---------------------------------------------------------------------------

create table restaurant_tables (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  label text not null,
  capacity int not null check (capacity > 0),
  area text,
  status text not null default 'available' check (status in ('available', 'reserved', 'occupied', 'cleaning', 'inactive')),
  pos_x numeric,
  pos_y numeric,
  width numeric,
  height numeric,
  rotation numeric,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index restaurant_tables_business_idx on restaurant_tables (business_id) where is_active;

-- ---------------------------------------------------------------------------
-- reservations (gerçek kaynak) + reservation_tables (senkronize edilmiş
-- yansıma — EXCLUDE constraint burada, çünkü Postgres EXCLUDE kısıtlanan
-- satırın KENDİ kolonlarını kullanmak zorunda; README §3.5 düzeltmesi)
-- ---------------------------------------------------------------------------

create table reservations (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  customer_id uuid not null references customers (id),
  party_size int not null check (party_size > 0),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed', 'seated', 'completed', 'cancelled', 'no_show')),
  source text not null default 'app' check (source in ('app', 'vapi', 'manual')),
  call_id uuid,
  cancel_reason text,
  notes text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  check (ends_at > starts_at)
);

create index reservations_business_idx on reservations (business_id, starts_at);

create table reservation_tables (
  id uuid primary key default gen_random_uuid(),
  reservation_id uuid not null,
  table_id uuid not null,
  business_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  status text not null default 'confirmed',
  is_active_hold boolean not null default true,
  foreign key (reservation_id, business_id) references reservations (id, business_id) on delete cascade,
  foreign key (table_id, business_id) references restaurant_tables (id, business_id),
  check (ends_at > starts_at)
);

alter table reservation_tables
  add constraint no_overlapping_table_reservations
  exclude using gist (business_id with =, table_id with =, during with &&)
  where (is_active_hold);

create index reservation_tables_reservation_idx on reservation_tables (reservation_id);
create index reservation_tables_table_idx on reservation_tables using gist (table_id, during);

-- reservations değişince reservation_tables'ı senkronize eder — hiçbir
-- uygulama kodu reservation_tables'a doğrudan starts_at/ends_at/status yazmaz.
create or replace function public.sync_reservation_tables()
returns trigger
language plpgsql
as $$
begin
  update reservation_tables
    set starts_at = new.starts_at,
        ends_at = new.ends_at,
        status = new.status,
        is_active_hold = (new.status in ('confirmed', 'seated'))
    where reservation_id = new.id;
  return new;
end;
$$;

create trigger reservations_sync_tables
  after update of starts_at, ends_at, status on reservations
  for each row execute function public.sync_reservation_tables();

create or replace function public.log_reservation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, before, after, source)
    values (
      new.business_id, auth.uid(), case when new.source = 'vapi' then 'vapi' else 'self' end,
      'reservation.status_change', 'reservations', new.id,
      jsonb_build_object('status', old.status), jsonb_build_object('status', new.status),
      case when new.source = 'vapi' then 'vapi' else 'app' end
    );
  end if;
  return new;
end;
$$;

create trigger reservations_log_status_change
  after update of status on reservations
  for each row execute function public.log_reservation_status_change();

-- Uygun masa önerisi — advisory/UX amaçlı; asıl race-safety EXCLUDE constraint'te.
create or replace function public.find_available_tables(
  p_business_id uuid, p_starts_at timestamptz, p_ends_at timestamptz, p_party_size int
)
returns setof restaurant_tables
language sql
stable
as $$
  select t.* from restaurant_tables t
  where t.business_id = p_business_id
    and t.is_active
    and t.capacity >= p_party_size
    and not exists (
      select 1 from reservation_tables rt
      where rt.table_id = t.id
        and rt.is_active_hold
        and rt.during && tstzrange(p_starts_at, p_ends_at, '[)')
    )
  order by t.capacity asc;
$$;

revoke all on function public.find_available_tables(uuid, timestamptz, timestamptz, int) from public;
grant execute on function public.find_available_tables(uuid, timestamptz, timestamptz, int) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- menu_categories / menu_items
-- ---------------------------------------------------------------------------

create table menu_categories (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (id, business_id)
);

create table menu_items (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  category_id uuid,
  name text not null,
  description text,
  price numeric(10, 2) not null default 0,
  image_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  foreign key (category_id, business_id) references menu_categories (id, business_id) on delete set null
);

create index menu_items_business_idx on menu_items (business_id) where is_active;

-- ---------------------------------------------------------------------------
-- RLS — standart şablon
-- ---------------------------------------------------------------------------

alter table restaurant_tables enable row level security;
create policy restaurant_tables_select on restaurant_tables for select using (is_business_member(business_id));
create policy restaurant_tables_write on restaurant_tables for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

alter table menu_categories enable row level security;
create policy menu_categories_select on menu_categories for select using (is_business_member(business_id));
create policy menu_categories_write on menu_categories for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

alter table menu_items enable row level security;
create policy menu_items_select on menu_items for select using (is_business_member(business_id));
create policy menu_items_write on menu_items for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

alter table reservations enable row level security;
create policy reservations_select on reservations for select using (is_business_member(business_id));
-- insert/update yalnızca RPC katmanından (book_reservation/cancel_reservation/...) — bilinçli default deny.

alter table reservation_tables enable row level security;
create policy reservation_tables_select on reservation_tables for select using (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- RPC katmanı — core + wrapper deseni (appointments ile aynı desen)
-- ---------------------------------------------------------------------------

create or replace function public._book_reservation_core(
  p_business_id uuid,
  p_customer_id uuid,
  p_table_id uuid,
  p_party_size int,
  p_starts_at timestamptz,
  p_duration_minutes int,
  p_source text,
  p_call_id uuid default null,
  p_notes text default null
)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations;
  v_ends_at timestamptz;
  v_capacity int;
begin
  if not exists (select 1 from customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'customer_mismatch: müşteri bu işletmeye ait değil';
  end if;

  select capacity into v_capacity from restaurant_tables where id = p_table_id and business_id = p_business_id;
  if v_capacity is null then
    raise exception 'table_mismatch: masa bu işletmeye ait değil';
  end if;
  if v_capacity < p_party_size then
    raise exception 'capacity_exceeded: masa kapasitesi yetersiz';
  end if;

  v_ends_at := p_starts_at + make_interval(mins => coalesce(p_duration_minutes, 90));

  insert into reservations (business_id, customer_id, party_size, starts_at, ends_at, source, call_id, notes, created_by)
  values (p_business_id, p_customer_id, p_party_size, p_starts_at, v_ends_at, p_source, p_call_id, p_notes, auth.uid())
  returning * into v_reservation;

  insert into reservation_tables (reservation_id, table_id, business_id, starts_at, ends_at, status, is_active_hold)
  values (v_reservation.id, p_table_id, p_business_id, p_starts_at, v_ends_at, 'confirmed', true);

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'reservation.create', 'reservations', v_reservation.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_reservation;
end;
$$;

revoke all on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, text, uuid, text) from public;
grant execute on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, text, uuid, text) to service_role;

create or replace function public.book_reservation(
  p_customer_id uuid,
  p_table_id uuid,
  p_party_size int,
  p_starts_at timestamptz,
  p_duration_minutes int default 90,
  p_call_id uuid default null,
  p_notes text default null
)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from customers where id = p_customer_id;
  if v_business_id is null then
    raise exception 'customer_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.create')) then
    raise exception 'not_authorized: rezervasyon oluşturma yetkiniz yok';
  end if;

  return public._book_reservation_core(v_business_id, p_customer_id, p_table_id, p_party_size, p_starts_at, p_duration_minutes, 'app', p_call_id, p_notes);
end;
$$;

revoke all on function public.book_reservation(uuid, uuid, int, timestamptz, int, uuid, text) from public;
grant execute on function public.book_reservation(uuid, uuid, int, timestamptz, int, uuid, text) to authenticated;

create or replace function public._cancel_reservation_core(p_reservation_id uuid, p_business_id uuid, p_reason text)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reservation reservations;
begin
  select * into v_reservation from reservations where id = p_reservation_id;
  if v_reservation.id is null or v_reservation.business_id is distinct from p_business_id then
    raise exception 'reservation_not_found';
  end if;

  update reservations set status = 'cancelled', cancel_reason = p_reason
    where id = p_reservation_id
    returning * into v_reservation;

  return v_reservation;
end;
$$;

revoke all on function public._cancel_reservation_core(uuid, uuid, text) from public;
grant execute on function public._cancel_reservation_core(uuid, uuid, text) to service_role;

create or replace function public.cancel_reservation(p_reservation_id uuid, p_reason text default null)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from reservations where id = p_reservation_id;
  if v_business_id is null then
    raise exception 'reservation_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.cancel_all')) then
    raise exception 'not_authorized: bu rezervasyonu iptal etme yetkiniz yok';
  end if;

  return public._cancel_reservation_core(p_reservation_id, v_business_id, p_reason);
end;
$$;

revoke all on function public.cancel_reservation(uuid, text) from public;
grant execute on function public.cancel_reservation(uuid, text) to authenticated;

create or replace function public.set_reservation_status(p_reservation_id uuid, p_status text)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_reservation reservations;
begin
  select business_id into v_business_id from reservations where id = p_reservation_id;
  if v_business_id is null then
    raise exception 'reservation_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized';
  end if;
  if p_status not in ('seated', 'completed', 'no_show') then
    raise exception 'invalid_status';
  end if;

  update reservations set status = p_status where id = p_reservation_id returning * into v_reservation;
  return v_reservation;
end;
$$;

revoke all on function public.set_reservation_status(uuid, text) from public;
grant execute on function public.set_reservation_status(uuid, text) to authenticated;

create or replace function public.reschedule_reservation(p_reservation_id uuid, p_new_starts_at timestamptz)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_reservation reservations;
  v_duration interval;
begin
  select business_id into v_business_id from reservations where id = p_reservation_id;
  if v_business_id is null then
    raise exception 'reservation_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized';
  end if;
  if p_new_starts_at <= now() then
    raise exception 'cannot_reschedule_past: geçmiş bir saate rezervasyon ertelenemez';
  end if;

  select ends_at - starts_at into v_duration from reservations where id = p_reservation_id;

  update reservations
    set starts_at = p_new_starts_at, ends_at = p_new_starts_at + v_duration
    where id = p_reservation_id and status = 'confirmed'
    returning * into v_reservation;

  if v_reservation.id is null then
    raise exception 'cannot_reschedule: sadece onaylı rezervasyonlar ertelenebilir';
  end if;

  return v_reservation;
end;
$$;

revoke all on function public.reschedule_reservation(uuid, timestamptz) from public;
grant execute on function public.reschedule_reservation(uuid, timestamptz) to authenticated;
