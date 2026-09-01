import { createSupabaseAdmin, createSupabaseAsCaller, jsonResponse } from '../_shared/supabaseAdmin.js'
import { corsHeaders } from '../_shared/cors.js'
import { sendPushToBusiness } from '../_shared/push.js'

// İşletme panelinden ("Bildirimler" sayfası) elle yazılan bir bildirimi
// TÜM cihazlara gerçekten push olarak yollar — Vapi'nin otomatik oluşturduğu
// rezervasyon/randevu bildirimleriyle AYNI gönderim mekanizmasını kullanır
// (_shared/push.js), tek fark tetikleyicinin bir müşteri araması değil,
// panelden elle girilen bir mesaj olması.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return jsonResponse({ error: 'method_not_allowed' }, 405)

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) return jsonResponse({ error: 'missing_auth' }, 401)

  let payload
  try {
    payload = await req.json()
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400)
  }

  const { business_id: businessId, title, body } = payload
  if (!businessId || !title?.trim() || !body?.trim()) {
    return jsonResponse({ error: 'missing_fields', detail: 'business_id, title ve body zorunlu.' }, 400)
  }

  const caller = createSupabaseAsCaller(authHeader)
  const {
    data: { user },
  } = await caller.auth.getUser()
  if (!user) return jsonResponse({ error: 'unauthorized' }, 401)

  // Yetki kontrolü RLS'teki notifications_insert politikasıyla BİREBİR aynı
  // fonksiyonu kullanır (has_permission) — iki yerde farklı mantık yaşamasın.
  const { data: allowed, error: permError } = await caller.rpc('has_permission', {
    p_business_id: businessId,
    p_permission: 'settings.manage',
  })
  if (permError || !allowed) {
    return jsonResponse({ error: 'forbidden', detail: 'Bildirim göndermek için işletme sahibi (Owner) yetkisi gerekir.' }, 403)
  }

  const admin = createSupabaseAdmin()
  const { status } = await sendPushToBusiness(admin, businessId, {
    type: 'manual',
    title: title.trim(),
    body: body.trim(),
    createdBy: user.id,
  })

  return jsonResponse({ ok: true, status })
})
