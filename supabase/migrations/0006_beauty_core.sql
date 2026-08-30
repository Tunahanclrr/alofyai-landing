-- AlofyAI Phase 3 — Beauty Core
-- staff, services, staff_services, working hours/time off, customers,
-- appointments + appointment_services (race-safe conflict prevention),
-- book_appointment/cancel_appointment RPC'leri (core+wrapper deseni).

-- ---------------------------------------------------------------------------
-- Telefon normalize (TR odaklı E.164 benzeri) — customers.normalized_phone
-- generated column'unda kullanılır, IMMUTABLE olmalı.
-- ---------------------------------------------------------------------------

create or replace function public.normalize_tr_phone(p_phone text)
returns text
language plpgsql
immutable
as $$
declare
  v_digits text;
begin
  if p_phone is null then
    return null;
  end if;
  v_digits := regexp_replace(p_phone, '\D', '', 'g');
  if v_digits = '' then
    return null;
  end if;
  if left(v_digits, 2) = '90' and length(v_digits) = 12 then
    return '+' || v_digits;
  elsif left(v_digits, 1) = '0' and length(v_digits) = 11 then
    return '+90' || substring(v_digits from 2);
  elsif length(v_digits) = 10 then
    return '+90' || v_digits;
  end if;
  return '+' || v_digits;
end;
$$;

-- ---------------------------------------------------------------------------
-- staff — business_members'tan AYRI: operasyonel hizmet veren personel.
-- ---------------------------------------------------------------------------

create table staff (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  business_member_id uuid references business_members (id) on delete set null,
  full_name text not null,
  phone text,
  email text,
  photo_url text,
  color text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index staff_business_idx on staff (business_id) where is_active;

-- ---------------------------------------------------------------------------
-- services
-- ---------------------------------------------------------------------------

create table services (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  price numeric(10, 2) not null default 0,
  buffer_minutes int not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (id, business_id)
);

create index services_business_idx on services (business_id) where is_active;

-- ---------------------------------------------------------------------------
-- staff_services — hangi personel hangi hizmeti yapabilir.
-- business_id denormalize edilir (composite FK ile drift imkansız), join'siz
-- RLS için (bkz. README §3.9 düzeltme #7).
-- ---------------------------------------------------------------------------

create table staff_services (
  staff_id uuid not null,
  service_id uuid not null references services (id) on delete cascade,
  business_id uuid not null,
  primary key (staff_id, service_id),
  foreign key (staff_id, business_id) references staff (id, business_id) on delete cascade
);

create or replace function public.check_staff_service_business_match()
returns trigger
language plpgsql
as $$
begin
  if not exists (
    select 1 from services s where s.id = new.service_id and s.business_id = new.business_id
  ) then
    raise exception 'service, staff ile aynı işletmeye ait değil';
  end if;
  return new;
end;
$$;

create trigger staff_services_business_match
  before insert or update on staff_services
  for each row execute function public.check_staff_service_business_match();

-- ---------------------------------------------------------------------------
-- Çalışma saatleri / özel günler / izinler
-- ---------------------------------------------------------------------------

create table business_hours (
  business_id uuid not null references businesses (id) on delete cascade,
  day_of_week int not null check (day_of_week between 0 and 6),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  primary key (business_id, day_of_week)
);

create table business_special_hours (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  date date not null,
  is_closed boolean not null default true,
  opens_at time,
  closes_at time,
  label text,
  unique (business_id, date)
);

create table staff_working_hours (
  staff_id uuid not null,
  business_id uuid not null,
  day_of_week int not null check (day_of_week between 0 and 6),
  starts_at time not null,
  ends_at time not null,
  primary key (staff_id, day_of_week),
  foreign key (staff_id, business_id) references staff (id, business_id) on delete cascade,
  check (ends_at > starts_at)
);

create table staff_time_off (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid not null,
  business_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  type text not null default 'other' check (type in ('vacation', 'sick', 'personal', 'other')),
  reason text,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  created_at timestamptz not null default now(),
  foreign key (staff_id, business_id) references staff (id, business_id) on delete cascade,
  check (ends_at > starts_at)
);

create index staff_time_off_staff_idx on staff_time_off using gist (staff_id, during);

-- ---------------------------------------------------------------------------
-- customers
-- ---------------------------------------------------------------------------

create table customers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  full_name text not null,
  phone text,
  normalized_phone text generated always as (public.normalize_tr_phone(phone)) stored,
  email text,
  notes text,
  last_visit_at timestamptz,
  total_visits int not null default 0,
  no_show_count int not null default 0,
  status text not null default 'active' check (status in ('active', 'merged', 'archived')),
  merged_into_id uuid references customers (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, business_id),
  unique (business_id, normalized_phone)
);

create index customers_business_idx on customers (business_id, created_at desc);

-- Düzeltme #5: total_visits/no_show_count/last_visit_at client'tan doğrudan
-- yazılamaz — sadece appointment status-transition trigger'ı (aşağıda)
-- SECURITY DEFINER olarak günceller.
revoke update on customers from authenticated;
grant update (full_name, phone, email, notes, status, merged_into_id, updated_at) on customers to authenticated;

-- ---------------------------------------------------------------------------
-- appointments (ziyaret wrapper'ı) + appointment_services (çakışma birimi)
-- ---------------------------------------------------------------------------

create extension if not exists "btree_gist";

create table appointments (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  customer_id uuid not null references customers (id),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'booked' check (status in ('booked', 'completed', 'cancelled', 'no_show')),
  source text not null default 'app' check (source in ('app', 'vapi', 'manual')),
  call_id uuid,
  cancel_reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (id, business_id),
  check (ends_at > starts_at)
);

create index appointments_business_idx on appointments (business_id, starts_at);

create table appointment_services (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null,
  business_id uuid not null,
  service_id uuid not null,
  staff_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  duration_minutes int not null,
  price numeric(10, 2) not null,
  during tstzrange generated always as (tstzrange(starts_at, ends_at, '[)')) stored,
  blocks_schedule boolean not null default true,
  foreign key (appointment_id, business_id) references appointments (id, business_id) on delete cascade,
  foreign key (staff_id, business_id) references staff (id, business_id),
  foreign key (service_id, business_id) references services (id, business_id),
  check (ends_at > starts_at)
);

alter table appointment_services
  add constraint no_overlapping_staff_appointments
  exclude using gist (business_id with =, staff_id with =, during with &&)
  where (blocks_schedule);

create index appointment_services_appointment_idx on appointment_services (appointment_id);
create index appointment_services_staff_idx on appointment_services using gist (staff_id, during);

-- appointments.status değişince ilgili appointment_services.blocks_schedule'ı
-- senkronize eder (cancelled/no_show artık takvimi bloklamaz).
create or replace function public.sync_appointment_services_block_flag()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status then
    update appointment_services
      set blocks_schedule = (new.status in ('booked', 'completed'))
      where appointment_id = new.id;
  end if;
  return new;
end;
$$;

create trigger appointments_sync_block_flag
  after update of status on appointments
  for each row execute function public.sync_appointment_services_block_flag();

-- Randevu durum değişikliklerini otomatik audit_logs'a yazar — Vapi yolu da
-- dahil, hiçbir çağıranın loglamayı unutması mümkün olmasın diye trigger'da.
create or replace function public.log_appointment_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, before, after, source)
    values (
      new.business_id,
      auth.uid(),
      case when new.source = 'vapi' then 'vapi' else 'self' end,
      'appointment.status_change',
      'appointments',
      new.id,
      jsonb_build_object('status', old.status),
      jsonb_build_object('status', new.status),
      case when new.source = 'vapi' then 'vapi' else 'app' end
    );
  end if;
  return new;
end;
$$;

create trigger appointments_log_status_change
  after update of status on appointments
  for each row execute function public.log_appointment_status_change();

-- customers.total_visits / no_show_count / last_visit_at senkronizasyonu —
-- SECURITY DEFINER olduğu için authenticated'a verilen column-level UPDATE
-- kısıtlamasını (yukarıda) bypass edebilir, tek yetkili yazma yolu budur.
create or replace function public.sync_customer_stats()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status is distinct from old.status then
    if new.status = 'completed' then
      update customers
        set total_visits = total_visits + 1, last_visit_at = new.starts_at, updated_at = now()
        where id = new.customer_id;
    elsif new.status = 'no_show' then
      update customers
        set no_show_count = no_show_count + 1, updated_at = now()
        where id = new.customer_id;
    end if;
  end if;
  return new;
end;
$$;

create trigger appointments_sync_customer_stats
  after update of status on appointments
  for each row execute function public.sync_customer_stats();

-- ---------------------------------------------------------------------------
-- Randevu slot doğrulaması — staff_services + working hours + special hours
-- + time off. EXCLUDE constraint sadece çakışmayı engeller; "neden" bilgisini
-- bu trigger verir.
-- ---------------------------------------------------------------------------

create or replace function public.validate_appointment_slot()
returns trigger
language plpgsql
as $$
declare
  v_dow int;
  v_local_start time;
  v_local_end time;
  v_tz text;
begin
  select timezone into v_tz from businesses where id = new.business_id;
  v_dow := extract(dow from new.starts_at at time zone coalesce(v_tz, 'Europe/Istanbul'));
  v_local_start := (new.starts_at at time zone coalesce(v_tz, 'Europe/Istanbul'))::time;
  v_local_end := (new.ends_at at time zone coalesce(v_tz, 'Europe/Istanbul'))::time;

  if not exists (
    select 1 from staff_services ss where ss.staff_id = new.staff_id and ss.service_id = new.service_id
  ) then
    raise exception 'staff_not_qualified: personel bu hizmeti yapamıyor';
  end if;

  if exists (
    select 1 from staff_time_off t
    where t.staff_id = new.staff_id and t.during && new.during
  ) then
    raise exception 'staff_time_off: personel bu tarihte izinli';
  end if;

  if exists (
    select 1 from business_special_hours h
    where h.business_id = new.business_id
      and h.date = (new.starts_at at time zone coalesce(v_tz, 'Europe/Istanbul'))::date
      and (h.is_closed or v_local_start < h.opens_at or v_local_end > h.closes_at)
  ) then
    raise exception 'business_closed: işletme bu tarihte kapalı';
  end if;

  if exists (
    select 1 from staff_working_hours w
    where w.staff_id = new.staff_id and w.day_of_week = v_dow
      and v_local_start >= w.starts_at and v_local_end <= w.ends_at
  ) then
    return new;
  end if;

  if not exists (select 1 from staff_working_hours w where w.staff_id = new.staff_id) then
    return new; -- personel için çalışma saati tanımlanmamışsa serbest bırak (v1 fallback)
  end if;

  raise exception 'outside_working_hours: personel bu saatte çalışmıyor';
end;
$$;

create trigger appointment_services_validate_slot
  before insert or update on appointment_services
  for each row execute function public.validate_appointment_slot();

-- ---------------------------------------------------------------------------
-- RLS — standart şablon (tenant + permission-aware write) tüm yeni tablolarda
-- ---------------------------------------------------------------------------

alter table staff enable row level security;
create policy staff_select on staff for select using (is_business_member(business_id));
create policy staff_write on staff for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'staff.manage'));

alter table services enable row level security;
create policy services_select on services for select using (is_business_member(business_id));
create policy services_write on services for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'services.manage'));

alter table staff_services enable row level security;
create policy staff_services_select on staff_services for select using (is_business_member(business_id));
create policy staff_services_write on staff_services for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'staff.manage'));

alter table business_hours enable row level security;
create policy business_hours_select on business_hours for select using (is_business_member(business_id));
create policy business_hours_write on business_hours for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

alter table business_special_hours enable row level security;
create policy business_special_hours_select on business_special_hours for select using (is_business_member(business_id));
create policy business_special_hours_write on business_special_hours for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

alter table staff_working_hours enable row level security;
create policy staff_working_hours_select on staff_working_hours for select using (is_business_member(business_id));
create policy staff_working_hours_write on staff_working_hours for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'staff.manage'));

alter table staff_time_off enable row level security;
create policy staff_time_off_select on staff_time_off for select using (is_business_member(business_id));
create policy staff_time_off_write on staff_time_off for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'staff.manage'));

alter table customers enable row level security;
create policy customers_select on customers for select using (is_business_member(business_id));
create policy customers_insert on customers for insert
  with check (is_business_member(business_id) and has_permission(business_id, 'customers.create'));
create policy customers_update on customers for update
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'customers.update'));

alter table appointments enable row level security;
create policy appointments_select on appointments for select
  using (
    is_business_member(business_id) and (
      has_permission(business_id, 'appointments.view_all')
      or (
        has_permission(business_id, 'appointments.view_own')
        and exists (
          select 1 from appointment_services aps
          join staff s on s.id = aps.staff_id
          where aps.appointment_id = appointments.id
            and s.business_member_id = current_member_id(appointments.business_id)
        )
      )
    )
  );
-- appointments insert/update/cancel yalnızca RPC katmanı (book_appointment /
-- cancel_appointment) üzerinden yapılır; buradan doğrudan client insert/update
-- politikası bilinçli olarak tanımlanmadı (default deny).

alter table appointment_services enable row level security;
create policy appointment_services_select on appointment_services for select
  using (
    is_business_member(business_id) and (
      has_permission(business_id, 'appointments.view_all')
      or (
        has_permission(business_id, 'appointments.view_own')
        and exists (select 1 from staff s where s.id = appointment_services.staff_id and s.business_member_id = current_member_id(appointment_services.business_id))
      )
    )
  );

-- ---------------------------------------------------------------------------
-- RPC katmanı — core + wrapper deseni (README §4.3)
-- ---------------------------------------------------------------------------

create or replace function public._book_appointment_core(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb, -- [{ "service_id": "...", "staff_id": "..." }, ...]
  p_starts_at timestamptz,
  p_source text,
  p_call_id uuid default null
)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment appointments;
  v_item jsonb;
  v_cursor timestamptz := p_starts_at;
  v_item_end timestamptz;
  v_duration int;
  v_price numeric;
  v_final_end timestamptz := p_starts_at;
begin
  if not exists (select 1 from customers where id = p_customer_id and business_id = p_business_id) then
    raise exception 'customer_mismatch: müşteri bu işletmeye ait değil';
  end if;

  if jsonb_array_length(p_items) = 0 then
    raise exception 'no_items: en az bir hizmet seçilmeli';
  end if;

  -- İlk geçiş: doğrulama + toplam süreyi (ends_at) insert'ten ÖNCE hesapla —
  -- appointments.ends_at > starts_at constraint'i insert anında sağlanmalı.
  for v_item in select * from jsonb_array_elements(p_items) loop
    if not exists (
      select 1 from services where id = (v_item ->> 'service_id')::uuid and business_id = p_business_id
    ) then
      raise exception 'service_mismatch: hizmet bu işletmeye ait değil';
    end if;
    if not exists (
      select 1 from staff where id = (v_item ->> 'staff_id')::uuid and business_id = p_business_id
    ) then
      raise exception 'staff_mismatch: personel bu işletmeye ait değil';
    end if;

    select duration_minutes into v_duration from services where id = (v_item ->> 'service_id')::uuid;
    v_final_end := v_final_end + make_interval(mins => v_duration);
  end loop;

  insert into appointments (business_id, customer_id, starts_at, ends_at, source, call_id, created_by)
  values (p_business_id, p_customer_id, p_starts_at, v_final_end, p_source, p_call_id, auth.uid())
  returning * into v_appointment;

  -- İkinci geçiş: her hizmeti sırayla, kendi personeline atanmış zaman
  -- aralığında appointment_services'e yazar (EXCLUDE constraint burada
  -- race-safe şekilde devreye girer).
  v_cursor := p_starts_at;
  for v_item in select * from jsonb_array_elements(p_items) loop
    select duration_minutes, price into v_duration, v_price
      from services where id = (v_item ->> 'service_id')::uuid;

    v_item_end := v_cursor + make_interval(mins => v_duration);

    insert into appointment_services (appointment_id, business_id, service_id, staff_id, starts_at, ends_at, duration_minutes, price)
    values (v_appointment.id, p_business_id, (v_item ->> 'service_id')::uuid, (v_item ->> 'staff_id')::uuid, v_cursor, v_item_end, v_duration, v_price);

    v_cursor := v_item_end;
  end loop;

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'appointment.create', 'appointments', v_appointment.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_appointment;
end;
$$;

revoke all on function public._book_appointment_core(uuid, uuid, jsonb, timestamptz, text, uuid) from public;
grant execute on function public._book_appointment_core(uuid, uuid, jsonb, timestamptz, text, uuid) to service_role;

create or replace function public.book_appointment(
  p_customer_id uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_call_id uuid default null
)
returns appointments
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
    raise exception 'not_authorized: randevu oluşturma yetkiniz yok';
  end if;

  return public._book_appointment_core(v_business_id, p_customer_id, p_items, p_starts_at, 'app', p_call_id);
end;
$$;

revoke all on function public.book_appointment(uuid, jsonb, timestamptz, uuid) from public;
grant execute on function public.book_appointment(uuid, jsonb, timestamptz, uuid) to authenticated;

create or replace function public._cancel_appointment_core(
  p_appointment_id uuid,
  p_business_id uuid,
  p_reason text,
  p_source text
)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment appointments;
begin
  select * into v_appointment from appointments where id = p_appointment_id;
  if v_appointment.id is null or v_appointment.business_id is distinct from p_business_id then
    raise exception 'appointment_not_found';
  end if;

  update appointments
    set status = 'cancelled', cancel_reason = p_reason
    where id = p_appointment_id
    returning * into v_appointment;

  return v_appointment;
end;
$$;

revoke all on function public._cancel_appointment_core(uuid, uuid, text, text) from public;
grant execute on function public._cancel_appointment_core(uuid, uuid, text, text) to service_role;

create or replace function public.cancel_appointment(p_appointment_id uuid, p_reason text default null)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_can_cancel_all boolean;
  v_can_cancel_own boolean;
  v_is_own boolean;
begin
  select business_id into v_business_id from appointments where id = p_appointment_id;
  if v_business_id is null then
    raise exception 'appointment_not_found';
  end if;

  v_can_cancel_all := has_permission(v_business_id, 'appointments.cancel_all');
  v_can_cancel_own := has_permission(v_business_id, 'appointments.cancel');
  v_is_own := exists (
    select 1 from appointment_services aps
    join staff s on s.id = aps.staff_id
    where aps.appointment_id = p_appointment_id and s.business_member_id = current_member_id(v_business_id)
  );

  if not (is_business_member(v_business_id) and (v_can_cancel_all or (v_can_cancel_own and v_is_own))) then
    raise exception 'not_authorized: bu randevuyu iptal etme yetkiniz yok';
  end if;

  return public._cancel_appointment_core(p_appointment_id, v_business_id, p_reason, 'app');
end;
$$;

revoke all on function public.cancel_appointment(uuid, text) from public;
grant execute on function public.cancel_appointment(uuid, text) to authenticated;

-- Randevuyu 'completed' / 'no_show' olarak işaretleme (customer stats
-- trigger'ını tetikler) — appointments tablosunda insert/update policy
-- bilinçli olarak yok, tek yazma yolu bu RPC'dir.
create or replace function public._set_appointment_status_core(p_appointment_id uuid, p_business_id uuid, p_status text)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_appointment appointments;
begin
  select * into v_appointment from appointments where id = p_appointment_id;
  if v_appointment.id is null or v_appointment.business_id is distinct from p_business_id then
    raise exception 'appointment_not_found';
  end if;
  if p_status not in ('completed', 'no_show') then
    raise exception 'invalid_status';
  end if;

  update appointments set status = p_status where id = p_appointment_id returning * into v_appointment;
  return v_appointment;
end;
$$;

revoke all on function public._set_appointment_status_core(uuid, uuid, text) from public;
grant execute on function public._set_appointment_status_core(uuid, uuid, text) to service_role;

create or replace function public.set_appointment_status(p_appointment_id uuid, p_status text)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
begin
  select business_id into v_business_id from appointments where id = p_appointment_id;
  if v_business_id is null then
    raise exception 'appointment_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized: bu randevuyu güncelleme yetkiniz yok';
  end if;
  return public._set_appointment_status_core(p_appointment_id, v_business_id, p_status);
end;
$$;

revoke all on function public.set_appointment_status(uuid, text) from public;
grant execute on function public.set_appointment_status(uuid, text) to authenticated;
