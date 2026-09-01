import { supabase } from '../lib/supabaseClient'

export function listNotifications(businessId, limit = 50) {
  return supabase
    .from('notifications')
    .select('*, customers(full_name, phone)')
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .limit(limit)
}

export function saveSubscription(businessId, userId, subscriptionJson) {
  const { endpoint, keys } = subscriptionJson
  return supabase
    .from('push_subscriptions')
    .upsert(
      { business_id: businessId, user_id: userId, endpoint, p256dh: keys.p256dh, auth_key: keys.auth },
      { onConflict: 'endpoint' }
    )
    .select()
    .single()
}

export function deleteSubscription(endpoint) {
  return supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

// Gerçek gönderim (VAPID imzalama + push) sadece Edge Function'da yapılabilir
// — VAPID private key'i frontend'e asla ulaşmaz.
export async function sendManualNotification(businessId, title, body) {
  const { data, error } = await supabase.functions.invoke('send-notification', {
    body: { business_id: businessId, title, body },
  })
  if (error) return { data: null, error }
  return { data, error: null }
}
