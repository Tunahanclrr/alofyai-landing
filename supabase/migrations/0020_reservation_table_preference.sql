-- Müşterinin masa tercihi (örn. "cam kenarı" → window) artık sadece o anki
-- masa seçimini etkilemekle kalmıyor, rezervasyon kaydında da YAPILANDIRILMIŞ
-- olarak saklanıyor — reservations.notes (serbest metin, örn. "doğum günü")
-- ile KARIŞTIRILMIYOR, ayrı bir alan. Dashboard'da "Cam Kenarı" gibi
-- gösterilebilir.
--
-- _book_reservation_core'un imzasını değiştiriyoruz (yeni bir opsiyonel
-- parametre ekliyoruz). CREATE OR REPLACE farklı imzalı bir fonksiyonu
-- SESSİZCE yeni bir overload olarak ekler (eskisini silmez) — bu da iki
-- benzer imza arasında PostgreSQL'in "function is not unique" hatası verme
-- riskini doğurur (0008 migration'ında aynı sebeple drop+recreate deseni
-- kullanılmıştı, burada da aynı desen tekrarlanıyor: önce eski imzayı DROP
-- et, sonra tek bir yeni imzayla CREATE et — iki overload asla bir arada
-- yaşamaz).

alter table reservations add column if not exists table_preference text[] not null default '{}';

drop function if exists public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, int, text, uuid, text);

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
  p_notes text default null,
  p_table_preference text[] default '{}'
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

  insert into reservations (business_id, customer_id, party_size, starts_at, ends_at, estimated_duration, buffer_minutes, estimated_end_time, source, call_id, notes, table_preference, created_by)
  values (p_business_id, p_customer_id, p_party_size, p_starts_at, v_ends_at, p_estimated_duration, p_buffer_minutes, v_estimated_end, p_source, p_call_id, p_notes, p_table_preference, auth.uid())
  returning * into v_reservation;

  insert into reservation_tables (reservation_id, table_id, business_id, starts_at, ends_at, status, is_active_hold)
  values (v_reservation.id, p_table_id, p_business_id, p_starts_at, v_ends_at, 'confirmed', true);

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), case when p_source = 'vapi' then 'vapi' else 'self' end, 'reservation.create', 'reservations', v_reservation.id, case when p_source = 'vapi' then 'vapi' else 'app' end);

  return v_reservation;
end;
$$;

revoke all on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, int, text, uuid, text, text[]) from public;
grant execute on function public._book_reservation_core(uuid, uuid, uuid, int, timestamptz, int, int, text, uuid, text, text[]) to service_role;
