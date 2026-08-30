-- Süper Admin panelindeki "kullanılan dakika" (BusinessDetailPage) ve genel
-- çağrı listesi (admin/CallsPage) müşteri/işletme panelinde doğru görünürken
-- süper adminde hep 0/boş geliyordu. Sebep: calls tablosunda Super Admin için
-- HİÇBİR select politikası yoktu (0015'te sadece is_business_member(business_id)
-- vardı) — süper admin bir business_member olmadığı için RLS sorguyu sessizce
-- boş döndürüyordu. README §4.1'deki tasarım zaten Super Admin'e salt-okunur
-- "oversight" erişimi öngörüyordu (mutasyon değil) — eksik olan tam olarak
-- buydu, şimdi ekleniyor. call_tool_invocations da aynı sebeple boş
-- görünüyordu (kendi politikası calls'a join ile is_business_member kontrol
-- ediyor, is_super_admin() hiç yoktu).

drop policy if exists calls_admin_oversight_select on calls;
create policy calls_admin_oversight_select on calls for select using (is_super_admin());

drop policy if exists call_tool_invocations_admin_oversight_select on call_tool_invocations;
create policy call_tool_invocations_admin_oversight_select on call_tool_invocations for select using (is_super_admin());
