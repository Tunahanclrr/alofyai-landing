  -- Randevu erteleme (tarih/saat değiştirme) — core+wrapper deseni.
  -- Bir randevunun appointment_services satırları, yeni başlangıçtan itibaren
  -- aynı sırayla ve aynı sürelerle yeniden dizilir; EXCLUDE constraint yeni
  -- saatte çakışma varsa reddeder (race-safe).

  create or replace function public._reschedule_appointment_core(
    p_appointment_id uuid,
    p_business_id uuid,
    p_new_starts_at timestamptz
  )
  returns appointments
  language plpgsql
  security definer
  set search_path = public
  as $$
  declare
    v_appointment appointments;
    v_cursor timestamptz := p_new_starts_at;
    v_final_end timestamptz := p_new_starts_at;
    v_service record;
  begin
    select * into v_appointment from appointments where id = p_appointment_id;
    if v_appointment.id is null or v_appointment.business_id is distinct from p_business_id then
      raise exception 'appointment_not_found';
    end if;
    if v_appointment.status <> 'booked' then
      raise exception 'cannot_reschedule: sadece onaylı randevular ertelenebilir';
    end if;
    if p_new_starts_at <= now() then
      raise exception 'cannot_reschedule_past: geçmiş bir saate randevu ertelenemez';
    end if;

    for v_service in
      select id, duration_minutes from appointment_services
      where appointment_id = p_appointment_id
      order by starts_at
    loop
      v_final_end := v_cursor + make_interval(mins => v_service.duration_minutes);
      update appointment_services
        set starts_at = v_cursor, ends_at = v_final_end
        where id = v_service.id;
      v_cursor := v_final_end;
    end loop;

    update appointments set starts_at = p_new_starts_at, ends_at = v_final_end
      where id = p_appointment_id
      returning * into v_appointment;

    insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
    values (p_business_id, auth.uid(), 'self', 'appointment.reschedule', 'appointments', p_appointment_id, 'app');

    return v_appointment;
  end;
  $$;

  revoke all on function public._reschedule_appointment_core(uuid, uuid, timestamptz) from public;
  grant execute on function public._reschedule_appointment_core(uuid, uuid, timestamptz) to service_role;

  create or replace function public.reschedule_appointment(p_appointment_id uuid, p_new_starts_at timestamptz)
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

    return public._reschedule_appointment_core(p_appointment_id, v_business_id, p_new_starts_at);
  end;
  $$;

  revoke all on function public.reschedule_appointment(uuid, timestamptz) from public;
  grant execute on function public.reschedule_appointment(uuid, timestamptz) to authenticated;
