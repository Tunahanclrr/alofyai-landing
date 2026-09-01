-- Push bildirim altyapısı. README §3.8'de "notifications" zaten mimari yer
-- tutucu olarak planlanmıştı ("v1'de gerçek gönderim yok — sadece mimari yer
-- tutucu, ileride provider eklenir") — şimdi gerçek gönderim ekleniyor:
-- Web Push (ücretsiz, tarayıcı/telefon "Ana Ekrana Ekle" sonrası uygulama
-- kapalıyken de çalışır). VAPID imzalama ve gerçek HTTP push gönderimi Edge
-- Function'da yaşar (_shared/push.js, service_role ile) — buradaki tablolar
-- sadece abonelikleri ve gönderim geçmişini/denetimini tutar.

-- notifications: gönderilen (ya da gönderilmeye çalışılan) her bildirimin
-- geçmiş kaydı — hem otomatik (yeni rezervasyon/randevu) hem manuel (panelden
-- elle yazılan) bildirimler buraya düşer, panelde "Bildirimler" sayfasında
-- listelenir.
create table if not exists notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  customer_id uuid references customers (id) on delete set null,
  type text not null,
  title text not null,
  body text not null,
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed', 'no_subscribers')),
  payload jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index if not exists notifications_business_idx on notifications (business_id, created_at desc);

alter table notifications enable row level security;
drop policy if exists notifications_select on notifications;
create policy notifications_select on notifications for select using (is_business_member(business_id));
-- Manuel bildirim yazma sadece settings.manage yetkisi olanlara (Owner) açık
-- — panelden rastgele bir bildirim broadcast'i işletme genelini etkileyen bir
-- eylem, staff.manage/services.manage gibi değil settings.manage'e daha yakın.
drop policy if exists notifications_insert on notifications;
create policy notifications_insert on notifications for insert
  with check (is_business_member(business_id) and has_permission(business_id, 'settings.manage'));

-- push_subscriptions: her tarayıcı/cihaz için ayrı bir Web Push aboneliği.
-- Bir kullanıcı birden fazla cihazdan (masaüstü + telefon) abone olabilir —
-- hepsine aynı anda gönderilir. endpoint zaten push servisinin kendi verdiği
-- benzersiz URL olduğu için doğal bir unique anahtar.
create table if not exists push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth_key text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subscriptions_business_idx on push_subscriptions (business_id);

alter table push_subscriptions enable row level security;
drop policy if exists push_subscriptions_select on push_subscriptions;
create policy push_subscriptions_select on push_subscriptions for select using (user_id = auth.uid());
drop policy if exists push_subscriptions_insert on push_subscriptions;
create policy push_subscriptions_insert on push_subscriptions for insert
  with check (user_id = auth.uid() and is_business_member(business_id));
drop policy if exists push_subscriptions_delete on push_subscriptions;
create policy push_subscriptions_delete on push_subscriptions for delete using (user_id = auth.uid());
