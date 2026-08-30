// Vapi Custom Tool şemaları — business tipine göre assistant'a hangi
// fonksiyonların tanıtılacağını belirler. Tool isimleri SABİTTİR
// (README §11) — smart-endpoint'teki TOOL_HANDLERS anahtarlarıyla birebir
// eşleşmeli. Şemalar burada TEK YERDE tanımlanır; hem provisioning (Vapi'ye
// gönderilen tool tanımı) hem de smart-endpoint'in kendi doğrulaması bunu
// referans alır.
//
// Her tool'un KENDİ start (çağrı başlar başlamaz, deterministik) ve delayed
// (2,5 saniyeyi geçerse) mesajı var — tek bir jenerik cümle DEĞİL. Bu iki
// mesaj da Vapi'nin platform seviyesindeki tool message mekanizmasından
// gelir (bkz. vapi-provision/toolPayload); LLM'e ARTIK kendi başına bir
// geçiş cümlesi kurması söylenmiyor — aksi halde LLM'in kendi cümlesiyle
// buradaki start mesajı üst üste binip çift dolgu oluşturur.

const SHARED_TOOLS = [
  {
    name: 'get_current_datetime',
    description:
      "Şu anki tarihi, saati ve haftanın gününü (işletmenin saat dilimine göre) döner. Müşteri 'yarın', 'bu akşam', 'önümüzdeki cumartesi' gibi göreli bir tarih ifadesi kullandığında, doğru tarihi hesaplamadan ÖNCE mutlaka bu fonksiyonu çağır — bugünün tarihini tahmin etme.",
    parameters: { type: 'object', properties: {}, required: [] },
    startMessage: 'Bir saniye.',
    delayedMessage: 'Tarihi kontrol ediyorum, bir saniye.',
  },
  {
    name: 'get_salon_info',
    description: "İşletmenin adı, adresi, çalışma saatleri gibi genel bilgilerini döner.",
    parameters: { type: 'object', properties: {}, required: [] },
    startMessage: 'Tabii, hemen bakıyorum.',
    delayedMessage: 'Bilgileri kontrol ediyorum, bir saniye.',
  },
  {
    name: 'get_customer',
    description: 'Telefon numarasına göre müşteri kaydını arar.',
    parameters: {
      type: 'object',
      properties: { phone: { type: 'string', description: 'Müşterinin telefon numarası' } },
      required: ['phone'],
    },
    startMessage: 'Kayıtlarınıza bakıyorum.',
    delayedMessage: 'Kayıtlarınızı kontrol ediyorum, bir saniye.',
  },
  {
    name: 'create_customer',
    description: 'Sistemde kaydı olmayan yeni bir müşteri oluşturur.',
    parameters: {
      type: 'object',
      properties: {
        full_name: { type: 'string' },
        phone: { type: 'string' },
      },
      required: ['full_name', 'phone'],
    },
    startMessage: 'Sizi kaydediyorum.',
    delayedMessage: 'Kaydınızı oluşturuyorum, bir saniye.',
  },
]

const BEAUTY_TOOLS = [
  {
    name: 'list_services',
    description: 'İşletmenin sunduğu hizmetleri ve fiyatlarını listeler.',
    parameters: { type: 'object', properties: {}, required: [] },
    startMessage: 'Tabii, hizmetlerimizi listeliyorum.',
    delayedMessage: 'Hizmetleri kontrol ediyorum, bir saniye.',
  },
  {
    name: 'list_staff',
    description: 'Aktif personel listesini döner.',
    parameters: { type: 'object', properties: {}, required: [] },
    startMessage: 'Personelimize bakıyorum.',
    delayedMessage: 'Personel listesini kontrol ediyorum, bir saniye.',
  },
  {
    name: 'check_availability',
    description: 'Belirli bir hizmet ve tarih için müsait personel/saatleri döner.',
    parameters: {
      type: 'object',
      properties: {
        service_id: { type: 'string' },
        date: { type: 'string', description: 'YYYY-MM-DD formatında tarih' },
        staff_id: { type: 'string', description: 'Opsiyonel — belirli bir personel tercih ediliyorsa' },
      },
      required: ['service_id', 'date'],
    },
    startMessage: 'Tabii, uygun saatleri kontrol ediyorum.',
    delayedMessage: 'Uygun saatleri kontrol ediyorum, bir saniye.',
  },
  {
    name: 'create_appointment',
    description: 'Müşteri için yeni bir randevu oluşturur.',
    parameters: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string' },
        customer_name: { type: 'string', description: 'Müşteri kayıtlı değilse kullanılır' },
        service_id: { type: 'string' },
        staff_id: { type: 'string' },
        starts_at: { type: 'string', description: 'ISO 8601 tarih-saat' },
      },
      required: ['customer_phone', 'service_id', 'staff_id', 'starts_at'],
    },
    startMessage: 'Harika, randevunuzu oluşturuyorum.',
    delayedMessage: 'Randevunuzu kaydediyorum, bir saniye.',
  },
  {
    name: 'cancel_appointment',
    description: 'Var olan bir randevuyu iptal eder.',
    parameters: {
      type: 'object',
      properties: { appointment_id: { type: 'string' }, reason: { type: 'string' } },
      required: ['appointment_id'],
    },
    startMessage: 'Tabii, randevunuzu kontrol ediyorum.',
    delayedMessage: 'İptal işlemini tamamlıyorum, bir saniye.',
  },
  {
    name: 'reschedule_appointment',
    description: 'Var olan bir randevuyu yeni bir tarihe taşır.',
    parameters: {
      type: 'object',
      properties: { appointment_id: { type: 'string' }, new_starts_at: { type: 'string' } },
      required: ['appointment_id', 'new_starts_at'],
    },
    startMessage: 'Tabii, randevunuzu güncelliyorum.',
    delayedMessage: 'Randevunuzu güncelliyorum, bir saniye.',
  },
]

const RESTAURANT_TOOLS = [
  {
    name: 'check_table_availability',
    description:
      "Belirli tarih/saat ve kişi sayısı için uygun masaları kontrol eder. Sadece 'var/yok' döndürmez — her uygun masanın kapasitesini, özelliklerini (features) ve varsa hemen ardından gelen bir sonraki rezervasyonunu (next_reservation) da döndürür. create_reservation çağrılmadan ÖNCE her zaman bu fonksiyon ile müsaitlik doğrulanmalı.",
    parameters: {
      type: 'object',
      properties: {
        date: { type: 'string', description: 'Rezervasyon tarihi, YYYY-MM-DD formatında (örn: 2026-08-29)' },
        time: { type: 'string', description: "Rezervasyon saati, 24 saatlik HH:MM formatında (örn: 19:00). Asla ISO 8601 timestamp gönderme, sadece saat." },
        party_size: { type: 'number', description: 'Kişi sayısı' },
        preferred_features: {
          type: 'array',
          items: { type: 'string' },
          description:
            "Opsiyonel — müşterinin masa tercihi belirttiği HAM ifade (örn. müşteri 'cam kenarı' dediyse [\"cam kenarı\"], 'terasta' dediyse [\"terasta\"]). Kendi başına İngilizce bir etikete çevirmeye ÇALIŞMA, müşterinin kelimelerini olduğu gibi gönder — eşleştirmeyi sistem yapar.",
        },
      },
      required: ['date', 'time', 'party_size'],
    },
    startMessage: 'Tabii, uygun masaları kontrol ediyorum.',
    delayedMessage: 'Uygun masaları kontrol ediyorum, bir saniye.',
  },
  {
    name: 'create_reservation',
    description:
      'Müşteri için yeni bir masa rezervasyonu oluşturur. Sadece check_table_availability ile müsaitlik onaylandıktan ve müşteriye tarih/saat/kişi sayısı özetlenip onay alındıktan SONRA çağır.',
    parameters: {
      type: 'object',
      properties: {
        customer_phone: { type: 'string', description: 'Arayan müşterinin telefon numarası' },
        customer_name: { type: 'string', description: 'Müşteri sistemde kayıtlı değilse zorunlu, kayıtlıysa opsiyonel' },
        party_size: { type: 'number', description: 'Kişi sayısı' },
        date: { type: 'string', description: 'YYYY-MM-DD formatında tarih (check_table_availability ile aynı değer)' },
        time: { type: 'string', description: 'HH:MM formatında saat (check_table_availability ile aynı değer). Asla ISO 8601 timestamp gönderme.' },
        table_id: {
          type: 'string',
          description:
            "Opsiyonel — müşteri check_table_availability sonucundan BELİRLİ bir masayı seçtiyse o masanın id'si (örn. cam kenarındaki masayı istedi ve sen ona uygun masayı buldun). Müşterinin belirli bir masa tercihi yoksa boş bırak, sistem otomatik en uygun masayı seçer.",
        },
        preferred_features: {
          type: 'array',
          items: { type: 'string' },
          description: "Opsiyonel — table_id verilmediyse, müşterinin söylediği ham tercih ifadeleri buraya (check_table_availability ile aynı mantıkta).",
        },
        notes: {
          type: 'string',
          description:
            "Opsiyonel özel not — SADECE sistemde yapılandırılmış bir masa özelliği OLMAYAN istekler için (örn. 'doğum günü kutlaması', 'çiçek getirecek'). Cam kenarı/teras gibi masa özelliği olan istekleri buraya değil preferred_features'a yaz.",
        },
      },
      required: ['customer_phone', 'party_size', 'date', 'time'],
    },
    startMessage: 'Harika, rezervasyonunuzu oluşturuyorum.',
    delayedMessage: 'Rezervasyonunuzu sisteme kaydediyorum, bir saniye.',
  },
  {
    name: 'find_reservations',
    description:
      "Müşterinin telefon numarasına göre yaklaşan (iptal edilmemiş) rezervasyonlarını bulur. Müşteri rezervasyon ID'sini bilemeyeceği için, cancel_reservation çağrılmadan ÖNCE mutlaka bu fonksiyon ile doğru reservation_id bulunmalı.",
    parameters: {
      type: 'object',
      properties: { customer_phone: { type: 'string' } },
      required: ['customer_phone'],
    },
    startMessage: 'Rezervasyonlarınıza bakıyorum.',
    delayedMessage: 'Rezervasyon kaydınızı kontrol ediyorum, bir saniye.',
  },
  {
    name: 'cancel_reservation',
    description: "Var olan bir rezervasyonu iptal eder. reservation_id her zaman önce find_reservations'tan alınmalı, müşteriden istenmemeli.",
    parameters: {
      type: 'object',
      properties: {
        reservation_id: { type: 'string', description: 'find_reservations sonucundan alınan reservation_id' },
        reason: { type: 'string' },
      },
      required: ['reservation_id'],
    },
    startMessage: 'Tabii, rezervasyonunuzu kontrol ediyorum.',
    delayedMessage: 'İptal işlemini tamamlıyorum, bir saniye.',
  },
  {
    name: 'get_menu_info',
    description:
      "Menüdeki kategorileri ve ürünleri (fiyat, açıklama, alerjen bilgisi ve varsa özel notlarıyla) döner. Müşteri belirli bir ürünün adını/fiyatını sorarsa (örn. 'hamburgerınız var mı', 'pizza ne kadar') MUTLAKA \"search\" alanına o ürün adını yaz — sadece \"category\" ile arama yapma, ürün adları kategori adı değildir ve bulunamaz. Kategoriye göre TÜM listeyi görmek isterse \"category\" kullan. İkisi de boşsa menünün TAMAMI döner. Alerjen/içerik sorularında (örn. 'bu vegan mı') fonksiyonun döndürdüğü allergens/notes alanlarını kullan, bilgi yoksa uydurma.",
    parameters: {
      type: 'object',
      properties: {
        category: { type: 'string', description: "Opsiyonel — belirli bir MENÜ KATEGORİSİ ile filtrelemek için (örn. 'İçecekler', 'Ana Yemekler')." },
        search: { type: 'string', description: "Opsiyonel — belirli bir ÜRÜN ADI içinde arama yapmak için (örn. müşteri 'hamburgeriniz var mı' derse search: 'hamburger')." },
      },
      required: [],
    },
    startMessage: 'Tabii, menüde hemen kontrol ediyorum.',
    delayedMessage: 'Menü bilgisini kontrol ediyorum, bir saniye.',
  },
]

export function toolsForBusinessType(businessType) {
  const specific = businessType === 'restaurant' ? RESTAURANT_TOOLS : BEAUTY_TOOLS
  return [...SHARED_TOOLS, ...specific]
}
