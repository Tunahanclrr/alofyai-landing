-- Müşteri kaydında sadece isim + telefon yeterli olacak şekilde: telefon
-- artık zorunlu (normalized_phone zaten business_id ile benzersiz, migration 0006).

alter table customers alter column phone set not null;
