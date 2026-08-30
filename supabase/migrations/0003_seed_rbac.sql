-- AlofyAI Phase 1 — seed global role templates + permission catalog + matrix
-- (README.md §5 RBAC Permission Matrisi)

insert into permissions (key, resource, action, description) values
  ('appointments.view_own', 'appointments', 'view_own', 'Kendi randevularını görüntüleme'),
  ('appointments.view_all', 'appointments', 'view_all', 'Tüm randevuları görüntüleme'),
  ('appointments.create', 'appointments', 'create', 'Randevu oluşturma'),
  ('appointments.update', 'appointments', 'update', 'Randevu güncelleme'),
  ('appointments.cancel', 'appointments', 'cancel', 'Kendi randevusunu iptal etme'),
  ('appointments.cancel_all', 'appointments', 'cancel_all', 'Tüm randevuları iptal etme'),
  ('customers.view', 'customers', 'view', 'Müşterileri görüntüleme'),
  ('customers.create', 'customers', 'create', 'Müşteri oluşturma'),
  ('customers.update', 'customers', 'update', 'Müşteri güncelleme'),
  ('services.manage', 'services', 'manage', 'Hizmetleri yönetme'),
  ('staff.manage', 'staff', 'manage', 'Personel ve ekip üyelerini yönetme'),
  ('packages.manage', 'packages', 'manage', 'Paket/seans yönetimi'),
  ('payments.manage', 'payments', 'manage', 'Ödeme kayıtlarını yönetme'),
  ('reports.view', 'reports', 'view', 'Raporları görüntüleme'),
  ('settings.manage', 'settings', 'manage', 'İşletme ayarlarını yönetme'),
  ('billing.manage', 'billing', 'manage', 'Abonelik/faturalandırma yönetimi'),
  ('ai.manage', 'ai', 'manage', 'AI agent/telefon numarası yönetimi');

insert into roles (business_id, key, name, is_system) values
  (null, 'owner', 'İşletme Sahibi', true),
  (null, 'manager', 'Yönetici', true),
  (null, 'staff', 'Personel', true);

-- owner: hepsi
insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p
where r.key = 'owner' and r.business_id is null;

-- manager: billing.manage ve staff.manage hariç hepsi
insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p
where r.key = 'manager' and r.business_id is null
  and p.key not in ('billing.manage', 'staff.manage', 'ai.manage');

-- staff: kendi randevusu + müşteri görüntüleme/oluşturma/güncelleme
insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p
where r.key = 'staff' and r.business_id is null
  and p.key in (
    'appointments.view_own', 'appointments.create', 'appointments.update', 'appointments.cancel',
    'customers.view', 'customers.create', 'customers.update'
  );
