-- get_salon_info (Vapi tool) çalışma saatlerini business_hours'tan okuyor,
-- ama business_hours için restaurant_settings'teki gibi bir otomatik
-- varsayılan oluşturma mekanizması YOKTU. Sonuç: işletme sahibi İşletme
-- Ayarları'ndan elle en az bir kez kaydetmeden business_hours tablosunda hiç
-- satır olmuyordu — AI da "çalışma saatlerini göremiyorum" diyordu, çünkü
-- gerçekten hiçbir veri yoktu (bug değil, boş veri). Artık her yeni işletme
-- için makul bir varsayılan (her gün 09:00-18:00, açık) otomatik oluşuyor;
-- sahibi İşletme Ayarları sayfasından istediği gibi değiştirebilir.

create or replace function public.seed_business_hours()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into business_hours (business_id, day_of_week, opens_at, closes_at, is_closed)
  select new.id, d, '09:00'::time, '18:00'::time, false
  from generate_series(0, 6) as d
  on conflict (business_id, day_of_week) do nothing;
  return new;
end;
$$;

drop trigger if exists businesses_seed_business_hours on businesses;
create trigger businesses_seed_business_hours
  after insert on businesses
  for each row execute function public.seed_business_hours();

-- Mevcut işletmeler için geriye dönük doldur — SADECE business_hours'ta
-- hiç satırı olmayanlar için (sahibi zaten en az bir gün kaydettiyse o
-- işletmeye dokunulmaz, kısmi/özel ayarları ezilmesin diye).
insert into business_hours (business_id, day_of_week, opens_at, closes_at, is_closed)
select b.id, d, '09:00'::time, '18:00'::time, false
from businesses b
cross join generate_series(0, 6) as d
where not exists (select 1 from business_hours bh where bh.business_id = b.id)
on conflict (business_id, day_of_week) do nothing;
