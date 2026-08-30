-- AlofyAI Phase 4 — Vapi Core: ai_agents, phone_numbers, calls,
-- call_tool_invocations. Bu tablolara client'tan DOĞRUDAN yazma yolu YOK —
-- oluşturma/güncelleme Vapi API çağrısı gerektirdiği için sadece Edge
-- Function'lar (service_role) üzerinden yazılır (bkz. README §12).
-- Idempotent yazıldı: dosya baştan sona güvenle tekrar çalıştırılabilir.

create table if not exists ai_agents (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  vapi_assistant_id text unique not null,
  agent_type text not null check (agent_type in ('beauty_receptionist', 'restaurant_receptionist')),
  name text not null default 'AlofyAI Asistan',
  is_active boolean not null default true,
  greeting_message text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists phone_numbers (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  ai_agent_id uuid references ai_agents (id) on delete set null,
  vapi_phone_number_id text unique not null,
  e164_number text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (business_id)
);

create table if not exists calls (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  ai_agent_id uuid references ai_agents (id),
  phone_number_id uuid references phone_numbers (id),
  vapi_call_id text unique not null,
  customer_id uuid references customers (id),
  direction text check (direction in ('inbound', 'outbound')),
  status text not null default 'started' check (status in ('started', 'in_progress', 'ended')),
  started_at timestamptz,
  ended_at timestamptz,
  duration_seconds int,
  end_reason text,
  transcript_url text,
  recording_url text,
  cost numeric(10, 4),
  created_at timestamptz not null default now()
);

create index if not exists calls_business_idx on calls (business_id, created_at desc);

create table if not exists call_tool_invocations (
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references calls (id) on delete cascade,
  tool_name text not null,
  arguments jsonb,
  result jsonb,
  success boolean not null default true,
  idempotency_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists call_tool_invocations_idem on call_tool_invocations (call_id, idempotency_key) where idempotency_key is not null;
create index if not exists call_tool_invocations_call_idx on call_tool_invocations (call_id);

-- ---------------------------------------------------------------------------
-- RLS — sadece is_super_admin() yazabilir (provisioning Edge Function service
-- role ile çalışır, RLS'i zaten bypass eder — bu policy'ler sadece SQL
-- Editor'den elle bir super admin işlem yapmak isterse diye bir güvenlik ağı).
-- İşletme üyeleri sadece kendi işletmelerinin verisini görebilir.
-- ---------------------------------------------------------------------------

alter table ai_agents enable row level security;
drop policy if exists ai_agents_select on ai_agents;
create policy ai_agents_select on ai_agents for select using (is_business_member(business_id));
drop policy if exists ai_agents_admin_write on ai_agents;
create policy ai_agents_admin_write on ai_agents for all
  using (is_super_admin())
  with check (is_super_admin());

alter table phone_numbers enable row level security;
drop policy if exists phone_numbers_select on phone_numbers;
create policy phone_numbers_select on phone_numbers for select using (is_business_member(business_id));
drop policy if exists phone_numbers_admin_write on phone_numbers;
create policy phone_numbers_admin_write on phone_numbers for all
  using (is_super_admin())
  with check (is_super_admin());

alter table calls enable row level security;
drop policy if exists calls_select on calls;
create policy calls_select on calls for select using (is_business_member(business_id));
-- insert/update yok — sadece smart-endpoint (service_role) yazar.

alter table call_tool_invocations enable row level security;
drop policy if exists call_tool_invocations_select on call_tool_invocations;
create policy call_tool_invocations_select on call_tool_invocations for select
  using (exists (select 1 from calls c where c.id = call_tool_invocations.call_id and is_business_member(c.business_id)));
