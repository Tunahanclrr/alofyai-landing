-- sync_reservation_tables: rezervasyon tamamlandığında (actual_end_time=now())
-- eğer starts_at gelecekte bir tarihse (örn. check-in/complete planlanan
-- saatten ÖNCE yapılırsa), "ends_at = actual_end_time" starts_at'ten ÖNCEYE
-- düşüp geçersiz bir tstzrange (lower > upper) oluşturabiliyordu — 22000
-- hatası. ends_at'in her zaman starts_at'ten büyük/eşit olması garanti edilir.

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
    v_block_until := greatest(new.starts_at, coalesce(new.actual_end_time, new.ends_at));
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
