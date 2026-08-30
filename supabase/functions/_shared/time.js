// Türkiye 2016'dan beri yaz saati uygulamıyor — Europe/Istanbul yıl boyu
// sabit UTC+3. Bu basitleştirme SADECE Vapi handler'larındaki slot/müsaitlik
// hesaplarında kullanılır (performans + Deno'da harici bir tz kütüphanesi
// gerektirmemek için); DB tarafındaki end_of_business_day() gerçek Postgres
// tz veritabanını kullanır ve tek gerçek kaynak odur — buradaki hesap sadece
// Vapi'ye "şu saatler uygun" önerisi sunmak içindir, nihai doğrulama her
// zaman ilgili RPC'nin (constraint'ler dahil) kendisinde yapılır.
const FIXED_OFFSETS_MIN = { 'Europe/Istanbul': 180 }

export function offsetMinutesFor(timezone) {
  return FIXED_OFFSETS_MIN[timezone] ?? 0
}

// "YYYY-MM-DD" + "HH:MM" (işletmenin yerel saati) -> UTC Date
export function localToUtc(dateStr, timeStr, timezone) {
  const [y, m, d] = dateStr.split('-').map(Number)
  const [hh, mm] = timeStr.split(':').map(Number)
  const offset = offsetMinutesFor(timezone)
  return new Date(Date.UTC(y, m - 1, d, hh, mm) - offset * 60000)
}

export function utcToLocalParts(date, timezone) {
  const offset = offsetMinutesFor(timezone)
  const local = new Date(date.getTime() + offset * 60000)
  return {
    date: local.toISOString().slice(0, 10),
    time: local.toISOString().slice(11, 16),
    dayOfWeek: local.getUTCDay(),
  }
}

export function addMinutes(date, minutes) {
  return new Date(date.getTime() + minutes * 60000)
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const TIME_RE = /^\d{1,2}:\d{2}(:\d{2})?$/

// Vapi'nin fonksiyon çağrısındaki date/time argümanları bir LLM tarafından
// üretiliyor — biçim küçük sapmalar gösterebilir (ör. saniyeli saat). Sıkı
// ama okunabilir bir doğrulama: yanlış biçimde sessizce Invalid Date/NaN
// üretmek yerine burada erkenden yakalanır, çağıran taraf kullanıcıya
// anlaşılır bir mesajla geri dönebilir.
export function isValidDateStr(s) {
  return typeof s === 'string' && DATE_RE.test(s)
}

export function isValidTimeStr(s) {
  return typeof s === 'string' && TIME_RE.test(s)
}
