import { supabase } from '../lib/supabaseClient'

export function listServices(businessId) {
  return supabase.from('services').select('*').eq('business_id', businessId).order('name')
}

export function createService(businessId, payload) {
  return supabase.from('services').insert({ ...payload, business_id: businessId }).select().single()
}

export function updateService(id, payload) {
  return supabase.from('services').update(payload).eq('id', id).select().single()
}

export function setServiceActive(id, isActive) {
  return supabase.from('services').update({ is_active: isActive }).eq('id', id)
}
