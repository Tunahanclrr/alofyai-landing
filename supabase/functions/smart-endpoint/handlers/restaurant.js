import { resolveOrCreateCustomer, translateDbError } from './shared.js'
import { normalizeTrPhone } from '../../_shared/phone.js'
import { localToUtc, addMinutes, isValidDateStr, isValidTimeStr } from '../../_shared/time.js'

// Restaurant tool'ları BİLEREK "date" + "time" ayrı alanlar olarak tasarlandı
// (tek bir ISO 8601 timestamp DEĞİL) — bir sesli asistanın "yarın akşam
// 19:00" gibi bir ifadeden ayrı ayrı tarih/saat çıkarması güvenilir, ama
// kendi başına doğru timezone offset'li bir ISO string üretmesi (örn.
// "2026-08-29T19:00:00+03:00") hataya çok açık. Timezone dönüşümü HER ZAMAN
// burada, sunucu tarafında yapılır — LLM'den asla ISO timestamp istenmez.
async function getBusinessTimezone(ctx) {
  const { data } = await ctx.supabaseAdmin.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle()
  return data?.timezone || 'Europe/Istanbul'
}

async function estimateDurationAndBuffer(ctx, partySize) {
  const [{ data: settings }, { data: duration }] = await Promise.all([
    ctx.supabaseAdmin.from('restaurant_settings').select('reservation_buffer_minutes').eq('business_id', ctx.businessId).maybeSingle(),
    ctx.supabaseAdmin.rpc('get_default_duration', { p_business_id: ctx.businessId, p_party_size: partySize }),
  ])
  return {
    estimatedDuration: duration ?? 90,
    buffer: settings?.reservation_buffer_minutes ?? 15,
  }
}

// Müşterinin "cam kenarı" demesi, sistemde "window" etiketini aramalı — ama
// bu eşleştirmeyi LLM'in kendi tahminine bırakmıyoruz (yanlış/tutarsız
// olabilir), burada sabit bir sözlükle sunucu tarafında çözüyoruz. AI, tool'a
// müşterinin SÖYLEDİĞİ ham Türkçe ifadeyi gönderir (bkz. vapiTools.js).
const FEATURE_SYNONYMS = {
  window: ['cam kenarı', 'cam kenari', 'pencere kenarı', 'pencere kenari', 'pencerenin yanı', 'camın dibi', 'cam önü', 'cam kenarında'],
  terrace: ['teras', 'terasta', 'terasa'],
  outdoor: ['bahçe', 'bahçede', 'dışarı', 'dışarıda', 'açık hava', 'açık havada'],
  indoor: ['iç mekan', 'içeride', 'salon içi', 'kapalı alan'],
  quiet: ['sessiz', 'sakin'],
  bar: ['bar kenarı', 'bar'],
  booth: ['loca', 'kabin'],
  high_chair: ['bebek sandalyesi', 'çocuk sandalyesi', 'mama sandalyesi'],
  accessible: ['engelli erişimi', 'tekerlekli sandalye', 'engelli rampası'],
  smoking: ['sigara içilen', 'sigara alanı', 'sigara içilebilen'],
  non_smoking: ['sigara içilmeyen', 'sigarasız'],
  corner: ['köşe masa', 'köşe'],
}

function normalizeFeatureTags(rawList) {
  if (!rawList || rawList.length === 0) return []
  const tags = new Set()
  for (const raw of rawList) {
    const q = String(raw).toLowerCase().trim()
    if (FEATURE_SYNONYMS[q]) {
      tags.add(q)
      continue
    }
    for (const [tag, synonyms] of Object.entries(FEATURE_SYNONYMS)) {
      if (synonyms.some((s) => q.includes(s))) tags.add(tag)
    }
  }
  return [...tags]
}

// tercih edilen özellik yoksa find_available_tables'ın kendi sırasını
// (capacity ASC — gereksiz büyük masa israf edilmesin) korur; varsa en çok
// eşleşen masayı öne alır.
function pickBestTable(tables, featureTags) {
  if (!featureTags || featureTags.length === 0) return tables[0]
  const scored = tables
    .map((t) => ({ table: t, score: featureTags.filter((tag) => (t.features ?? []).includes(tag)).length }))
    .sort((a, b) => b.score - a.score)
  return scored[0].score > 0 ? scored[0].table : tables[0]
}

// Bir masanın, istenen randevu penceresinden SONRA başka aktif bir
// rezervasyonu var mı? AI'ın "bu masa 20:00'e kadar sizin, sonra başka
// rezervasyon var" gibi dürüst bilgi verebilmesi için (bkz. §3/§4/§8 —
// bir masanın rezervasyonu, restoranın o günkü tüm saatlerini kapatmaz,
// ama müşteriye de "tamamen boş" diye yanlış bilgi verilmemeli).
async function getNextReservation(ctx, tableId, afterIso) {
  const { data } = await ctx.supabaseAdmin
    .from('reservation_tables')
    .select('starts_at')
    .eq('table_id', tableId)
    .eq('is_active_hold', true)
    .gt('starts_at', afterIso)
    .order('starts_at')
    .limit(1)
    .maybeSingle()
  return data?.starts_at ?? null
}

export async function check_table_availability(ctx, args) {
  const { date, time } = args
  const partySize = Number(args.party_size)
  if (!isValidDateStr(date) || !isValidTimeStr(time)) {
    return { error: 'Tarih ya da saat bilgisini anlayamadım — date: YYYY-MM-DD, time: HH:MM formatında tekrar sorar mısınız?' }
  }
  if (!Number.isFinite(partySize) || partySize <= 0) {
    return { error: 'Kaç kişi olduğunuzu anlayamadım, tekrar söyler misiniz?' }
  }

  const timezone = await getBusinessTimezone(ctx)
  const startsAt = localToUtc(date, time, timezone)
  if (startsAt <= new Date()) return { available: false, note: 'Geçmiş bir saat için rezervasyon kontrol edilemez.' }

  const { estimatedDuration, buffer } = await estimateDurationAndBuffer(ctx, partySize)
  const endsAt = addMinutes(startsAt, estimatedDuration + buffer)
  const featureTags = normalizeFeatureTags(args.preferred_features)

  const { data: tables, error } = await ctx.supabaseAdmin.rpc('find_available_tables', {
    p_business_id: ctx.businessId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_party_size: partySize,
  })
  if (error) return { error: translateDbError(error.message) }

  let enriched = await Promise.all(
    (tables ?? []).map(async (t) => ({
      id: t.id,
      label: t.label,
      capacity: t.capacity,
      features: t.features ?? [],
      // Bu masa senin istediğin pencerede uygun, AMA hemen ardından başka
      // bir rezervasyonu varsa AI bunu müşteriye dürüstçe iletebilsin diye.
      next_reservation: await getNextReservation(ctx, t.id, endsAt.toISOString()),
    }))
  )

  if (featureTags.length > 0) {
    enriched = [...enriched].sort((a, b) => {
      const scoreA = featureTags.filter((f) => a.features.includes(f)).length
      const scoreB = featureTags.filter((f) => b.features.includes(f)).length
      return scoreB - scoreA
    })
  }

  return {
    available: enriched.length > 0,
    estimated_duration_minutes: estimatedDuration,
    tables: enriched,
  }
}

export async function create_reservation(ctx, args) {
  const { customer_phone, customer_name, date, time, notes, table_id } = args
  const partySize = Number(args.party_size)
  if (!customer_phone || !date || !time) {
    return { error: 'customer_phone, party_size, date ve time zorunlu.' }
  }
  if (!isValidDateStr(date) || !isValidTimeStr(time)) {
    return { error: 'Tarih ya da saat bilgisini anlayamadım — date: YYYY-MM-DD, time: HH:MM formatında tekrar sorar mısınız?' }
  }
  if (!Number.isFinite(partySize) || partySize <= 0) {
    return { error: 'Kaç kişi olduğunuzu anlayamadım, tekrar söyler misiniz?' }
  }

  const timezone = await getBusinessTimezone(ctx)
  const startsAt = localToUtc(date, time, timezone)
  if (startsAt <= new Date()) {
    return { error: 'Geçmiş bir saat için rezervasyon oluşturamam, lütfen ileri bir tarih/saat belirtin.' }
  }

  const customer = await resolveOrCreateCustomer(ctx, customer_phone, customer_name)
  if (customer.error) return customer

  const { estimatedDuration, buffer } = await estimateDurationAndBuffer(ctx, partySize)
  const endsAt = addMinutes(startsAt, estimatedDuration + buffer)

  const { data: tables, error: tablesError } = await ctx.supabaseAdmin.rpc('find_available_tables', {
    p_business_id: ctx.businessId,
    p_starts_at: startsAt.toISOString(),
    p_ends_at: endsAt.toISOString(),
    p_party_size: partySize,
  })
  if (tablesError) return { error: translateDbError(tablesError.message) }
  if (!tables || tables.length === 0) {
    return { error: 'Bu saatte uygun masa yok, lütfen başka bir saat önerin.' }
  }

  // AI, check_table_availability'den aldığı BELİRLİ bir table_id gönderdiyse
  // (müşteri "cam kenarındaki masa"yı seçtiyse) onu kullan — ama körü körüne
  // güvenme, o masa hâlâ gerçekten şu an uygun masalar arasında mı diye
  // doğrula (arada başka bir rezervasyon oluşmuş olabilir). Geçerli değilse
  // ya da hiç gönderilmediyse, tercih edilen özelliklere göre otomatik seç —
  // asla körü körüne "ilk masa" seçilmez.
  const featureTags = normalizeFeatureTags(args.preferred_features)
  let table = table_id ? tables.find((t) => t.id === table_id) : null
  if (!table) {
    table = pickBestTable(tables, featureTags)
  }
  // Müşteri bir tercih belirttiyse ama atanan masa onu karşılamıyorsa
  // (o an uygun tercihli masa yoktu), AI bunu şeffafça bilebilsin diye —
  // rezervasyonu ENGELLEMEZ (akış zaten check_table_availability'de
  // müşteriye onaylatılmış olmalı), sadece sonuçta işaretlenir.
  const preferenceMatched = featureTags.length === 0 || featureTags.some((f) => (table.features ?? []).includes(f))

  const { data: reservation, error } = await ctx.supabaseAdmin.rpc('_book_reservation_core', {
    p_business_id: ctx.businessId,
    p_customer_id: customer.id,
    p_table_id: table.id,
    p_party_size: partySize,
    p_starts_at: startsAt.toISOString(),
    p_estimated_duration: estimatedDuration,
    p_buffer_minutes: buffer,
    p_source: 'vapi',
    p_call_id: ctx.callId,
    p_notes: notes ?? null,
    p_table_preference: featureTags,
  })
  if (error) return { error: translateDbError(error.message) }
  return {
    success: true,
    reservation_id: reservation.id,
    table: table.label,
    table_features: table.features ?? [],
    preference_matched: preferenceMatched,
    starts_at: reservation.starts_at,
    party_size: reservation.party_size,
  }
}

// cancel_reservation'ın ihtiyaç duyduğu reservation_id'yi telefondaki müşteri
// asla ezbere bilemez — bu yüzden iptal/erteleme akışından ÖNCE mutlaka bu
// fonksiyon çağrılıp doğru kayıt bulunmalı (bkz. vapiTools.js açıklamaları +
// sistem promptu).
export async function find_reservations(ctx, args) {
  const { customer_phone } = args
  if (!customer_phone) return { error: 'customer_phone zorunlu.' }

  const normalized = normalizeTrPhone(customer_phone)
  if (!normalized) return { error: 'Geçerli bir telefon numarası gerekli.' }

  const { data: customer } = await ctx.supabaseAdmin
    .from('customers')
    .select('id')
    .eq('business_id', ctx.businessId)
    .eq('normalized_phone', normalized)
    .maybeSingle()
  if (!customer) return { reservations: [] }

  const { data } = await ctx.supabaseAdmin
    .from('reservations')
    .select('id, starts_at, party_size, status')
    .eq('business_id', ctx.businessId)
    .eq('customer_id', customer.id)
    .in('status', ['pending', 'confirmed', 'arrived', 'seated'])
    .order('starts_at')

  return {
    reservations: (data ?? []).map((r) => ({
      reservation_id: r.id,
      starts_at: r.starts_at,
      party_size: r.party_size,
      status: r.status,
    })),
  }
}

export async function cancel_reservation(ctx, args) {
  const { reservation_id, reason } = args
  if (!reservation_id) return { error: 'reservation_id zorunlu — önce find_reservations ile bulun.' }
  const { data, error } = await ctx.supabaseAdmin.rpc('_cancel_reservation_core', {
    p_reservation_id: reservation_id,
    p_business_id: ctx.businessId,
    p_reason: reason ?? 'Müşteri telefonla iptal etti (AI)',
  })
  if (error) return { error: translateDbError(error.message) }
  return { success: true, reservation_id: data.id, status: data.status }
}

export async function get_menu_info(ctx, args) {
  const { category, search } = args ?? {}
  const { data } = await ctx.supabaseAdmin
    .from('menu_items')
    .select('name, description, price, notes, allergens, menu_categories(name, notes)')
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)

  let items = data ?? []
  // "category" sadece kategori adına göre filtreler — bir ürün adı ("hamburger"
  // gibi) kategori olarak gönderilirse hiçbir sonuç bulunmaz ve yanlışlıkla
  // "böyle bir ürün yok" sonucuna varılır. Ürün adı araması "search" ile
  // AYRI ve İSİM/AÇIKLAMA üzerinden yapılır (bkz. vapiTools.js tool açıklaması).
  if (category) {
    items = items.filter((i) => i.menu_categories?.name?.toLowerCase().includes(category.toLowerCase()))
  }
  if (search) {
    const q = search.toLowerCase()
    items = items.filter((i) => i.name?.toLowerCase().includes(q) || i.description?.toLowerCase().includes(q))
  }

  return {
    items: items.map((i) => ({
      name: i.name,
      description: i.description,
      price: i.price,
      notes: i.notes ?? null,
      allergens: i.allergens?.length ? i.allergens : null,
      category: i.menu_categories?.name ?? null,
      category_notes: i.menu_categories?.notes ?? null,
    })),
  }
}
