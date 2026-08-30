-- Super Admin bir işletmeye aylık AI dakika kotası tanımlayabilsin, işletme
-- de kendi panelinden bu ay ne kadar kullandığını görebilsin. Kullanım,
-- ayrı bir usage_periods tablosu yerine calls.duration_seconds üzerinden
-- "bu takvim ayı" filtresiyle anlık hesaplanır (basit v1 — gerçek
-- fatura dönemi/rollover mantığı Faz 7'de).
-- null = sınırsız (varsayılan).

alter table ai_agents add column if not exists monthly_minute_limit int;
