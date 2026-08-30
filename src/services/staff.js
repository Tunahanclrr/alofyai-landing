import { supabase } from '../lib/supabaseClient'

export function listStaff(businessId) {
  return supabase.from('staff').select('*, staff_services(service_id)').eq('business_id', businessId).order('full_name')
}

export function createStaff(businessId, payload) {
  return supabase.from('staff').insert({ ...payload, business_id: businessId }).select().single()
}

export function updateStaff(id, payload) {
  return supabase.from('staff').update(payload).eq('id', id).select().single()
}

export function setStaffActive(id, isActive) {
  return supabase.from('staff').update({ is_active: isActive }).eq('id', id)
}

export async function setStaffServices(businessId, staffId, serviceIds) {
  const { error: deleteError } = await supabase.from('staff_services').delete().eq('staff_id', staffId)
  if (deleteError) return { error: deleteError }
  if (serviceIds.length === 0) return { error: null }
  return supabase.from('staff_services').insert(serviceIds.map((service_id) => ({ staff_id: staffId, service_id, business_id: businessId })))
}
