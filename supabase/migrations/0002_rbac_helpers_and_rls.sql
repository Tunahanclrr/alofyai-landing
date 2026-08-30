-- AlofyAI Phase 1 — RLS helper functions + policies
-- Implements the corrected model from the plan (README.md §4):
--   is_super_admin() no longer auto-bypasses is_business_member/has_permission.
--   Super Admin gets read-only oversight policies; write access to a specific
--   business requires either real membership or an ACTIVE impersonation session.

-- ---------------------------------------------------------------------------
-- Helper functions (SECURITY DEFINER, pinned search_path)
-- ---------------------------------------------------------------------------

create function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from super_admins sa where sa.user_id = auth.uid()
  );
$$;

create function public.is_impersonating(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from impersonation_sessions i
    where i.super_admin_id = auth.uid()
      and i.business_id = p_business_id
      and i.ended_at is null
  );
$$;

create function public.is_business_member(p_business_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from business_members bm
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
  ) or public.is_impersonating(p_business_id);
$$;

create function public.has_permission(p_business_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from business_members bm
    join role_permissions rp on rp.role_id = bm.role_id
    where bm.business_id = p_business_id
      and bm.user_id = auth.uid()
      and bm.status = 'active'
      and rp.permission_key = p_permission
  ) or public.is_impersonating(p_business_id);
$$;

-- current business_members.id for the caller in a given business (used later
-- for "view own appointments" style policies once appointments exist)
create function public.current_member_id(p_business_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select bm.id from business_members bm
  where bm.business_id = p_business_id
    and bm.user_id = auth.uid()
    and bm.status = 'active'
  limit 1;
$$;

revoke all on function public.is_super_admin() from public;
revoke all on function public.is_impersonating(uuid) from public;
revoke all on function public.is_business_member(uuid) from public;
revoke all on function public.has_permission(uuid, text) from public;
revoke all on function public.current_member_id(uuid) from public;
grant execute on function public.is_super_admin() to authenticated;
grant execute on function public.is_impersonating(uuid) to authenticated;
grant execute on function public.is_business_member(uuid) to authenticated;
grant execute on function public.has_permission(uuid, text) to authenticated;
grant execute on function public.current_member_id(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- businesses
-- ---------------------------------------------------------------------------

alter table businesses enable row level security;

create policy businesses_select on businesses
  for select
  using (is_business_member(id) or is_super_admin());

create policy businesses_update on businesses
  for update
  using (is_business_member(id))
  with check (is_business_member(id) and has_permission(id, 'settings.manage'));

-- no insert/delete policy for authenticated: businesses are created via the
-- create_business() RPC (0004) and never hard-deleted (status column instead).

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------

alter table profiles enable row level security;

create policy profiles_select_own on profiles
  for select
  using (id = auth.uid() or is_super_admin());

create policy profiles_update_own on profiles
  for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- super_admins — no policies for authenticated at all (default deny).
-- Granting/revoking super admin status is a manual, service-role-only action
-- (Supabase SQL editor), never exposed through the client API.
-- ---------------------------------------------------------------------------

alter table super_admins enable row level security;

create policy super_admins_select_self on super_admins
  for select
  using (user_id = auth.uid() or is_super_admin());

-- ---------------------------------------------------------------------------
-- roles / permissions / role_permissions
-- ---------------------------------------------------------------------------

alter table roles enable row level security;
alter table permissions enable row level security;
alter table role_permissions enable row level security;

create policy roles_select on roles
  for select
  using (business_id is null or is_business_member(business_id) or is_super_admin());

create policy roles_write_business_custom on roles
  for all
  using (business_id is not null and is_business_member(business_id))
  with check (business_id is not null and has_permission(business_id, 'staff.manage'));

create policy permissions_select on permissions
  for select
  using (true);

create policy role_permissions_select on role_permissions
  for select
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id
        and (r.business_id is null or is_business_member(r.business_id) or is_super_admin())
    )
  );

create policy role_permissions_write_business_custom on role_permissions
  for all
  using (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id and r.business_id is not null
        and is_business_member(r.business_id)
    )
  )
  with check (
    exists (
      select 1 from roles r
      where r.id = role_permissions.role_id and r.business_id is not null
        and has_permission(r.business_id, 'staff.manage')
    )
  );

-- ---------------------------------------------------------------------------
-- business_members
-- ---------------------------------------------------------------------------

alter table business_members enable row level security;

create policy business_members_select on business_members
  for select
  using (
    user_id = auth.uid()
    or is_business_member(business_id)
    or is_super_admin()
  );

create policy business_members_write on business_members
  for all
  using (is_business_member(business_id))
  with check (is_business_member(business_id) and has_permission(business_id, 'staff.manage'));

-- ---------------------------------------------------------------------------
-- impersonation_sessions — only the acting super admin can see/manage their own
-- ---------------------------------------------------------------------------

alter table impersonation_sessions enable row level security;

create policy impersonation_sessions_select on impersonation_sessions
  for select
  using (super_admin_id = auth.uid());

create policy impersonation_sessions_insert on impersonation_sessions
  for insert
  with check (super_admin_id = auth.uid() and is_super_admin());

create policy impersonation_sessions_update on impersonation_sessions
  for update
  using (super_admin_id = auth.uid() and is_super_admin())
  with check (super_admin_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit_logs — business members read their own business's log,
-- super admin reads everything, nobody gets update/delete (immutable),
-- inserts only via SECURITY DEFINER functions (not directly by clients).
-- ---------------------------------------------------------------------------

alter table audit_logs enable row level security;

create policy audit_logs_select on audit_logs
  for select
  using (
    (business_id is not null and is_business_member(business_id) and has_permission(business_id, 'reports.view'))
    or is_super_admin()
  );
