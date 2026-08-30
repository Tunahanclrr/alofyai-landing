-- Hizmetlere ve randevulara not alanı ekler.

alter table services add column notes text;
alter table appointments add column notes text;

-- book_appointment/_book_appointment_core'a p_notes eklemek için (mevcut
-- imzayla CREATE OR REPLACE belirsizlik yaratabileceğinden) drop + recreate.

drop function if exists public.book_appointment(uuid, jsonb, timestamptz, uuid);
drop function if exists public._book_appointment_core(uuid, uuid, jsonb, timestamptz, text, uuid);

create function public._book_appointment_core(
  p_business_id uuid,
  p_customer_id uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_source text,
  p_call_id uuid default null,
  p_notes text default null
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

  insert into appointments (business_id, customer_id, starts_at, ends_at, source, call_id, notes, created_by)
  values (p_business_id, p_customer_id, p_starts_at, v_final_end, p_source, p_call_id, p_notes, auth.uid())
  returning * into v_appointment;

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

revoke all on function public._book_appointment_core(uuid, uuid, jsonb, timestamptz, text, uuid, text) from public;
grant execute on function public._book_appointment_core(uuid, uuid, jsonb, timestamptz, text, uuid, text) to service_role;

create function public.book_appointment(
  p_customer_id uuid,
  p_items jsonb,
  p_starts_at timestamptz,
  p_call_id uuid default null,
  p_notes text default null
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

  return public._book_appointment_core(v_business_id, p_customer_id, p_items, p_starts_at, 'app', p_call_id, p_notes);
end;
$$;

revoke all on function public.book_appointment(uuid, jsonb, timestamptz, uuid, text) from public;
grant execute on function public.book_appointment(uuid, jsonb, timestamptz, uuid, text) to authenticated;

-- Var olan bir randevunun notunu güncelleme (appointments'ta doğrudan
-- update policy'si bilinçli olarak yok, tek yol bu RPC).
create function public.update_appointment_notes(p_appointment_id uuid, p_notes text)
returns appointments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_appointment appointments;
begin
  select business_id into v_business_id from appointments where id = p_appointment_id;
  if v_business_id is null then
    raise exception 'appointment_not_found';
  end if;
  if not (is_business_member(v_business_id) and has_permission(v_business_id, 'appointments.update')) then
    raise exception 'not_authorized: bu randevuyu güncelleme yetkiniz yok';
  end if;

  update appointments set notes = p_notes where id = p_appointment_id returning * into v_appointment;
  return v_appointment;
end;
$$;

revoke all on function public.update_appointment_notes(uuid, text) from public;
grant execute on function public.update_appointment_notes(uuid, text) to authenticated;
