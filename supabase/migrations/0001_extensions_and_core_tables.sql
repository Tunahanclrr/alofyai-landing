-- AlofyAI Phase 1 — extensions + identity/tenancy/RBAC core tables
-- No RLS enabled yet in this file (see 0002_rbac_helpers_and_rls.sql).

create extension if not exists "pgcrypto";
create extension if not exists "btree_gist";

-- ---------------------------------------------------------------------------
-- Identity / tenancy
-- ---------------------------------------------------------------------------

create table businesses (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('beauty', 'restaurant')),
  name text not null,
  slug text not null unique,
  timezone text not null default 'Europe/Istanbul',
  status text not null default 'trial' check (status in ('trial', 'active', 'suspended', 'cancelled')),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, type)
);

create table profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table super_admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  granted_by uuid references auth.users (id),
  granted_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- RBAC
-- ---------------------------------------------------------------------------

create table roles (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses (id) on delete cascade,
  key text not null,
  name text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

-- one global template per key; business-specific keys unique within that business
create unique index roles_global_key_uidx on roles (key) where business_id is null;
create unique index roles_business_key_uidx on roles (business_id, key) where business_id is not null;

create table permissions (
  key text primary key,
  resource text not null,
  action text not null,
  description text
);

create table role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_key text not null references permissions (key) on delete cascade,
  primary key (role_id, permission_key)
);

create table business_members (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references roles (id),
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  invited_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (business_id, user_id)
);

create index business_members_user_idx on business_members (user_id);
create index business_members_business_idx on business_members (business_id);

-- ---------------------------------------------------------------------------
-- Impersonation (Super Admin "login as business") + audit log
-- ---------------------------------------------------------------------------

create table impersonation_sessions (
  id uuid primary key default gen_random_uuid(),
  super_admin_id uuid not null references auth.users (id),
  business_id uuid not null references businesses (id),
  reason text,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);

create index impersonation_sessions_active_idx
  on impersonation_sessions (super_admin_id, business_id)
  where ended_at is null;

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  business_id uuid references businesses (id),
  actor_user_id uuid references auth.users (id),
  acted_as text not null default 'self' check (acted_as in ('self', 'impersonation', 'vapi')),
  action text not null,
  target_type text,
  target_id uuid,
  before jsonb,
  after jsonb,
  source text not null default 'app' check (source in ('app', 'admin', 'vapi')),
  ip_address inet,
  user_agent text,
  created_at timestamptz not null default now()
);

create index audit_logs_business_idx on audit_logs (business_id, created_at desc);

-- ---------------------------------------------------------------------------
-- profiles auto-provisioning on signup
-- ---------------------------------------------------------------------------

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, phone)
  values (new.id, new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'phone');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
