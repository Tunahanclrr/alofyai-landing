-- AlofyAI Phase 1 — business onboarding RPC
-- A freshly registered user has no business_members row yet, so the
-- businesses/business_members RLS write policies (which require
-- is_business_member) cannot let them self-insert. This SECURITY DEFINER
-- function is the one sanctioned path: it creates the business AND the
-- caller's owner membership in a single transaction.

create function public.create_business(p_name text, p_type text, p_slug text)
returns businesses
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business businesses;
  v_owner_role_id uuid;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  if p_type not in ('beauty', 'restaurant') then
    raise exception 'invalid business type: %', p_type;
  end if;

  select id into v_owner_role_id from roles where key = 'owner' and business_id is null;
  if v_owner_role_id is null then
    raise exception 'owner role template not found';
  end if;

  insert into businesses (name, type, slug)
  values (p_name, p_type, p_slug)
  returning * into v_business;

  insert into business_members (business_id, user_id, role_id, status)
  values (v_business.id, auth.uid(), v_owner_role_id, 'active');

  insert into audit_logs (business_id, actor_user_id, acted_as, action, target_type, target_id, source)
  values (v_business.id, auth.uid(), 'self', 'business.create', 'businesses', v_business.id, 'app');

  return v_business;
end;
$$;

revoke all on function public.create_business(text, text, text) from public;
grant execute on function public.create_business(text, text, text) to authenticated;
