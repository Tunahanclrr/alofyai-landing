-- Bir rezervasyon, tahmini süre+buffer'ı geçse bile — TAMAMLANDI ya da İPTAL
-- olarak işaretlenmediği sürece — masayı başlangıç saatinden itibaren o günün
-- SONUNA kadar bloklamaya devam etmeli (sadece tahmini pencereyi değil).
-- Örnek: 18:00 rezervasyonu, tahmini bitiş 19:45 olsa bile, saat 21:00'de hâlâ
-- "confirmed/seated" ise, o masa aynı gün 21:00 için yeni rezervasyona
-- KESİNLİKLE açılmamalı. Tamamlandı/İptal edilince blokaj biter.
--
-- Uygulama: reservation_tables.ends_at (EXCLUDE constraint'in kullandığı
-- gerçek blokaj alanı) — reservation aktif/çözümlenmemişken (is_active_hold)
-- rezervasyonun kendi tahmini bitişi yerine "o günün sonu"na ayarlanır.
-- reservations.ends_at (tahmini pencere, gösterim amaçlı) DEĞİŞMEZ.

create or replace function public.end_of_business_day(p_business_id uuid, p_moment timestamptz)
returns timestamptz
language sql
stable
as $$
  select (
    date_trunc('day', p_moment at time zone coalesce(b.timezone, 'Europe/Istanbul'))
    + interval '1 day' - interval '1 second'
  ) at time zone coalesce(b.timezone, 'Europe/Istanbul')
  from businesses b where b.id = p_business_id;
$$;

revoke all on function public.end_of_business_day(uuid, timestamptz) from public;
grant execute on function public.end_of_business_day(uuid, timestamptz) to authenticated, service_role;

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
  v_block_until timestamptz;
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
  -- Blokaj (EXCLUDE constraint) penceresi tahmini pencereden büyük olanı kullanır:
  -- normalde günün sonuna kadar, ama tahmini+buffer zaten günü aşıyorsa onu kullan.
  v_block_until := greatest(v_ends_at, public.end_of_business_day(p_business_id, p_starts_at));

  insert into reservations (business_id, customer_id, party_size, starts_at, ends_at, estimated_duration, buffer_minutes, estimated_end_time, source, call_id, notes, created_by)
  values (p_business_id, p_customer_id, p_party_size, p_starts_at, v_ends_at, p_estimated_duration, p_buffer_minutes, v_estimated_end, p_source, p_call_id, p_notes, auth.uid())
  returning * into v_reservation;

  insert into reservation_tables (reservation_id, table_id, business_id, starts_at, ends_at, status, is_active_hold)
  values (v_reservation.id, p_table_id, p_business_id, p_starts_at, v_block_until, 'confirmed', true);

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'reservation.create', 'reservations', v_reservation.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_reservation;
end;
$$;

-- sync trigger: durum hâlâ çözümlenmemişse (pending/confirmed/arrived/seated)
-- blokaj günün sonuna kadar UZATILMAYA DEVAM EDER (tahmini bitiş değil).
-- Tamamlandı/İptal/Gelmedi olunca blokaj biter (is_active_hold=false, artık
-- ends_at değeri constraint için önemsiz — gerçek/tahmini bitişe döndürülür).
create or replace function public.sync_reservation_tables()
returns trigger
language plpgsql
as $$
declare
  v_still_active boolean;
  v_block_until timestamptz;
begin
  v_still_active := (new.status in ('pending', 'confirmed', 'arrived', 'seated'));
  if v_still_active then
    v_block_until := greatest(new.ends_at, public.end_of_business_day(new.business_id, new.starts_at));
  else
    v_block_until := coalesce(new.actual_end_time, new.ends_at);
  end if;

  update reservation_tables
    set starts_at = new.starts_at,
        ends_at = v_block_until,
        status = new.status,
        is_active_hold = v_still_active
    where reservation_id = new.id;
  return new;
end;
$$;
