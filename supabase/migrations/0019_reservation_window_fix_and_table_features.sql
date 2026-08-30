-- 0012'nin "aktifken günün sonuna kadar blokla" davranışını GERİ ALIR.
-- Gerçek restoran testinde ortaya çıktı: 20:00 rezervasyonu, 20:00 SONRASI
-- o masanın TÜM saatlerini kapatıyordu — bu yanlış. Doğrusu: her rezervasyon
-- YALNIZCA KENDİ tahmini penceresini (starts_at → estimated_end + buffer)
-- bloklar; aynı masaya farklı saatler için ayrı rezervasyonlar alınabilir.
--
-- "Müşteri hâlâ oturuyor, tahmini süre geçti" durumu ZATEN AYRI bir
-- mekanizmayla korunuyordu ve bu migration'dan ETKİLENMİYOR:
-- table_sessions (gerçek oturum, personel "Müşteri Kalktı" demeden asla
-- bitmez) + find_available_tables'ın "bugün aktif oturumu olan masayı ele"
-- kontrolü (0011). Yani iki katman zaten vardı; hatalı olan sadece
-- REZERVASYON PENCERESİNİN (is_active_hold=true iken) gün sonuna kadar
-- hesaplanmasıydı — o kısmı düzeltiyoruz, real-time katmana dokunmuyoruz.

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

  -- Blokaj (EXCLUDE constraint) penceresi artık DOĞRUDAN tahmini pencere —
  -- günün sonuna kadar UZATILMIYOR (bkz. yukarıdaki not).
  insert into reservation_tables (reservation_id, table_id, business_id, starts_at, ends_at, status, is_active_hold)
  values (v_reservation.id, p_table_id, p_business_id, p_starts_at, v_ends_at, 'confirmed', true);

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'reservation.create', 'reservations', v_reservation.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_reservation;
end;
$$;

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
    -- ARTIK end_of_business_day YOK — sadece rezervasyonun kendi tahmini
    -- penceresi (ends_at) kadar bloklar, saat kaç olursa olsun.
    v_block_until := new.ends_at;
  else
    v_block_until := greatest(new.starts_at + interval '1 minute', coalesce(new.actual_end_time, new.ends_at));
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

-- ---------------------------------------------------------------------------
-- Masa özellikleri (yapılandırılmış — filtrelenebilir) ve masa notu (serbest
-- metin) AYRI alanlar. "Cam kenarı" gibi bir istek artık sadece notes'a
-- yazılıp geçilmiyor — features üzerinden gerçekten filtrelenip masa seçimini
-- etkileyebiliyor (bkz. smart-endpoint/handlers/restaurant.js).
-- ---------------------------------------------------------------------------

alter table restaurant_tables add column if not exists features text[] not null default '{}';
alter table restaurant_tables add column if not exists notes text;

alter table menu_categories add column if not exists notes text;
alter table menu_items add column if not exists notes text;
alter table menu_items add column if not exists allergens text[] not null default '{}';
