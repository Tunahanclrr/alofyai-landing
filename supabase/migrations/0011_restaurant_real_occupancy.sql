-- ---------------------------------------------------------------------------
-- table_areas — masa bölgeleri/kategorileri (Bahçe, Balkon, İç Salon...).
-- Masa eklerken serbest metin yerine buradan seçilir; menu_categories ile
-- aynı desen.
-- ---------------------------------------------------------------------------

create table if not exists table_areas (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  is_active boolean not null default true,
  unique (id, business_id)
);

alter table table_areas enable row level security;
drop policy if exists table_areas_select on table_areas;
create policy table_areas_select on table_areas for select using (is_business_member(business_id));
drop policy if exists table_areas_write on table_areas;
create policy table_areas_write on table_areas for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

-- 0010'daki status check constraint'i 'inactive' içeriyordu ama kullanılan
-- (ve is_active boolean'ıyla çakışmayan, kullanıcının spesifikasyonundaki)
-- değer 'blocked' — düzeltiliyor.
alter table restaurant_tables drop constraint if exists restaurant_tables_status_check;
alter table restaurant_tables add constraint restaurant_tables_status_check
  check (status in ('available', 'reserved', 'occupied', 'cleaning', 'blocked'));

alter table restaurant_tables add column if not exists area_id uuid;
alter table restaurant_tables drop constraint if exists restaurant_tables_area_fk;
alter table restaurant_tables add constraint restaurant_tables_area_fk
  foreign key (area_id, business_id) references table_areas (id, business_id);
alter table restaurant_tables drop column if exists area;

-- AlofyAI — Restaurant: tahmini vs gerçek doluluk ayrımı
-- estimated_duration/buffer (planlama) ile seated_at/actual_end_time (gerçeklik)
-- ayrılır; table_sessions gerçek masa kullanımını, reservations planlamayı
-- temsil eder. Masa, gerçekten boşalana kadar OCCUPIED kalır — tahmini süre
-- dolduğunda OTOMATİK boşa çıkarılmaz.

-- ---------------------------------------------------------------------------
-- restaurant_settings — parti büyüklüğüne göre varsayılan süre + buffer +
-- no-show grace period, hard-code değil işletme bazında ayarlanabilir.
-- ---------------------------------------------------------------------------

create table if not exists restaurant_settings (
  business_id uuid primary key references businesses (id) on delete cascade,
  default_duration_1_2 int not null default 75,
  default_duration_3_4 int not null default 90,
  default_duration_5_6 int not null default 120,
  default_duration_7_10 int not null default 150,
  default_duration_10_plus int not null default 180,
  reservation_buffer_minutes int not null default 15,
  no_show_grace_minutes int not null default 15,
  updated_at timestamptz not null default now()
);

alter table restaurant_settings enable row level security;
drop policy if exists restaurant_settings_select on restaurant_settings;
create policy restaurant_settings_select on restaurant_settings for select using (is_business_member(business_id));
drop policy if exists restaurant_settings_write on restaurant_settings;
create policy restaurant_settings_write on restaurant_settings for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

-- Yeni restaurant tipi işletme oluşturulunca varsayılan ayarları otomatik oluştur.
create or replace function public.seed_restaurant_settings()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.type = 'restaurant' then
    insert into restaurant_settings (business_id) values (new.id)
    on conflict (business_id) do nothing;
  end if;
  return new;
end;
$$;

drop trigger if exists businesses_seed_restaurant_settings on businesses;
create trigger businesses_seed_restaurant_settings
  after insert on businesses
  for each row execute function public.seed_restaurant_settings();

-- Mevcut restaurant işletmeleri için de geriye dönük satır oluştur.
insert into restaurant_settings (business_id)
select id from businesses where type = 'restaurant'
on conflict (business_id) do nothing;

create or replace function public.get_default_duration(p_business_id uuid, p_party_size int)
returns int
language sql
stable
as $$
  select case
    when p_party_size <= 2 then coalesce(s.default_duration_1_2, 75)
    when p_party_size <= 4 then coalesce(s.default_duration_3_4, 90)
    when p_party_size <= 6 then coalesce(s.default_duration_5_6, 120)
    when p_party_size <= 10 then coalesce(s.default_duration_7_10, 150)
    else coalesce(s.default_duration_10_plus, 180)
  end
  from (select 1) dummy
  left join restaurant_settings s on s.business_id = p_business_id;
$$;

-- ---------------------------------------------------------------------------
-- reservations — tahmini/gerçek alanları ekle, status enum'unu genişlet
-- ---------------------------------------------------------------------------

alter table reservations drop constraint if exists reservations_status_check;
alter table reservations add constraint reservations_status_check
  check (status in ('pending', 'confirmed', 'arrived', 'seated', 'completed', 'cancelled', 'no_show'));

alter table reservations add column if not exists estimated_duration int not null default 90;
alter table reservations add column if not exists buffer_minutes int not null default 15;
-- DİKKAT: estimated_end_time generated column OLAMAZ — Postgres'te
-- `timestamptz + interval` STABLE'dır (IMMUTABLE değil, TimeZone GUC'una bağlı
-- olabildiği için), hangi interval üretim yöntemi kullanılırsa kullanılsın
-- generated column bunu reddeder (42P17). Bu yüzden normal bir kolon olarak
-- tutulur, ends_at gibi RPC'ler tarafından (book/reschedule) açıkça hesaplanıp
-- yazılır.
alter table reservations add column if not exists estimated_end_time timestamptz;
alter table reservations add column if not exists seated_at timestamptz;
alter table reservations add column if not exists actual_end_time timestamptz;

-- ends_at artık "planlama/blokaj penceresi"nin sonu: starts_at + tahmini süre +
-- buffer. reservation_tables/EXCLUDE constraint bunu kullanır (README §3.5 ile
-- aynı prensip — gerçek kaynak reservations, reservation_tables senkronize
-- yansıma). ends_at de generated column DEĞİL, aynı sebeple RPC'ler tarafından
-- açıkça hesaplanıp yazılır.

-- ---------------------------------------------------------------------------
-- table_sessions — GERÇEK masa kullanımı, rezervasyon tahmininden bağımsız.
-- Aynı masada aynı anda birden fazla aktif oturum olamaz (concurrency-safe
-- partial unique index — iki host aynı anda aynı masayı check-in edemez).
-- ---------------------------------------------------------------------------

create table if not exists table_sessions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  table_id uuid not null,
  reservation_id uuid,
  party_size int not null,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  status text not null default 'active' check (status in ('active', 'ended')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (table_id, business_id) references restaurant_tables (id, business_id),
  foreign key (reservation_id, business_id) references reservations (id, business_id)
);

create unique index if not exists one_active_session_per_table on table_sessions (table_id) where status = 'active';
create index if not exists table_sessions_business_idx on table_sessions (business_id, started_at desc);

alter table table_sessions enable row level security;
drop policy if exists table_sessions_select on table_sessions;
create policy table_sessions_select on table_sessions for select using (is_business_member(business_id));

-- ---------------------------------------------------------------------------
-- reservation_tables senkron trigger güncellemesi — yeni status seti için
-- is_active_hold mantığı (planlama açısından hâlâ "tutuyor" sayılan durumlar).
-- ---------------------------------------------------------------------------

create or replace function public.sync_reservation_tables()
returns trigger
language plpgsql
as $$
begin
  update reservation_tables
    set starts_at = new.starts_at,
        ends_at = new.ends_at,
        status = new.status,
        is_active_hold = (new.status in ('pending', 'confirmed', 'arrived', 'seated'))
    where reservation_id = new.id;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- find_available_tables — buffer zaten reservations.ends_at'e gömülü olduğu
-- için otomatik hesaba katılıyor; ayrıca BLOCKED masaları ve "bugün" için aktif
-- (gerçek, bitiş zamanı bilinmeyen) oturumu olan masaları hariç tutar.
-- ---------------------------------------------------------------------------

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
    and t.status <> 'blocked'
    -- CLEANING geçici bir durum — sadece BUGÜN için uygunsuz sayılır, ileri
    -- tarihli rezervasyonları etkilemez.
    and (t.status <> 'cleaning' or p_starts_at::date > now()::date)
    and t.capacity >= p_party_size
    and not exists (
      select 1 from reservation_tables rt
      where rt.table_id = t.id
        and rt.is_active_hold
        and rt.during && tstzrange(p_starts_at, p_ends_at, '[)')
    )
    and not exists (
      -- gerçek bitiş zamanı bilinmeyen aktif bir oturum varsa ve talep edilen
      -- saat bugüne aitse, bu masa "ne zaman boşalacağı belirsiz" kabul edilir.
      select 1 from table_sessions ts
      where ts.table_id = t.id
        and ts.status = 'active'
        and p_starts_at::date = now()::date
    )
  order by t.capacity asc;
$$;

-- ---------------------------------------------------------------------------
-- RPC katmanı güncellemeleri
-- ---------------------------------------------------------------------------

drop function if exists public.book_reservation(uuid, uuid, int, timestamptz, int, uuid, text);
drop function if exists public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, text, uuid, text);

create or replace function public._book_reservation_core(
  p_business_id uuid,
  p_customer_id uuid,
  p_table_id uuid,
  p_party_size int,
  p_starts_at timestamptz,
  p_estimated_duration int,
  p_buffer_minutes int,
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
  v_estimated_end timestamptz;
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

  v_estimated_end := p_starts_at + make_interval(mins => p_estimated_duration);
  v_ends_at := p_starts_at + make_interval(mins => p_estimated_duration + p_buffer_minutes);

  insert into reservations (business_id, customer_id, party_size, starts_at, ends_at, estimated_duration, buffer_minutes, estimated_end_time, source, call_id, notes, created_by)
  values (p_business_id, p_customer_id, p_party_size, p_starts_at, v_ends_at, p_estimated_duration, p_buffer_minutes, v_estimated_end, p_source, p_call_id, p_notes, auth.uid())
  returning * into v_reservation;

  insert into reservation_tables (reservation_id, table_id, business_id, starts_at, ends_at, status, is_active_hold)
  values (v_reservation.id, p_table_id, p_business_id, p_starts_at, v_ends_at, 'confirmed', true);

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'reservation.create', 'reservations', v_reservation.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_reservation;
end;
$$;

revoke all on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, int, text, uuid, text) from public;
grant execute on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, int, text, uuid, text) to service_role;

create or replace function public.book_reservation(
  p_customer_id uuid,
  p_table_id uuid,
  p_party_size int,
  p_starts_at timestamptz,
  p_call_id uuid default null,
  p_notes text default null,
  p_estimated_duration int default null,
  p_buffer_minutes int default null
)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_duration int;
  v_buffer int;
  v_settings restaurant_settings;
begin
  select business_id into v_business_id from customers where id = p_customer_id;
  if v_business_id is null then
    raise exception 'customer_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.create')) then
    raise exception 'not_authorized: rezervasyon oluşturma yetkiniz yok';
  end if;

  select * into v_settings from restaurant_settings where business_id = v_business_id;
  v_duration := coalesce(p_estimated_duration, public.get_default_duration(v_business_id, p_party_size));
  v_buffer := coalesce(p_buffer_minutes, v_settings.reservation_buffer_minutes, 15);

  return public._book_reservation_core(v_business_id, p_customer_id, p_table_id, p_party_size, p_starts_at, v_duration, v_buffer, 'app', p_call_id, p_notes);
end;
$$;

revoke all on function public.book_reservation(uuid, uuid, int, timestamptz, uuid, text, int, int) from public;
grant execute on function public.book_reservation(uuid, uuid, int, timestamptz, uuid, text, int, int) to authenticated;

-- Check-in: rezervasyon SEATED olur, gerçek table_session başlar, masa OCCUPIED.
create or replace function public.check_in_reservation(p_reservation_id uuid, p_table_id uuid default null)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_reservation reservations;
  v_table_id uuid;
begin
  select business_id into v_business_id from reservations where id = p_reservation_id;
  if v_business_id is null then
    raise exception 'reservation_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized';
  end if;

  select table_id into v_table_id from reservation_tables where reservation_id = p_reservation_id limit 1;
  v_table_id := coalesce(p_table_id, v_table_id);
  if v_table_id is null then
    raise exception 'table_not_found: bu rezervasyona atanmış masa yok';
  end if;

  if exists (select 1 from table_sessions where table_id = v_table_id and status = 'active') then
    raise exception 'table_already_occupied: bu masada aktif bir oturum var';
  end if;

  update reservations set status = 'seated', seated_at = now()
    where id = p_reservation_id and status in ('confirmed', 'arrived', 'pending')
    returning * into v_reservation;
  if v_reservation.id is null then
    raise exception 'invalid_status: sadece bekleyen/onaylı rezervasyonlar check-in edilebilir';
  end if;

  insert into table_sessions (business_id, table_id, reservation_id, party_size, started_at)
  values (v_business_id, v_table_id, p_reservation_id, v_reservation.party_size, now());

  update restaurant_tables set status = 'occupied' where id = v_table_id;

  return v_reservation;
end;
$$;

revoke all on function public.check_in_reservation(uuid, uuid) from public;
grant execute on function public.check_in_reservation(uuid, uuid) to authenticated;

-- Complete: müşteri çıktı — gerçek bitiş kaydı, rezervasyon COMPLETED, masa CLEANING.
create or replace function public.complete_table_session(p_table_id uuid)
returns table_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_session table_sessions;
begin
  select business_id into v_business_id from restaurant_tables where id = p_table_id;
  if v_business_id is null then
    raise exception 'table_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized';
  end if;

  update table_sessions set ended_at = now(), status = 'ended', updated_at = now()
    where table_id = p_table_id and status = 'active'
    returning * into v_session;
  if v_session.id is null then
    raise exception 'no_active_session: bu masada aktif bir oturum yok';
  end if;

  if v_session.reservation_id is not null then
    update reservations set status = 'completed', actual_end_time = now() where id = v_session.reservation_id;
  end if;

  update restaurant_tables set status = 'cleaning' where id = p_table_id;

  return v_session;
end;
$$;

revoke all on function public.complete_table_session(uuid) from public;
grant execute on function public.complete_table_session(uuid) to authenticated;

create or replace function public.mark_table_cleaned(p_table_id uuid)
returns restaurant_tables
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_table restaurant_tables;
begin
  select business_id into v_business_id from restaurant_tables where id = p_table_id;
  if v_business_id is null then
    raise exception 'table_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized';
  end if;

  update restaurant_tables set status = 'available'
    where id = p_table_id and status = 'cleaning'
    returning * into v_table;
  if v_table.id is null then
    raise exception 'invalid_state: masa temizlik durumunda değil';
  end if;
  return v_table;
end;
$$;

revoke all on function public.mark_table_cleaned(uuid) from public;
grant execute on function public.mark_table_cleaned(uuid) to authenticated;

create or replace function public.mark_reservation_no_show(p_reservation_id uuid)
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

  update reservations set status = 'no_show'
    where id = p_reservation_id and status in ('pending', 'confirmed', 'arrived')
    returning * into v_reservation;
  if v_reservation.id is null then
    raise exception 'invalid_status';
  end if;
  return v_reservation;
end;
$$;

revoke all on function public.mark_reservation_no_show(uuid) from public;
grant execute on function public.mark_reservation_no_show(uuid) to authenticated;

-- set_reservation_status: eski 'seated'/'completed'/'no_show' RPC'si artık
-- check_in_reservation / complete_table_session / mark_reservation_no_show ile
-- değiştiriliyor — geriye dönük uyumluluk için bırakılmıyor (frontend güncellendi).
drop function if exists public.set_reservation_status(uuid, text);

-- reschedule_reservation: buffer'lı ends_at'i koruyarak günceller.
create or replace function public.reschedule_reservation(p_reservation_id uuid, p_new_starts_at timestamptz)
returns reservations
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_reservation reservations;
  v_duration int;
  v_buffer int;
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

  select estimated_duration, buffer_minutes into v_duration, v_buffer from reservations where id = p_reservation_id;

  update reservations
    set starts_at = p_new_starts_at,
        ends_at = p_new_starts_at + make_interval(mins => v_duration + v_buffer),
        estimated_end_time = p_new_starts_at + make_interval(mins => v_duration)
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
