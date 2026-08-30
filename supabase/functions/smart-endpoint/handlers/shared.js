import { normalizeTrPhone } from '../../_shared/phone.js'
import { utcToLocalParts } from '../../_shared/time.js'

const DAY_NAMES_TR = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']

// Postgres RPC'lerinin çoğu 'kod: türkçe açıklama' formatında exception atar
// (bkz. 0006/0011 migration'ları) — kod önekini atıp müşteriye/AI'a okunabilir
// kısmı döneriz. Tanımadığımız hatalarda (örn. ham constraint mesajları)
// güvenli, genel bir mesaj döneriz — teknik detay asla çağırana sızmaz.
export function translateDbError(message) {
  if (!message) return 'Beklenmeyen bir hata oluştu.'
  const firstColon = message.indexOf(': ')
  if (firstColon > 0 && /^[a-z_]+$/.test(message.slice(0, firstColon))) {
    return message.slice(firstColon + 2)
  }
  if (/exclu|overlap|conflict|duplicate/i.test(message)) {
    return 'Bu saat artık müsait değil, lütfen başka bir saat deneyin.'
  }
  return 'İşlem gerçekleştirilemedi, lütfen tekrar deneyin.'
}

// Bu çağrının calls satırını bulunan/oluşturulan müşteriyle ilişkilendirir
// (henüz bağlı değilse) — çağrı detaylarında "Müşteri" alanının boş
// görünmemesi için tek merkezi yer burası.
async function linkCallToCustomer(ctx, customerId) {
  if (!ctx.callId || !customerId) return
  await ctx.supabaseAdmin.from('calls').update({ customer_id: customerId }).eq('id', ctx.callId).is('customer_id', null)
}

// Telefonla arayan kişiyi mevcut müşteri kaydıyla eşleştirir, yoksa (isim
// verilmişse) yeni kayıt açar. Hem beauty hem restaurant handler'ları bunu
// kullanır — tek merkezde yaşar ki iki modül farklı davranmasın.
export async function resolveOrCreateCustomer(ctx, phone, name) {
  const normalized = normalizeTrPhone(phone)
  if (!normalized) return { error: 'Geçerli bir telefon numarası gerekli.' }

  const { data: existing } = await ctx.supabaseAdmin
    .from('customers')
    .select('id, full_name')
    .eq('business_id', ctx.businessId)
    .eq('normalized_phone', normalized)
    .maybeSingle()
  if (existing) {
    await linkCallToCustomer(ctx, existing.id)
    return { id: existing.id, full_name: existing.full_name }
  }

  if (!name) {
    return { error: 'Bu numarayla kayıtlı bir müşteri bulamadım. Yeni kayıt açmam için isminizi alabilir miyim?' }
  }

  const { data: created, error } = await ctx.supabaseAdmin
    .from('customers')
    .insert({ business_id: ctx.businessId, full_name: name, phone })
    .select('id, full_name')
    .single()
  if (error) return { error: translateDbError(error.message) }
  await linkCallToCustomer(ctx, created.id)
  return { id: created.id, full_name: created.full_name }
}

export async function get_current_datetime(ctx) {
  const { data: business } = await ctx.supabaseAdmin.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle()
  const timezone = business?.timezone || 'Europe/Istanbul'
  const { date, time, dayOfWeek } = utcToLocalParts(new Date(), timezone)
  return { date, time, day_of_week: DAY_NAMES_TR[dayOfWeek], timezone }
}

export async function get_salon_info(ctx) {
  const { data: business } = await ctx.supabaseAdmin
    .from('businesses')
    .select('name, type, settings')
    .eq('id', ctx.businessId)
    .maybeSingle()

  const { data: hours } = await ctx.supabaseAdmin
    .from('business_hours')
    .select('day_of_week, opens_at, closes_at, is_closed')
    .eq('business_id', ctx.businessId)
    .order('day_of_week')

  return {
    name: business?.name ?? null,
    type: business?.type === 'restaurant' ? 'restoran' : 'güzellik salonu / kuaför',
    address: business?.settings?.address ?? null,
    working_hours: (hours ?? []).map((h) => ({
      day_of_week: h.day_of_week,
      closed: h.is_closed,
      opens_at: h.is_closed ? null : h.opens_at,
      closes_at: h.is_closed ? null : h.closes_at,
    })),
  }
}

export async function get_customer(ctx, args) {
  const { phone } = args
  if (!phone) return { error: 'phone zorunlu.' }
  const normalized = normalizeTrPhone(phone)
  const { data } = await ctx.supabaseAdmin
    .from('customers')
    .select('id, full_name, phone, total_visits, last_visit_at')
    .eq('business_id', ctx.businessId)
    .eq('normalized_phone', normalized)
    .maybeSingle()
  if (!data) return { found: false }
  await linkCallToCustomer(ctx, data.id)
  return { found: true, customer: data }
}

export async function create_customer(ctx, args) {
  const { full_name, phone } = args
  if (!full_name || !phone) return { error: 'full_name ve phone zorunlu.' }
  const result = await resolveOrCreateCustomer(ctx, phone, full_name)
  if (result.error) return result
  return { success: true, customer_id: result.id, full_name: result.full_name }
}
