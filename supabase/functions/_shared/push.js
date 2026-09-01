import webpush from 'npm:web-push@3.6.7'

const VAPID_PUBLIC_KEY = Deno.env.get('VAPID_PUBLIC_KEY')
const VAPID_PRIVATE_KEY = Deno.env.get('VAPID_PRIVATE_KEY')
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:destek@alofyai.com'

if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY)
}

// Bir işletmenin bildirime abone TÜM cihazlarına (masaüstü + telefon, aynı
// kullanıcının birden fazla cihazı olabilir) push gönderir ve sonucu
// notifications tablosuna geçmiş/denetim kaydı olarak yazar — hem otomatik
// (yeni rezervasyon/randevu) hem manuel (panelden elle) çağrılar aynı
// fonksiyonu kullanır, tek merkezde yaşar.
export async function sendPushToBusiness(supabaseAdmin, businessId, { type, title, body, url, customerId = null, createdBy = null }) {
  if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
    console.error('sendPushToBusiness: VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY tanımlı değil, push gönderilemedi')
    await supabaseAdmin
      .from('notifications')
      .insert({ business_id: businessId, customer_id: customerId, type, title, body, status: 'failed', created_by: createdBy })
    return { status: 'failed' }
  }

  const { data: subs } = await supabaseAdmin
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth_key')
    .eq('business_id', businessId)

  let status = 'no_subscribers'
  if (subs && subs.length > 0) {
    const payload = JSON.stringify({ title, body, url: url ?? '/app/notifications' })
    const results = await Promise.allSettled(
      subs.map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload))
    )

    // Süresi dolmuş/geri çekilmiş abonelikler (404/410) sessizce temizlenir —
    // kullanıcı telefon değiştirip eski aboneliği iptal ettiğinde çöp
    // birikmesin diye. Diğer hatalar (geçici ağ sorunu vb.) aboneliği silmez.
    const staleIds = []
    let anySucceeded = false
    results.forEach((r, i) => {
      if (r.status === 'fulfilled') anySucceeded = true
      else if (r.reason?.statusCode === 404 || r.reason?.statusCode === 410) staleIds.push(subs[i].id)
      else console.error('sendPushToBusiness: gönderim hatası', r.reason?.statusCode, r.reason?.body)
    })
    if (staleIds.length) await supabaseAdmin.from('push_subscriptions').delete().in('id', staleIds)
    status = anySucceeded ? 'sent' : 'failed'
  }

  await supabaseAdmin
    .from('notifications')
    .insert({ business_id: businessId, customer_id: customerId, type, title, body, status, created_by: createdBy })

  return { status }
}
