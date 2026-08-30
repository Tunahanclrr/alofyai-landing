# AlofyAI — Final Mimari Planı

## Context

`alofy landing page` şu anda tek sayfalık statik bir tanıtım sitesi (tek `App.jsx`, web3forms lead formu, backend yok). Bu repo tamamen AlofyAI ürününe dönüşecek: güzellik salonları/kuaförler ve restoranlar için multi-tenant SaaS, Super Admin paneli, işletme panelleri (Owner/Manager/Staff, granular yetkilerle), ve Vapi tabanlı 7/24 AI telefon resepsiyonisti — hepsi Supabase (Postgres + Auth + Storage + Edge Functions + RLS) üzerinde.

**Dil kararı:** Ürünün tüm kullanıcı arayüzü (landing page, auth ekranları, business paneli, super admin paneli — butonlar, formlar, hata mesajları, boş durum metinleri, bildirimler) tamamen **Türkçe** olacak. Kod, tablo/kolon isimleri, route path'leri, permission key'leri İngilizce kalır (endüstri standardı, bakım kolaylığı) — sadece kullanıcıya görünen metinler Türkçe.

Onaylanmış kararlar:
- Bu repo tamamen SaaS app'e dönüşür; landing page içeriği silinmez, `src/marketing/` altına taşınır ve `/` route'unda kalır.
- Supabase projesi mevcut; key'ler Phase 1'de sağlanacak.
- Vapi hesabı mevcut ve aktif; eski projeden hiçbir kod/agent/tool taşınmayacak, sıfırdan kurulacak.
- `business_id` hiçbir zaman client/Vapi arguments'tan güvenilir kabul edilmez — her zaman server-side resolve edilir.
- Faz faz kodlanacak; **kullanıcı "Phase 1'e başla" demeden migration/component/büyük kod değişikliği yapılmayacak.**
- Öncelik sırası: Security > Tenant isolation > Data integrity > Correct business logic > Vapi reliability > Responsive UX > Performance > Visual polish.

Bu, sıfırdan (greenfield) bir build — korunması gereken çalışan bir backend/RLS/Vapi kodu yok.

**Onay sonrası eklenen 7 kritik düzeltme** (uygulandığı bölümler işaretli): (1) RPC'lerde client-verilen `business_id` güven kaynağı olmaktan çıkarıldı, §4.3; (2) Super Admin genel yetkisi ile impersonation-özel business erişimi ayrıştırıldı, §4.1/§6; (3) `reservation_tables` üzerindeki EXCLUDE constraint tasarım hatası düzeltildi (range denormalize edildi), §3.5; (4) `book_appointment` + paket tüketimi tek transaction'a alındı, §4.3; (5) `customers` türetilmiş alanları (`total_visits`/`no_show_count`/`last_visit_at`) client-yazımına kapatıldı, §3.4; (6) Vapi mutation'larında kayıt-sahiplik doğrulaması zorunlu kılındı, §4.3/§11; (7) junction tablolara (`appointment_services`, `staff_services`, `package_services`, `reservation_tables`) doğrudan `business_id` + composite FK eklendi, §3.4/§3.5/§3.9.

---

## 1. Final Klasör Yapısı

```
src/
├── app/                     # işletme paneli (Owner/Manager/Staff)
│   ├── beauty/               # randevu, calendar, personel, hizmet, paket
│   └── restaurant/           # masa, rezervasyon, menü
├── admin/                   # Super Admin paneli
├── auth/                    # login / register / forgot-password
├── marketing/               # mevcut landing page içeriği (taşındı, korunuyor)
├── components/              # Button, Input, Select, Modal, ConfirmDialog, Table,
│                            #   Badge, Card, Tabs, Calendar, DatePicker, TimePicker,
│                            #   Toast, EmptyState, Skeleton, Avatar, Sidebar, Navbar
├── layouts/                 # AppLayout, AdminLayout (responsive sidebar+navbar shell)
├── hooks/                   # usePermission, useBusiness, useAuth, usePagination, ...
├── context/                 # AuthContext, BusinessContext, ImpersonationContext
├── services/                 # supabase query modülleri (appointments.js, customers.js, ...)
├── lib/                     # supabaseClient.js, permissions.js, phone.js (E.164 normalize)
├── routes/                  # route table + guard'lar
└── utils/                   # formatting, validation, date/timezone helpers

supabase/
├── migrations/               # numaralı SQL migration'lar (bkz. §3)
└── functions/
    └── smart-endpoint/
        ├── index.ts           # webhook verify → business resolve → tool router
        └── handlers/
            ├── shared.ts       # get_customer, create_customer, get_salon_info
            ├── beauty.ts        # list_services, check_availability, book/cancel/reschedule
            └── restaurant.ts    # table availability, create/cancel reservation
```

Stack ekleri: `react-router-dom`, `@supabase/supabase-js`. TypeScript yok, ek state-management kütüphanesi yok (React context yeterli). i18n kütüphanesi gerekmiyor — tek dil (Türkçe) olduğu için string'ler doğrudan Türkçe yazılır.

---

## 2. Final Route Diyagramı

```
/                            landing page (marketing, korunuyor)
/login  /register

/admin                       Super Admin (guard: is_super_admin())
/admin/dashboard
/admin/businesses  /admin/businesses/:id
/admin/users
/admin/subscriptions
/admin/agents  /admin/phone-numbers  /admin/calls  /admin/usage
/admin/payments
/admin/logs                  audit log görüntüleme
/admin/settings

/app                          İşletme paneli (guard: aktif business_members üyeliği)
/app/dashboard
/app/appointments  /app/appointments/new  /app/appointments/:id      (beauty)
/app/calendar                 personel/gün/hafta takvim görünümü
/app/customers  /app/customers/new  /app/customers/:id
/app/staff  /app/staff/new  /app/staff/:id
/app/services  /app/services/new  /app/services/:id
/app/packages  /app/packages/:id
/app/payments
/app/waitlist
/app/calls  /app/calls/:id
/app/reports
/app/settings/business  /app/settings/hours  /app/settings/users
/app/settings/permissions  /app/settings/ai  /app/settings/phone

/app/restaurant/tables
/app/restaurant/reservations
/app/restaurant/waitlist
/app/restaurant/menu  /app/restaurant/menu/categories
```

Route guard'lar `BusinessContext`'ten `businesses.type` (beauty/restaurant'a özel route'ları gizler) ve `usePermission` hook'undan granular yetkiyi okur (örn. Staff `/app/reports`'a girmeye çalışırsa engellenir/yönlendirilir). Bu guard'lar **UX içindir, güvenlik sınırı değildir** — asıl güvenlik sınırı §4'teki RLS/RPC katmanıdır.

---

## 3. Database ER İlişki Planı

### 3.1 Kimlik / Tenancy

```
auth.users ──1:1── profiles (full_name, phone, avatar_url)
auth.users ──1:N── business_members (business_id, role_id, status)
businesses ──1:N── business_members
super_admins (user_id, granted_by, granted_at)   ← ayrı tablo, boolean flag değil
```

### 3.2 RBAC

```
roles (business_id NULL=global template | dolu=işletmeye özel, key, name, is_system)
permissions (key: appointments.view_own, appointments.view_all, appointments.create,
             appointments.update, appointments.cancel, appointments.cancel_all,
             customers.view, customers.create, customers.update,
             services.manage, staff.manage, packages.manage, payments.manage,
             reports.view, settings.manage, billing.manage, ai.manage)
role_permissions (role_id, permission_key)
```
v1: sadece 3 sabit template rol (owner/manager/staff) + Super Admin. Şema işletmeye özel custom rolleri destekler (`roles.business_id`) ama v1'de UI'ı yok.

### 3.3 Staff vs Business Member (ayrım — kritik düzeltme)

```
business_members  → panele giriş yetkisini temsil eder (Owner/Manager/Staff)
staff             → operasyonel hizmet veren personeli temsil eder

staff (id, business_id, business_member_id NULL, full_name, phone, email,
       photo_url, color, is_active, created_at)
```
- `business_member_id` **nullable**: bir staff kaydının login hesabı olmak zorunda değil (örn. panele girmeyen bir kuaför, yine de randevuya atanabilir).
- Tersi de geçerli: her business_member'ın staff kaydı olmak zorunda değil (örn. sadece yönetim yapan Owner, hizmet vermiyor olabilir).
- Eğer bir staff'ın hesabı varsa, `staff.business_member_id` üzerinden `business_members` → `profiles` → `auth.users` zincirine güvenli şekilde bağlanır.
- `staff_services`, `staff_working_hours`, `staff_time_off`, `appointment_services.staff_id` artık `business_members` değil **`staff(id)`**'ye referans verir.

### 3.4 Beauty Domain

```
services (id, business_id, name, duration_minutes, price, buffer_minutes, is_active)
staff_services (staff_id → staff, service_id → services, business_id)
   [hangi personel hangi hizmeti yapabilir. business_id DENORMALIZE edilir:
    composite FK (staff_id, business_id) → staff(id, business_id) ile "staff'ın
    business_id'si" garanti tutarlı kalır; ayrıca services(id,business_id) ile
    çapraz tutarlılığı doğrulayan bir BEFORE INSERT/UPDATE trigger eklenir
    (composite FK tek bir parent'a bağlanabildiği için ikinci parent trigger'la
    doğrulanır). Amaç: RLS'in appointments/services gibi diğer tablolarla aynı
    tek-kolon `is_business_member(business_id)` şablonunu, join'e gerek kalmadan
    kullanabilmesi — hem daha hızlı hem daha az hataya açık.]

business_hours (business_id, day_of_week, opens_at, closes_at, is_closed)
business_special_hours (business_id, date, is_closed, opens_at, closes_at, label)
   [tatil / özel kapanış / özel açılış saatleri]

staff_working_hours (staff_id → staff, day_of_week, starts_at, ends_at)
staff_time_off (staff_id → staff, starts_at, ends_at, type: vacation|sick|personal|other, reason)

customers (id, business_id, full_name, phone, normalized_phone, email, notes,
           last_visit_at, total_visits, no_show_count, status, merged_into_id NULL,
           created_at, updated_at)
   unique(business_id, normalized_phone)
   [`last_visit_at`/`total_visits`/`no_show_count` TÜRETİLMİŞ alanlardır (düzeltme #5):
    `authenticated` rolüne bu 3 kolonda column-level UPDATE grant'i VERİLMEZ
    (Postgres column-level GRANT), sadece SECURITY DEFINER trigger fonksiyonu
    `sync_customer_stats()` bunları appointment status-transition'ında günceller.
    Client hiçbir yoldan (RLS doğru yazılsa bile) bu alanları direkt UPDATE edemez.]

appointments (id, business_id, customer_id, starts_at, ends_at, status, source,
              call_id NULL, cancel_reason NULL, created_by, created_at)
   [appointment artık "ziyaret" wrapper'ı — tek hizmete kilitli değil.
    unique(id, business_id) eklenir — appointment_services'ten composite FK için.]

appointment_services (id, appointment_id → appointments, business_id, service_id → services,
                       staff_id → staff, starts_at, ends_at, duration_minutes, price,
                       during tstzrange GENERATED, blocks_schedule boolean)
   [rezervasyon anındaki gerçek süre/fiyat burada donar — hizmet fiyatı sonradan
    değişse bile geçmiş randevu bozulmaz. Farklı hizmetler farklı personellere
    atanabilir.
    business_id: composite FK (appointment_id, business_id) → appointments(id, business_id)
    — join'siz RLS + EXCLUDE için gerekli (bkz. §3.9, düzeltme #7).
    blocks_schedule: appointments.status'ten senkronize edilen (trigger ile) bir
    "bu satır hâlâ takvimi bloklasın mı" bayrağı — appointments.status='cancelled'
    olunca false'a döner. EXCLUDE constraint SADECE bu tabloda tanımlanabilir
    (aşağıya bkz.) çünkü Postgres EXCLUDE, kısıtlanan satırın KENDİ kolonlarını
    kullanabilir — parent tablodaki bir kolonu (appointments.status gibi) doğrudan
    referans alamaz; bu yüzden status'ün bloklayıcı hali buraya denormalize edilir:

    ALTER TABLE appointment_services
      ADD CONSTRAINT no_overlapping_staff_appointments
      EXCLUDE USING gist (business_id WITH =, staff_id WITH =, during WITH &&)
      WHERE (blocks_schedule);]

packages (id, business_id, name, total_sessions, price)
   unique(id, business_id)
package_services (package_id → packages, service_id → services, business_id)
   [bir paket hangi hizmetlerde geçerli — customer_package tüketirken kontrol edilir.
    business_id: composite FK (package_id, business_id) → packages(id, business_id),
    ve services(id,business_id) ile çapraz tutarlılığı doğrulayan trigger (aynı
    staff_services deseni, §3.9 düzeltme #7).]

customer_packages (id, business_id, customer_id, package_id, sessions_total,
                    sessions_used, purchase_price, purchased_at, starts_at,
                    expires_at, status)
package_session_logs (id, customer_package_id, appointment_service_id, delta,
                       created_by, created_at)

payments (id, business_id, customer_id, appointment_id NULL, customer_package_id NULL,
          amount, method: cash|card|transfer|online, status: pending|completed|refunded,
          created_by, created_at)

waitlist_entries (id, business_id, customer_id, desired_service_id NULL,
                   preferred_date, preferred_time_start, preferred_time_end,
                   status: waiting|notified|booked|expired|cancelled, created_at)
```

### 3.5 Restaurant Domain

```
restaurant_tables (id, business_id, label, capacity, area, status,
                    pos_x NULL, pos_y NULL, width NULL, height NULL, rotation NULL,
                    is_active)
   [x/y/width/height/rotation ileride masa haritası editörü için hazır — v1'de kullanılmaz]
   unique(id, business_id)

reservations (id, business_id, customer_id, party_size, starts_at, ends_at,
              status, source, call_id NULL, cancel_reason NULL, created_at)
   unique(id, business_id)
   [DİKKAT — düzeltme (bkz. plan başındaki 7 madde, #3): `during`/EXCLUDE burada
    DEĞİL, reservation_tables'ta tanımlanır — sebebi aşağıda.]

reservation_tables (id, reservation_id → reservations, table_id → restaurant_tables,
                     business_id, starts_at, ends_at, during tstzrange GENERATED,
                     status, is_active_hold boolean)
   [junction — v1'de her rezervasyon 1 masa, ileride masa birleştirme (4+5→1 rezervasyon)
    şema değişikliği gerektirmeden desteklenir.

    TASARIM DÜZELTMESİ: Postgres'te EXCLUDE constraint, kısıtlanan satırın KENDİ
    kolonlarını kullanmak zorundadır — `during`'i sadece `reservations`'ta tutup
    junction'da ona (join ile) referans vererek EXCLUDE tanımlanamaz. Çözüm:
    starts_at/ends_at/during ve status, `reservations`'tan reservation_tables'a
    DENORMALIZE edilir; bir AFTER INSERT/UPDATE trigger (`sync_reservation_tables()`)
    reservations.starts_at/ends_at/status her değiştiğinde ilgili reservation_tables
    satır(lar)ını senkronize eder (status='cancelled' → is_active_hold=false).
    business_id: composite FK (reservation_id, business_id) → reservations(id, business_id)
    VE (table_id, business_id) → restaurant_tables(id, business_id) — iki composite FK
    birden mümkündür çünkü her ikisi de aynı business_id kolonunu hedefler, bu da
    aynı zamanda table_id'nin reservation ile aynı business'a ait olduğunu garanti eder.

    ALTER TABLE reservation_tables
      ADD CONSTRAINT no_overlapping_table_reservations
      EXCLUDE USING gist (business_id WITH =, table_id WITH =, during WITH &&)
      WHERE (is_active_hold);

    Bu satırın "gerçek kaynak" değil "senkronize edilmiş yansıma" olduğu, tüm
    yazmaların (`book_reservation`/`cancel_reservation` RPC'leri) `reservations`
    üzerinden yapılıp trigger'ın junction'ı otomatik güncellediği açıkça belgelenir
    — hiçbir uygulama kodu reservation_tables'a doğrudan starts_at/ends_at yazmaz.]

menu_categories (id, business_id, name, sort_order, is_active)
menu_items (id, business_id, category_id, name, description, price, image_url, is_active)

restaurant_settings alanları businesses.settings jsonb içinde:
   default_reservation_minutes (varsayılan 90), turnover_buffer_minutes
   [business ayarından değiştirilebilir]
```

### 3.6 Vapi / AI Domain

```
ai_agents (id, business_id, vapi_assistant_id UNIQUE, agent_type, is_active, config jsonb)
phone_numbers (id, business_id, ai_agent_id, vapi_phone_number_id UNIQUE, e164_number, is_active)

calls (id, business_id, ai_agent_id, phone_number_id, vapi_call_id UNIQUE,
       customer_id NULL, direction, status: started|in_progress|ended,
       started_at, ended_at, duration_seconds, end_reason,
       transcript_url, recording_url, cost)

call_tool_invocations (id, call_id → calls, tool_name, arguments jsonb, result jsonb,
                        success, idempotency_key, created_at)
   [idempotency_key: Vapi'nin tool-call id'si — retry'larda duplicate işlem engeli]
```

### 3.7 Billing

```
plans (id, key, name, monthly_price, included_ai_minutes, overage_rate_per_minute NULL, max_staff)
subscriptions (id, business_id, plan_id, status, current_period_start/end,
               psp_subscription_id NULL, cancel_at_period_end)
usage_periods (id, business_id, subscription_id, period_start, period_end,
               included_minutes, minutes_used, overage_minutes GENERATED)
usage_events (id, business_id, usage_period_id, call_id UNIQUE, minutes, created_at)
```

### 3.8 Audit / Impersonation / Notifications

```
audit_logs (id, business_id NULL, actor_user_id NULL, acted_as: self|impersonation|vapi,
            action, target_type, target_id, before jsonb, after jsonb,
            source: app|admin|vapi, ip_address, user_agent, created_at)

impersonation_sessions (id, super_admin_id, business_id, started_at, ended_at, reason)

notifications (id, business_id, customer_id NULL, type: appointment_confirmation|
               cancellation|reminder|waitlist|reservation_confirmation,
               channel NULL (sms|whatsapp|email — v1'de boş), status, payload jsonb,
               created_at)
   [v1'de gerçek gönderim yok — sadece mimari yer tutucu, ileride provider eklenir]
```

### 3.9 Data Integrity İlkeleri

- Her business-scoped tabloda FK + `not null business_id` + ilgili unique/check constraint'ler.
- **Junction tablolarda (`appointment_services`, `staff_services`, `package_services`, `reservation_tables`) `business_id` doğrudan denormalize edilir** (düzeltme #7), join'e dayalı RLS yerine — her parent tabloda `unique(id, business_id)` + junction'da composite FK `(parent_id, business_id) references parent(id, business_id)` deseniyle drift imkansız hale getirilir. Tek bir parent'a bağlı olmayan junction'larda (örn. `staff_services`'in hem `staff` hem `services`'e bağlı olması gibi) ikinci parent'a karşı tutarlılık BEFORE INSERT/UPDATE trigger ile doğrulanır. Sonuç: bu tablolarda da diğer tüm tablolarla aynı tek-kolon `is_business_member(business_id)` RLS şablonu kullanılabilir — hem daha hızlı hem daha tutarlı.
- `business`, `staff`, `services`, `menu_items` gibi geçmişe referans verilen kayıtlarda **hard delete yok** — `is_active`/`status` ile pasifleştirme. Geçmiş randevu/ödeme kayıtları asla yanlışlıkla silinemez.
- Index planı (ölçek: 10 → 1.000+ işletme hedefiyle): `business_id+created_at`, `business_id+normalized_phone`, `business_id+status`, `business_id+starts_at` şeklinde sorgu-pattern'ine göre composite index'ler.
- Frontend validation hiçbir zaman tek katman değildir — her kritik alan (telefon format, fiyat, süre, tarih/saat) DB seviyesinde de constraint/trigger ile korunur.

---

## 4. RLS / Güvenlik Modeli (Defense-in-Depth)

Güvenlik üç katmanlı, birbirini tamamlayan bir savunma olarak tasarlanır — **hiçbiri tek başına yeterli kabul edilmez**:

```
UI authorization       → buton/menü gizleme (sadece UX, güvenlik sınırı DEĞİL)
        +
API/RPC authorization  → SECURITY DEFINER RPC fonksiyonları, has_permission() kontrolü
        +
Database/RLS authorization → her tabloda tenant izolasyonu + permission-aware write policy
```

### 4.1 Helper fonksiyonlar (SECURITY DEFINER, pinned search_path)

**Düzeltme (7 maddenin #2'si): Super Admin'in genel yetkisi ile "belirli bir business'a business_member gibi erişim" mantıksal olarak ayrılır.** Önceki tasarımda `is_business_member`/`has_permission` her zaman `OR is_super_admin()` ile otomatik bypass yapıyordu — bu, super admin'e TÜM işletmelerin operasyonel verisine kalıcı/örtük bir erişim veriyordu, impersonation'ı anlamsızlaştırıyordu. Yeni tasarım:

```sql
is_super_admin()                          -- super_admins tablosuna bakar (JWT değil, anında revoke)

is_impersonating(business_id)             -- aktif impersonation_sessions satırı VAR MI
                                           --   (super_admin_id=auth.uid(), business_id=$1, ended_at IS NULL)

is_business_member(business_id)           -- aktif business_members satırı VAR MI
                                           --   OR is_impersonating(business_id)
                                           --   [is_super_admin() TEK BAŞINA ARTIK BYPASS DEĞİL]

has_permission(business_id, perm_key)     -- business_members→role_permissions join
                                           --   OR is_impersonating(business_id)  [impersonation = owner-eşdeğeri yetki, audit'li]

current_staff_id(business_id)             -- caller'ın bu business'taki staff.id'si (varsa)
```

`is_super_admin()` artık sadece iki yerde kullanılır: (a) `/admin/*` route guard'ı ve (b) **ayrı, salt-okunur "oversight" RLS politikaları** — business-scoped tablolarda tenant-izolasyon politikasına ek olarak `create policy super_admin_oversight_select on <table> for select using (is_super_admin());` şeklinde bir SELECT-only politika (write yok). Böylece Super Admin panelden tüm işletmelerin verisini görebilir (raporlama/oversight amacıyla, meşru) ama bir işletmenin operasyonel verisini DEĞİŞTİREMEZ — mutasyon yapmak istiyorsa önce açıkça `impersonation_sessions` başlatmalı (bannerlı, exit'li, audit'li — §6), bu da "genel admin yetkisi" ile "şu an şu işletme gibi davranıyorum" arasındaki farkı kod seviyesinde de netleştirir.

### 4.2 RLS politika şablonu — HER business-scoped tabloda

Önceki tasarımdan kritik fark: **write politikaları artık sadece tenant değil, permission de kontrol eder** — böylece yetkisiz bir mutation doğrudan Supabase client/RPC ile denense bile RLS seviyesinde reddedilir (sadece app-layer opt-in kontrolüne güvenilmez).

```sql
-- SELECT: tenant üyeliği + (tüm görme yetkisi VEYA sadece kendi kaydı)
create policy select_appointments on appointment_services for select
using (
  is_business_member(business_id) and (
    has_permission(business_id, 'appointments.view_all')
    or (has_permission(business_id, 'appointments.view_own')
        and staff_id = current_staff_id(business_id))
  )
);

-- WRITE: tenant üyeliği + ilgili permission
create policy write_appointments on appointments for update
using (is_business_member(business_id))
with check (is_business_member(business_id) and has_permission(business_id, 'appointments.update'));
```

Bu şablon (select/insert/update/delete × ilgili permission key) `services`, `customers`, `appointments`, `appointment_services`, `staff`, `staff_services`, `staff_working_hours`, `staff_time_off`, `packages`, `customer_packages`, `payments`, `restaurant_tables`, `reservations`, `reservation_tables`, `menu_categories`, `menu_items`, `calls`, `usage_periods`, `subscriptions` dahil **tüm business-scoped tablolarda** tekrarlanır.

### 4.3 Kritik mutasyonlar için SECURITY DEFINER RPC katmanı

**Düzeltme (7 maddenin #1, #4, #6'sı): "core + wrapper" fonksiyon deseni.** Önceki tasarımda RPC'ler `business_id`'yi doğrudan parametre olarak alıyordu — bu, client'ın (veya kötü niyetli bir çağrının) `business_id`'yi manipüle etmesine teorik bir yüzey açıyordu. Yeni desen, her mutasyon için business_id'yi **asla girdi olarak güvenmez**, ilişkili kayıtlardan türetir/çapraz doğrular:

```
_book_appointment_core(business_id, customer_id, items[], starts_at, source, call_id)
   -- SECURITY DEFINER, EXECUTE sadece service_role + aşağıdaki wrapper'a verilir
   -- (authenticated rolüne DOĞRUDAN grant YOK)
   1. customer_id → customers.business_id oku;  items[].service_id → services.business_id;
      items[].staff_id → staff.business_id  — HEPSİ business_id ile eşleşmeli, yoksa
      exception (bu, madde #6'nın "kayıt sahiplik doğrulaması" karşılığıdır — hem web
      hem Vapi çağrısı için, çünkü core fonksiyon her iki yoldan da geçer)
   2. staff_services ilişkisi + working hours + time_off doğrulanır (§5)
   3. appointment + appointment_services INSERT (EXCLUDE constraint race-safe yazar)
   4. paket seçiliyse consume_package_session() BU FONKSİYON İÇİNDE, nested call
      olarak çağrılır — ayrı bir client round-trip DEĞİL (madde #4: appointment
      satırı yazılıp paket tüketimi ayrı adımda başarısız olamaz; ikisi de aynı
      PL/pgSQL fonksiyon gövdesi = aynı transaction; herhangi bir adımda exception
      → PostgreSQL fonksiyonun o ana kadar yazdığı HER ŞEYİ implicit ROLLBACK eder)
   5. audit_logs INSERT (source='app'|'vapi')

book_appointment(customer_id, items[], starts_at, call_id)          -- web panel wrapper
   -- SECURITY DEFINER, EXECUTE → authenticated
   -- business_id PARAMETRE DEĞİL: customer_id'den okunur (customers.business_id)
   -- is_business_member(business_id) + has_permission(business_id,'appointments.create')
   --   auth.uid() üzerinden doğrulanır (madde #1: "client business_id göndermez,
   --   RPC auth.uid() → business_members → business_id ile kendisi çözer")
   -- sonra _book_appointment_core(..., source='app') çağırır

-- Vapi Edge Function (service-role client) _book_appointment_core'u DOĞRUDAN çağırır,
-- business_id = Smart Endpoint'in server-side resolve ettiği değer (Vapi arguments'tan
-- DEĞİL), source='vapi'. Permission check YOK (zaten trust sınırı Smart Endpoint'te,
-- §7) ama adım 1'deki kayıt-sahiplik çapraz doğrulaması AYNEN ÇALIŞIR — yani
-- Business A'nın AI'ı, yanlışlıkla/kötü niyetle Business B'ye ait bir customer_id
-- veya staff_id gönderse bile core fonksiyon bunu reddeder.

cancel_appointment(appointment_id, reason)          -- aynı core+wrapper deseni:
_cancel_appointment_core(appointment_id, reason, source, business_id)
   1. appointments.business_id = verilen business_id mi? DEĞİLSE exception
      (madde #6 — ID tek başına yeterli değil, mutlaka business_id ile çapraz kontrol)
   2. status → cancelled, cancel_reason yazılır
   3. paket tüketilmişse package_session_logs'a +1 (iade) — aynı transaction
   4. audit_logs INSERT
book_reservation / cancel_reservation → aynı core+wrapper deseni, aynı 4 kural.
```

Bu iki-katmanlı yapı sayesinde: web panel çağrılarında `business_id` hiçbir zaman client'tan gelmez (auth.uid()'den türetilir); Vapi çağrılarında `business_id` Smart Endpoint'in resolve ettiği güvenilir değerdir ama yine de her ilişkili kaydın gerçekten o business'a ait olduğu ayrıca doğrulanır; ve appointment/reservation yazımı ile paket tüketimi/iade işlemi her zaman tek atomik transaction'da yaşar.

### 4.4 Katman sorumluluk tablosu

| Soru | Kim karşılar |
|---|---|
| Business A, Business B verisini görebilir mi? | RLS `is_business_member` (üyelik VEYA aktif impersonation — §4.1) |
| Super Admin, impersonation açmadan bir işletmenin randevusunu değiştirebilir mi? | **Hayır** — `is_super_admin()` artık sadece salt-okunur oversight SELECT politikalarında kullanılır; mutasyon için `is_business_member`/`has_permission` gerekir, bu da ya gerçek üyelik ya da aktif+audit'li `impersonation_sessions` ister (madde #2) |
| Staff, `appointments.cancel_all` yapabilir mi? | RLS write policy (`has_permission`) + RPC içi kontrol (çift savunma) |
| Direkt `supabase.from('services').update(...)` ile fiyat değiştirmeye çalışan yetkisiz Staff | RLS write policy reddeder (permission yok) |
| Vapi, başka business'ın verisine erişebilir mi? | Edge Function'da server-side resolve edilen `business_id`; Vapi arguments'taki `business_id` tamamen ignore edilir; AYRICA her ID-tabanlı RPC çağrısı (`cancel_appointment`, `get_remaining_sessions` vb.) hedef kaydın `business_id`'sinin resolve edilen değerle eşleştiğini ayrıca doğrular — sadece ID yeterli kabul edilmez (madde #6) |
| Aynı staff/masa iki kez rezerve edilebilir mi? | Postgres EXCLUDE constraint, `appointment_services`/`reservation_tables` üzerinde (RLS/permission'dan bağımsız, veri bütünlüğü katmanı — §3.4/§3.5) |

---

## 5. RBAC Permission Matrisi (v1)

| Permission | Owner | Manager | Staff |
|---|---|---|---|
| appointments.view_own | ✓ | ✓ | ✓ |
| appointments.view_all | ✓ | ✓ | ✗ |
| appointments.create / update | ✓ | ✓ | ✓ |
| appointments.cancel_all | ✓ | ✓ | ✗ (sadece kendi randevusunu iptal) |
| customers.view / create / update | ✓ | ✓ | ✓ |
| services.manage | ✓ | ✓ | ✗ |
| staff.manage | ✓ | ✗ | ✗ |
| packages.manage | ✓ | ✓ | ✗ |
| payments.manage | ✓ | ✓ | ✗ |
| reports.view | ✓ | ✓ | ✗ |
| settings.manage | ✓ | ✗ | ✗ |
| billing.manage | ✓ | ✗ | ✗ |
| ai.manage | ✓ | ✗ | ✗ |

Seed verisi olarak yüklenir; şema işletmeye özel özelleştirmeyi destekler (v1'de UI yok, §3.2).

---

## 6. Super Admin Mimarisi

- `/admin/*` guard: `is_super_admin()`.
- İşletme oluşturma/pasifleştirme, kullanıcı yönetimi, subscription/AI agent/phone number/call/usage/audit log görüntüleme — bunlar `is_super_admin()`'in **salt-okunur oversight** politikalarıyla desteklenir (§4.1); herhangi bir işletmenin operasyonel verisini mutasyona uğratmaz.
- **Impersonation** stateful: `impersonation_sessions` tablosu, gerçek Supabase Auth kullanıcısı DEĞİŞMEZ — ancak (düzeltme #2) sadece Super Admin OLMAK tek başına bir işletmenin verisine yazma erişimi VERMEZ. Super admin bir işletmede business_member gibi davranmak (randevu oluşturmak, iptal etmek, ayar değiştirmek) istediğinde önce açıkça bir `impersonation_sessions` kaydı başlatmalı; `is_business_member`/`has_permission` o kayıt aktifken (`is_impersonating(business_id)`) devreye girer. Bu, "genel platform yöneticisiyim" ile "şu an bu işletme gibi hareket ediyorum" durumlarını hem RLS hem UI seviyesinde net şekilde ayırır.
- Impersonation aktifken her request'te `set_config('app.impersonating_business_id', ...)` set edilir, böylece DB seviyesindeki trigger'lar (audit log dahil) de doğru attribute edilir.
- UI: impersonation süresince kalıcı **"⚠️ Impersonating: {İşletme Adı}"** banner'ı + her yerden erişilebilir "Impersonation'dan Çık" aksiyonu.
- Tüm impersonation start/end ve impersonation sırasında yapılan işlemler `audit_logs`'a `acted_as='impersonation'` ile yazılır.

---

## 7. Business Panel Mimarisi

- `AuthContext` (session/profile) + `BusinessContext` (aktif business, rol, permission seti — login'de bir kez çekilir, rol değişince yenilenir).
- `usePermission(businessId, key)` hook'u aynı `has_permission` RPC'sini sarmalar — UI gating ile backend enforcement asla birbirinden sapamaz (aynı fonksiyon).
- `businesses.type`'a göre Sidebar/route seti beauty veya restaurant moduna geçer (bkz. §2).
- Responsive shell: masaüstünde sabit sidebar, mobilde hamburger→drawer.

---

## 8. Beauty Randevu Akışı

```
Yeni Randevu
  → Müşteri seç (ara / yeni oluştur, normalized_phone ile duplicate kontrolü)
  → Hizmet(ler) seç (çoklu hizmet destekli: Ombre + Kesim + Fön)
  → Her hizmet için personel seç (staff_services ile kısıtlı liste)
  → Tarih/saat seç (calendar: boş/dolu görsel, business_hours + special_hours + 
     staff_working_hours + staff_time_off'a göre)
  → [opsiyonel] uygun paket varsa seç
  → Kaydet
       ↓
  book_appointment() RPC
       ↓ (her appointment_service için)
  1. staff_services ilişkisi geçerli mi?          (DB kontrol, AI bypass edemez)
  2. staff_working_hours + special_hours + time_off uygun mu?  (trigger)
  3. EXCLUDE constraint: staff+zaman çakışması var mı?         (race-safe)
  4. paket seçiliyse package_services'te bu hizmet var mı, seans kaldı mı?
     → consume_package_session() atomic
       ↓
  appointment + appointment_services satır(lar)ı yazılır, audit_logs kaydı düşer
```
No-show/iptal: `status` güncellenir, `cancel_reason` tutulur, trigger otomatik `audit_logs`'a yazar, `customers.no_show_count`/`total_visits` güncellenir.

---

## 9. Restaurant Rezervasyon Akışı

```
Yeni Rezervasyon
  → Müşteri + kişi sayısı + tarih/saat
  → find_available_tables() ile uygun masalar önerilir (kapasite + çakışmama)
  → Masa seç (veya sistem önerisini kabul et)
  → Kaydet
       ↓
  book_reservation() RPC
       ↓
  1. default_reservation_minutes / turnover_buffer_minutes'e göre ends_at hesapla
     (veya elle girilmişse onu kullan)
  2. EXCLUDE constraint (reservation_tables: table_id + during çakışması) — race-safe
  3. Çakışma varsa find_available_tables() tekrar çağrılır, alternatif önerilir
       ↓
  reservation + reservation_tables satırı yazılır (v1: her zaman 1 masa,
  şema çoklu masa/birleştirmeye hazır)
```
Masa birleştirme (2+ masa → 1 rezervasyon) ve masa haritası (x/y/rotation editörü) v1 kapsamı dışı ama şema hazır (§3.5).

---

## 10. Vapi → Smart Endpoint → Business Resolution Akışı

```
Vapi (webhook)
  → x-vapi-secret / Bearer / HMAC doğrulama  (§ implementasyon anında güncel Vapi
     dokümantasyonuna göre en güvenli yöntem seçilir; legacy shared-secret sadece fallback)
  → payload parse: assistantId, phoneNumberId, call.id, customer.number, toolCalls[]
  → business resolution (service-role client, RLS bypass — tek güvenilir server context):
       ai_agents.vapi_assistant_id = assistantId  → business_id_A
       phone_numbers.vapi_phone_number_id = phoneNumberId → business_id_B
       ikisi de varsa: business_id_A == business_id_B mi?
         HAYIR → fail closed, alarm/log, Vapi'ye güvenli fallback yanıt
         EVET  → business_id resolve edildi
  → calls tablosuna upsert (vapi_call_id UNIQUE — idempotent)
  → businesses.type'a göre tool set seçilir (beauty ↔ restaurant asla karışmaz)
  → her toolCall için: TOOL_HANDLERS[name](context, arguments)
       context = { businessId, businessType, callId, supabaseAdmin }  ← sabit, arguments
       içindeki hiçbir business_id/tenant alanı context'i override edemez
  → sonuç call_tool_invocations'a yazılır (idempotency_key = Vapi tool-call id,
     retry'larda duplicate create_customer/create_appointment/create_reservation önlenir)
  → destructive işlemler audit_logs'a source='vapi' ile de yazılır
  → Vapi'nin beklediği { results: [...] } formatına çevrilip dönülür
       (teknik DB hatası asla ham dönmez — kullanıcıya söylenebilir, kontrollü mesaj)
```

---

## 11. Vapi Tool Mimarisi

```
Beauty:      list_services, list_staff, check_availability, create_appointment,
             get_appointment, cancel_appointment, reschedule_appointment,
             get_salon_info, get_customer, create_customer, get_remaining_sessions

Restaurant:  check_table_availability, create_reservation, cancel_reservation,
             get_menu_info

Ortak:       get_customer, create_customer, get_salon_info
```
Tool isimleri implementasyon boyunca sabit tutulur (beauty→`create_appointment`, restaurant→`create_reservation` — karışmaz). Her handler yalnızca kendi `businessType`'ına route edilir; router seviyesinde restaurant tool'u beauty business context'ine asla ulaşamaz.

**Paylaşılan mutation primitive'leri** (§4.3'teki RPC'ler): web paneli ve Vapi handler'ları AYNI `book_appointment`/`cancel_appointment`/`book_reservation`/`cancel_reservation`/`consume_package_session` fonksiyonlarını (core+wrapper deseniyle) çağırır. İş kuralları (staff-service kısıtı, çalışma saati, paket uygunluğu, çakışma önleme) tek merkezde yaşar — telefon ve panel asla farklı davranmaz.

**Düzeltme (madde #6) — sadece mutasyonlar değil, ID ile sorgulayan tool'lar da kapsanır:** `get_appointment`, `get_remaining_sessions`, `get_customer` gibi salt-okunur ama bir ID parametresi alan her tool handler'ı da, döndürdüğü kaydın `business_id`'sinin Smart Endpoint'in resolve ettiği business_id ile eşleştiğini sorgu koşuluna (`WHERE id = $1 AND business_id = $resolved`) dahil ederek doğrular — asla "ID zaten yeterince spesifik" varsayımıyla sadece `WHERE id = $1` yazılmaz. Eşleşmezse "kayıt bulunamadı" dönülür (business B'nin ID alanı olduğunu ima etmemek için "yetkisiz" değil, "bulunamadı").

---

## 12. AI Provisioning (Agent + Phone Number Kurulumu) Akışı

```
Yetkili kullanıcı (ai.manage yetkisi) → "AI'ı Aktifleştir"
  → React → Edge Function (secrets: VAPI_API_KEY, sadece server-side)
  → Vapi API: assistant oluştur/güncelle
  → dönen assistant id → Supabase ai_agents.vapi_assistant_id
       (aynı akış phone number için phone_numbers.vapi_phone_number_id ile)
```
`VAPI_API_KEY` frontend'e asla ulaşmaz — sadece Edge Function secret'ı.

---

## 13. Call Lifecycle Akışı

```
call started → in_progress → [tool-call(ler)] → transcript updates → call ended
                                                                    → end-of-call report
```
`calls` tablosu bu lifecycle'ın tamamını (durum, süre, transcript/recording URL, cost) takip eder — sadece tool-call anı değil. AI'ın oluşturduğu her appointment/reservation `source='vapi'` + `call_id` ile ilişkilendirilir, panelden "Bu randevuyu hangi AI çağrısı oluşturdu?" sorusu doğrudan cevaplanabilir.

---

## 14. Billing / Usage Akışı

```
plans (included_ai_minutes) → subscriptions → usage_periods (period başına 523/750 gösterimi)
calls → usage_events (append-only, call_id UNIQUE ile dedupe) → trigger → usage_periods.minutes_used
```
`overage_rate_per_minute` / `overage_minutes` şemada hazır ama v1'de pasif — PSP (Stripe vb.) entegrasyon kararına kadar aktif edilmez.

---

## 15. Responsive / Mobile Stratejisi

- Sidebar: masaüstü sabit, mobil hamburger→drawer.
- **Randevu takvimi mobile-first**: masaüstü "personel sütunları + saat timeline"; mobil `Personel seç → Gün seç → Tek personel timeline` akışına indirgenir (küçültülmüş masaüstü görünümü DEĞİL, ayrı tasarım).
- Restaurant masa ekranı: grid/card görünüm, mobilde de tam kullanılabilir.
- Tüm CRUD ekranları (form, modal, tablo, calendar, filtre, navigasyon) mobilde ayrıca test edilir; tablolar mobilde horizontal-scroll veya stacked-card'a döner.
- Skeleton loading, toast, confirm dialog, empty-state — hepsi Türkçe metinlerle, tüm breakpoint'lerde.

---

## 16. Faz Bazlı Uygulama Checklist'i

**Phase 1 — Foundation + Auth + Multi-Tenant + RLS**
Supabase bağlantısı, extension'lar (`btree_gist`), helper fonksiyonlar (`is_super_admin`, `is_impersonating`, `is_business_member`, `has_permission`, `current_staff_id`), `businesses`/`profiles`/`business_members`/`roles`/`permissions`/`role_permissions` + RLS, `react-router-dom`, `AuthContext`/`BusinessContext`, responsive layout kabukları, login/register, landing page `src/marketing/`'e taşınır.

**Phase 2 — Super Admin**
Dashboard, işletmeler listesi/detayı, kullanıcılar, subscription/agent/phone/call/usage görünümleri (read-heavy), audit log ekranı, impersonation UI + banner.

**Phase 3 — Beauty Core**
`services`, `staff`, `staff_services`, `business_hours`, `special_hours`, `staff_working_hours`, `staff_time_off`, `customers` (normalize telefon), `appointments`+`appointment_services`, `book_appointment`/`cancel_appointment` RPC'leri, EXCLUDE constraint, calendar UI (gün/hafta/personel).

**Phase 4 — Vapi Core MVP**
`ai_agents`, `phone_numbers`, `smart-endpoint` (webhook auth, business resolution, fail-closed mismatch kontrolü), beauty tool handler'ları, `calls`/`call_tool_invocations`, provisioning akışı, çağrı geçmişi UI.

**Phase 5 — Customer Operations**
`packages`+`package_services`, `customer_packages`+`consume_package_session`, `payments`, `waitlist_entries`, customer history (tek ekranda randevu+iptal+no-show+paket+ödeme+AI çağrıları), reports (beauty metrikleri §11).

**Phase 6 — Restaurant**
`restaurant_tables`, `reservations`+`reservation_tables`, `find_available_tables`, `menu_categories`/`menu_items`, restaurant dashboard, restaurant Vapi tool handler'ları.

**Phase 7 — Billing**
`plans`/`subscriptions`/`usage_periods`/`usage_events`, kullanım barı (%80 uyarısı), overage şeması hazır ama pasif.

**Phase 8 — Production Hardening**
Seed/demo data (beauty + restaurant demo işletme, owner/manager/staff, hizmetler, müşteriler, randevular, paketler, masalar, rezervasyonlar, menü), test senaryoları (§17), mobile pass, index/performance pass, error/empty-state audit.

Her fazın sonunda tarayıcıda manuel doğrulama yapılır; backend-ağırlıklı fazlarda (1, 3, 4, 6) race-condition senaryoları özellikle test edilir.

---

## 17. Test Senaryoları (her ilgili faz sonunda)

- **Tenant test**: Business A kullanıcısı Business B'nin hiçbir verisini göremez/mutasyon yapamaz (RLS + RPC).
- **Staff permission test**: Yetkisiz Staff, doğrudan Supabase client/RPC ile bile mutasyon yapamaz.
- **Double booking (beauty)**: Aynı staff+overlapping slot için iki eşzamanlı istekten sadece biri başarılı.
- **Double booking (restaurant)**: Aynı masa+overlapping slot için iki eşzamanlı istekten sadece biri başarılı.
- **Package test**: Son seansı iki eşzamanlı işlem birden tüketemez.
- **Vapi tenant test**: Business A assistant/phone'undan gelen istek Business B verisine kesinlikle erişemez.
- **Vapi mismatch test**: Business A assistant + Business B phone kombinasyonu fail-closed olur.
- **Vapi retry/idempotency test**: Aynı webhook iki kez gelirse duplicate appointment/reservation/customer oluşmaz.

---

## Notlar

- Bu plan onaylandıktan sonra içeriği `README.md`'ye de yazılacak (kullanıcı talebi), ardından **sadece "Phase 1'e başla" denildiğinde** Phase 1 koduna başlanacak — plan onayı tek başına kodlamaya başlama izni sayılmaz.
- Açık kalan küçük ürün kararları (Manager'ın staff.manage/billing.manage alması mı almaması mı gibi zaten §5'te sabitlendi; paket süresi dolunca kalan seans politikası gibi ileri-faz konular) ilgili faza gelindiğinde netleştirilecek, plan onayını bloke etmiyor.
