-- calls.customer_id (var olan FK) sadece bir customers kaydı gerçekten
-- eşleşince/oluşunca dolar (tool çağrısı sırasında). Ama arayanın numarası
-- Vapi'den çağrı başlar başlamaz gelir — customer_id henüz yokken bile
-- "Telefon" alanını gösterebilmek için ham numarayı ayrıca tutuyoruz.
-- Bu customer_id'nin YERİNE değil, ONA EK bir bilgi (customers tablosuyla
-- duplicate değil — customers kaydı hiç oluşmayabilir, örn. sadece menü
-- sorup kapatan bir arayan için).

alter table calls add column if not exists caller_number text;
