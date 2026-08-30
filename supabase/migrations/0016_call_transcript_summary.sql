-- calls.transcript_url zaten vardı (bağlantı) ama tam metin transkript/özet
-- yoktu — işletme paneli çağrı detaylarını okunabilir göstermek için bunlara
-- ihtiyaç duyuyor. smart-endpoint end-of-call-report'tan geldiğinde doldurur.

alter table calls add column if not exists transcript text;
alter table calls add column if not exists summary text;
