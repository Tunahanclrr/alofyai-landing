import { createSupabaseAdmin, jsonResponse } from '../_shared/supabaseAdmin.js'
import { corsHeaders } from '../_shared/cors.js'
import * as shared from './handlers/shared.js'
import * as beauty from './handlers/beauty.js'
import * as restaurant from './handlers/restaurant.js'

// TEK webhook — TÜM işletmeler buraya düşer. business_id HİÇBİR ZAMAN Vapi
// payload'undaki bir alandan (arguments içindeki olası bir business_id dahil)
// güvenilmez; sadece assistantId/phoneNumberId üzerinden ai_agents/phone_numbers
// tablolarından server-side resolve edilir (bkz. README §10, §11 madde #6).

const BEAUTY_HANDLERS = {
  get_current_datetime: shared.get_current_datetime,
  get_salon_info: shared.get_salon_info,
  get_customer: shared.get_customer,
  create_customer: shared.create_customer,
  list_services: beauty.list_services,
  list_staff: beauty.list_staff,
  check_availability: beauty.check_availability,
  create_appointment: beauty.create_appointment,
  cancel_appointment: beauty.cancel_appointment,
  reschedule_appointment: beauty.reschedule_appointment,
}

const RESTAURANT_HANDLERS = {
  get_current_datetime: shared.get_current_datetime,
  get_salon_info: shared.get_salon_info,
  get_customer: shared.get_customer,
  create_customer: shared.create_customer,
  check_table_availability: restaurant.check_table_availability,
  create_reservation: restaurant.create_reservation,
  find_reservations: restaurant.find_reservations,
  cancel_reservation: restaurant.cancel_reservation,
  get_menu_info: restaurant.get_menu_info,
}

// assistantId VE phoneNumberId ikisi de gelirse birbirini doğrulamalı —
// uyuşmazsa fail-closed (madde: "Vapi mismatch test").
async function resolveBusinessId(admin, message) {
  const assistantId = message?.call?.assistantId ?? message?.assistant?.id ?? null
  const phoneNumberId = message?.call?.phoneNumberId ?? message?.phoneNumber?.id ?? null

  let businessIdFromAgent = null
  let businessIdFromPhone = null

  if (assistantId) {
    const { data } = await admin.from('ai_agents').select('business_id').eq('vapi_assistant_id', assistantId).maybeSingle()
    businessIdFromAgent = data?.business_id ?? null
  }
  if (phoneNumberId) {
    const { data } = await admin.from('phone_numbers').select('business_id').eq('vapi_phone_number_id', phoneNumberId).maybeSingle()
    businessIdFromPhone = data?.business_id ?? null
  }

  if (businessIdFromAgent && businessIdFromPhone && businessIdFromAgent !== businessIdFromPhone) {
    return { error: 'business_mismatch' }
  }
  const businessId = businessIdFromAgent ?? businessIdFromPhone
  if (!businessId) return { error: 'business_not_resolved' }

  const { data: business } = await admin.from('businesses').select('id, type').eq('id', businessId).maybeSingle()
  if (!business) return { error: 'business_not_resolved' }

  return { businessId: business.id, businessType: business.type }
}

function stringifyResult(payload) {
  return typeof payload === 'string' ? payload : JSON.stringify(payload)
}

function safeParseJson(text) {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const expectedSecret = Deno.env.get('VAPI_SERVER_SECRET')
  const providedSecret = req.headers.get('x-vapi-secret')
  if (!expectedSecret || providedSecret !== expectedSecret) {
    return jsonResponse({ error: 'unauthorized' }, 401)
  }

  let body
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const message = body?.message
  const messageType = message?.type

  // Transcript/speech-update gibi yüksek frekanslı event'lerde DB'ye hiç
  // dokunmadan hemen ack dönüyoruz — sadece lifecycle + tool-call'lar işlenir.
  if (!['status-update', 'tool-calls', 'end-of-call-report'].includes(messageType)) {
    return jsonResponse({ received: true })
  }

  const admin = createSupabaseAdmin()
  const resolution = await resolveBusinessId(admin, message)
  if (resolution.error) {
    console.error('smart-endpoint: business resolution failed', resolution.error, message?.call?.id)
    if (messageType === 'tool-calls') {
      const calls = message.toolCallList ?? message.toolCalls ?? []
      return jsonResponse({
        results: calls.map((c) => ({ toolCallId: c.id, result: 'Sistem bu işletmeyi tanımlayamadı, lütfen tekrar arayın.' })),
      })
    }
    return jsonResponse({ received: true })
  }

  const { businessId, businessType } = resolution
  const vapiCallId = message?.call?.id
  let callRowId = null
  let callStartedAt = null
  let callCreatedAt = null

  if (vapiCallId) {
    // message?.customer?.number: Vapi'nin arayan kimliği (caller ID) —
    // customer_id'nin aksine (bir customers kaydı gerektirir, tool çağrısı
    // sırasında dolar) bu, çağrı başlar başlamaz elimizde olur.
    const callerNumber = message?.customer?.number ?? message?.call?.customer?.number ?? null
    const { data: callRow } = await admin
      .from('calls')
      .upsert(
        {
          business_id: businessId,
          vapi_call_id: vapiCallId,
          direction: message?.call?.type === 'outboundPhoneCall' ? 'outbound' : 'inbound',
          status: messageType === 'end-of-call-report' ? 'ended' : 'in_progress',
          started_at: message?.call?.startedAt ?? undefined,
          caller_number: callerNumber ?? undefined,
        },
        { onConflict: 'vapi_call_id' }
      )
      .select('id, started_at, created_at')
      .single()
    callRowId = callRow?.id ?? null
    callStartedAt = callRow?.started_at ?? null
    callCreatedAt = callRow?.created_at ?? null
  }

  if (messageType === 'end-of-call-report') {
    // Vapi'nin gerçek webhook payload'ında süre/bitiş bilgisinin tam olarak
    // hangi alanda geldiğini doğrulamak için (tahmine dayalı alan adları
    // yanlışsa fark edilsin diye) ham mesajı logluyoruz — "supabase functions
    // logs smart-endpoint" ile görülebilir.
    console.log('smart-endpoint: end-of-call-report', JSON.stringify(message))

    if (callRowId) {
      const endedAt = message?.call?.endedAt ?? new Date().toISOString()
      // Vapi'nin süreyi hangi tam alanda gönderdiği API versiyonuna göre
      // değişebilir — birkaç olası yolu dener. Hiçbiri yoksa (veya 0/negatif
      // gibi anlamsızsa) started_at/ended_at farkından KENDİMİZ hesaplarız.
      // started_at Vapi'den hiç gelmemiş olabilir (yanlış alan adı ihtimaline
      // karşı) — o durumda bu satırın Postgres'te oluşturulma anını (ilk
      // webhook'a çok yakın bir zaman) ikinci bir referans olarak kullanırız,
      // böylece süre hiçbir zaman tamamen boş kalmaz.
      const reportedDuration = message?.durationSeconds ?? message?.call?.durationSeconds ?? message?.duration ?? null
      let durationSeconds = typeof reportedDuration === 'number' && reportedDuration > 0 ? Math.round(reportedDuration) : null
      const startReference = callStartedAt ?? callCreatedAt
      if (durationSeconds === null && startReference) {
        const computed = (new Date(endedAt).getTime() - new Date(startReference).getTime()) / 1000
        if (Number.isFinite(computed) && computed >= 0) durationSeconds = Math.round(computed)
      }

      await admin
        .from('calls')
        .update({
          status: 'ended',
          ended_at: endedAt,
          duration_seconds: durationSeconds,
          end_reason: message?.endedReason ?? message?.call?.endedReason ?? null,
          transcript_url: message?.artifact?.transcriptUrl ?? null,
          // Vapi'nin end-of-call-report'ta tam transkript/özeti hangi tam
          // alanda gönderdiği API versiyonuna göre değişebilir — birkaç olası
          // yolu sırayla dener, ilk bulduğunu kullanır. Hiçbiri yoksa null
          // kalır, panel bunu "transkript mevcut değil" olarak gösterir.
          transcript: message?.artifact?.transcript ?? message?.transcript ?? null,
          summary: message?.summary ?? message?.analysis?.summary ?? null,
          recording_url: message?.artifact?.recordingUrl ?? null,
          cost: message?.cost ?? null,
        })
        .eq('id', callRowId)
    }
    return jsonResponse({ received: true })
  }

  if (messageType === 'status-update') {
    return jsonResponse({ received: true })
  }

  // messageType === 'tool-calls'
  const handlers = businessType === 'restaurant' ? RESTAURANT_HANDLERS : BEAUTY_HANDLERS
  const context = { businessId, businessType, callId: callRowId, supabaseAdmin: admin }
  const calls = message.toolCallList ?? message.toolCalls ?? []
  const results = []

  for (const call of calls) {
    const name = call.function?.name ?? call.name
    const rawArgs = call.function?.arguments ?? call.arguments ?? {}
    const args = typeof rawArgs === 'string' ? safeParseJson(rawArgs) : (rawArgs ?? {})
    const idempotencyKey = call.id

    // Aynı tool-call Vapi tarafından retry edilirse (ör. ağ hatası), daha önce
    // üretilmiş sonucu tekrar hesaplamadan/mutasyon uygulamadan döneriz.
    if (callRowId && idempotencyKey) {
      const { data: existing } = await admin
        .from('call_tool_invocations')
        .select('result')
        .eq('call_id', callRowId)
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle()
      if (existing) {
        results.push({ toolCallId: call.id, result: stringifyResult(existing.result) })
        continue
      }
    }

    let resultPayload
    let success = true
    try {
      const handler = handlers[name]
      if (!handler) {
        resultPayload = { error: `Bilinmeyen işlem: ${name}` }
        success = false
      } else {
        resultPayload = await handler(context, args)
        success = !resultPayload?.error
      }
    } catch (err) {
      console.error('smart-endpoint: tool handler error', name, err)
      resultPayload = { error: 'İşlem sırasında beklenmeyen bir hata oluştu.' }
      success = false
    }

    if (callRowId) {
      const { error: insertError } = await admin.from('call_tool_invocations').insert({
        call_id: callRowId,
        tool_name: name,
        arguments: args,
        result: resultPayload,
        success,
        idempotency_key: idempotencyKey ?? null,
      })
      if (insertError) console.error('smart-endpoint: call_tool_invocations insert failed', insertError)
    }

    results.push({ toolCallId: call.id, result: stringifyResult(resultPayload) })
  }

  return jsonResponse({ results })
})
