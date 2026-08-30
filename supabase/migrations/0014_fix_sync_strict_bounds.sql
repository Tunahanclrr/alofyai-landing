-- 0013'teki greatest(starts_at, ...) düzeltmesi lower>upper hatasını çözdü ama
-- starts_at == actual_end_time durumunda ends_at = starts_at (eşit) oluşup
-- reservation_tables'ın "check (ends_at > starts_at)" kısıtına (kesinlikle
-- büyük olmalı) takılabiliyordu. starts_at'e 1 dakika eklenerek strict >
-- garanti edilir.

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
