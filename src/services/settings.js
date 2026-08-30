import { supabase } from '../lib/supabaseClient'

export function getBusinessHours(businessId) {
  return supabase.from('business_hours').select('*').eq('business_id', businessId).order('day_of_week')
}

// rows: [{ day_of_week, opens_at, closes_at, is_closed }, ...] — business_id
// her satıra burada eklenir, PK (business_id, day_of_week) olduğu için tek
// bir upsert ile 7 gün birden yazılır/güncellenir.
export function saveBusinessHours(businessId, rows) {
  const payload = rows.map((r) => ({ ...r, business_id: businessId }))
  return supabase.from('business_hours').upsert(payload, { onConflict: 'business_id,day_of_week' }).select()
}
