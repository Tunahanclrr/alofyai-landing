-- AlofyAI Phase 2 — Super Admin panel support
-- profiles.email (Users listesinde göstermek için, auth.users client'a açık değil)
-- + platform-level business status RPC + audited impersonation start/end RPC'leri

alter table profiles add column email text;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone, email)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone', new.email);
  return new;
end;
$$;

update profiles p set email = u.email
from auth.users u
where p.id = u.id and p.email is null;

-- ---------------------------------------------------------------------------
-- İşletme durumu (trial/active/suspended/cancelled) platform seviyesi bir
-- karardır — "işletme gibi davranma" (impersonation) değildir, bu yüzden
-- sadece is_super_admin() ister, is_business_member/has_permission değil.
-- ---------------------------------------------------------------------------

create function public.set_business_status(p_business_id uuid, p_status text)
returns businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_before businesses;
  v_after businesses;
begin
  if not public.is_super_admin() then
    raise exception 'yalnızca super admin işletme durumunu değiştirebilir';
  end if;
  if p_status not in ('trial', 'active', 'suspended', 'cancelled') then
    raise exception 'geçersiz durum: %', p_status;
  end if;

  select * into v_before from businesses where id = p_business_id;
  if v_before.id is null then
    raise exception 'işletme bulunamadı';
  end if;

  update businesses set status = p_status, updated_at = now()
  where id = p_business_id
  returning * into v_after;

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, before, after, source)
  values (
    p_business_id, auth.uid(), 'self', 'business.status_change', 'businesses', p_business_id,
    jsonb_build_object('status', v_before.status), jsonb_build_object('status', v_after.status), 'admin'
  );

  return v_after;
end;
$$;

revoke all on function public.set_business_status(uuid, text) from public;
grant execute on function public.set_business_status(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Impersonation start/end — RLS zaten insert/update'e izin veriyor (0002),
-- ama bu RPC'ler audit_logs kaydını garanti eder ve aynı anda tek aktif
-- impersonation kuralını uygular.
-- ---------------------------------------------------------------------------

create function public.start_impersonation(p_business_id uuid, p_reason text default null)
returns impersonation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session impersonation_sessions;
begin
  if not public.is_super_admin() then
    raise exception 'yalnızca super admin impersonation başlatabilir';
  end if;

  update impersonation_sessions
  set ended_at = now()
  where super_admin_id = auth.uid() and ended_at is null;

  insert into impersonation_sessions (super_admin_id, business_id, reason)
  values (auth.uid(), p_business_id, p_reason)
  returning * into v_session;

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (p_business_id, auth.uid(), 'impersonation', 'impersonation.start', 'businesses', p_business_id, 'admin');

  return v_session;
end;
$$;

create function public.end_impersonation(p_session_id uuid)
returns impersonation_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session impersonation_sessions;
begin
  update impersonation_sessions
  set ended_at = now()
  where id = p_session_id and super_admin_id = auth.uid() and ended_at is null
  returning * into v_session;

  if v_session.id is null then
    raise exception 'aktif impersonation oturumu bulunamadı';
  end if;

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (v_session.business_id, auth.uid(), 'impersonation', 'impersonation.end', 'businesses', v_session.business_id, 'admin');

  return v_session;
end;
$$;

revoke all on function public.start_impersonation(uuid, text) from public;
revoke all on function public.end_impersonation(uuid) from public;
grant execute on function public.start_impersonation(uuid, text) to authenticated;
grant execute on function public.end_impersonation(uuid) to authenticated;
