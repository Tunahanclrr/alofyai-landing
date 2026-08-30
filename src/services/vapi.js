import { supabase } from '../lib/supabaseClient'

export function listAgents() {
  return supabase.from('ai_agents').select('*, businesses(name, type)').order('created_at', { ascending: false })
}

export function listPhoneNumbers() {
  return supabase.from('phone_numbers').select('*, businesses(name, type), ai_agents(name)').order('created_at', { ascending: false })
}

export function getAgentForBusiness(businessId) {
  return supabase.from('ai_agents').select('*').eq('business_id', businessId).maybeSingle()
}

export function getPhoneNumberForBusiness(businessId) {
  return supabase.from('phone_numbers').select('*').eq('business_id', businessId).maybeSingle()
}

// ai_agents RLS'i zaten sadece is_super_admin() yazmaya izin veriyor
// (0015) — bu doğrudan bir update, ayrı bir Edge Function gerekmiyor.
export function setMonthlyMinuteLimit(agentId, minutes) {
  return supabase
    .from('ai_agents')
    .update({ monthly_minute_limit: minutes })
    .eq('id', agentId)
    .select()
    .single()
}

// usage_periods gibi ayrı bir dönem tablosu yok (v1) — "bu ay kullanılan
// dakika" calls.duration_seconds üzerinden takvim ayı başından itibaren
// anlık toplanır. Ölçek büyüdükçe Faz 7'de gerçek dönem/rollover mantığına
// taşınabilir.
export async function getMonthlyMinutesUsed(businessId) {
  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const { data, error } = await supabase
    .from('calls')
    .select('duration_seconds')
    .eq('business_id', businessId)
    .gte('created_at', monthStart.toISOString())

  if (error) return { data: null, error }
  const totalSeconds = (data ?? []).reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0)
  return { data: totalSeconds / 60, error: null }
}

export function listCalls(limit = 100) {
  return supabase
    .from('calls')
    .select('*, businesses(name), customers(full_name, phone)')
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function listCallsForBusiness(businessId, limit = 100) {
  return supabase
    .from('calls')
    .select('*, customers(full_name, phone)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function getCallToolInvocations(callId) {
  return supabase.from('call_tool_invocations').select('*').eq('call_id', callId).order('created_at')
}

const TOOL_LABELS = {
  get_current_datetime: 'Tarih/saat kontrolü',
  get_salon_info: 'İşletme bilgisi sorgulandı',
  get_customer: 'Müşteri arandı',
  create_customer: 'Yeni müşteri kaydedildi',
  check_table_availability: 'Masa müsaitliği kontrol edildi',
  create_reservation: 'Rezervasyon oluşturuldu',
  find_reservations: 'Rezervasyonlar arandı',
  cancel_reservation: 'Rezervasyon iptal edildi',
  get_menu_info: 'Menü bilgisi verildi',
  list_services: 'Hizmet listesi verildi',
  list_staff: 'Personel listesi verildi',
  check_availability: 'Randevu müsaitliği kontrol edildi',
  create_appointment: 'Randevu oluşturuldu',
  cancel_appointment: 'Randevu iptal edildi',
  reschedule_appointment: 'Randevu ertelendi',
}

// Vapi'nin call.endedReason değerleri — bilinen olanlar Türkçeye çevrilir,
// tanınmayan bir değer gelirse (Vapi yeni bir tane eklerse) hata vermeden
// kod okunaklı bir metne çevrilip (tire → boşluk, ilk harf büyük) gösterilir.
const END_REASON_LABELS = {
  'customer-ended-call': 'Müşteri görüşmeyi sonlandırdı',
  'assistant-ended-call': 'AI görüşmeyi sonlandırdı',
  'assistant-error': 'Teknik hata nedeniyle sonlandı',
  'assistant-not-found': 'Asistan bulunamadı',
  'silence-timed-out': 'Sessizlik nedeniyle sonlandı',
  'phone-call-provider-closed-websocket': 'Bağlantı koptu',
  voicemail: 'Sesli mesaja düştü',
  'exceeded-max-duration': 'Azami süre aşıldı',
  'manually-canceled': 'Manuel olarak iptal edildi',
  'pipeline-error': 'Teknik hata nedeniyle sonlandı',
}

export function formatEndReason(reason) {
  if (!reason) return '—'
  if (END_REASON_LABELS[reason]) return END_REASON_LABELS[reason]
  return reason
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function formatDateTr(iso) {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })
  } catch {
    return iso
  }
}

// call_tool_invocations.result ham JSON'dur — bu, ekranda (özellikle
// işletme panelinde) doğrudan gösterilecek bir şey değil. Bilinen her tool
// için kısa, Türkçe, okunabilir bir açıklamaya çevirir.
export function describeToolInvocation(inv) {
  const label = TOOL_LABELS[inv.tool_name] || inv.tool_name
  const r = inv.result ?? {}

  if (r.error) return { label, detail: r.error, tone: 'error' }

  switch (inv.tool_name) {
    case 'create_reservation':
      return { label, detail: `Masa ${r.table ?? '—'} · ${formatDateTr(r.starts_at)} · ${r.party_size ?? '—'} kişi`, tone: 'success' }
    case 'cancel_reservation':
      return { label, detail: 'Rezervasyon iptal edildi', tone: 'success' }
    case 'create_appointment':
      return { label, detail: formatDateTr(r.starts_at), tone: 'success' }
    case 'reschedule_appointment':
      return { label, detail: `Yeni saat: ${formatDateTr(r.starts_at)}`, tone: 'success' }
    case 'cancel_appointment':
      return { label, detail: 'Randevu iptal edildi', tone: 'success' }
    case 'check_table_availability':
      return { label, detail: r.available ? 'Uygun masa bulundu' : 'Uygun masa yok', tone: r.available ? 'success' : 'neutral' }
    case 'check_availability':
      return { label, detail: `${r.available_slots?.length ?? 0} uygun seçenek bulundu`, tone: 'neutral' }
    case 'find_reservations':
      return { label, detail: `${r.reservations?.length ?? 0} rezervasyon bulundu`, tone: 'neutral' }
    case 'get_customer':
      return { label, detail: r.found ? `${r.customer?.full_name ?? 'Müşteri'} bulundu` : 'Kayıt bulunamadı', tone: 'neutral' }
    case 'create_customer':
      return { label, detail: r.full_name ?? '', tone: 'success' }
    case 'get_menu_info': {
      // Belirli bir ürün adı arandıysa ("hamburger" gibi) ve tek sonuç
      // bulunduysa, bunu genel menü paylaşımından ayırıp fiyatıyla göster —
      // "Ürün fiyatı bilgisi verildi: Hamburger — 180 TL" gibi.
      if (inv.arguments?.search && r.items?.length === 1) {
        const item = r.items[0]
        return {
          label: 'Ürün fiyatı bilgisi verildi',
          detail: `${item.name}${item.price != null ? ` — ${item.price} TL` : ''}`,
          tone: 'success',
        }
      }
      return { label, detail: `${r.items?.length ?? 0} ürün paylaşıldı`, tone: 'neutral' }
    }
    case 'list_services':
      return { label, detail: `${r.services?.length ?? 0} hizmet listelendi`, tone: 'neutral' }
    case 'list_staff':
      return { label, detail: `${r.staff?.length ?? 0} personel listelendi`, tone: 'neutral' }
    default:
      return { label, detail: '', tone: 'neutral' }
  }
}

async function invokeProvision(body) {
  const { data, error } = await supabase.functions.invoke('vapi-provision', { body })
  if (error) {
    let detail = error.message
    try {
      const parsed = await error.context?.json?.()
      if (parsed?.detail) detail = typeof parsed.detail === 'string' ? parsed.detail : JSON.stringify(parsed.detail)
    } catch {
      // ham gövde okunamadıysa generic mesaj kalır
    }
    return { data: null, error: { message: detail } }
  }
  return { data, error: null }
}

export function createAssistant(businessId, { regeneratePrompt } = {}) {
  return invokeProvision({ action: 'create_assistant', business_id: businessId, regenerate_prompt: regeneratePrompt || undefined })
}

export function updateAgentPrompt(businessId, systemPrompt) {
  return invokeProvision({ action: 'update_prompt', business_id: businessId, system_prompt: systemPrompt })
}

export function linkPhoneNumber(businessId, { vapiPhoneNumberId }) {
  return invokeProvision({
    action: 'link_phone_number',
    business_id: businessId,
    vapi_phone_number_id: vapiPhoneNumberId || undefined,
  })
}
