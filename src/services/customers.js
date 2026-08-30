import { supabase } from '../lib/supabaseClient'

const PAGE_SIZE = 20

export function listCustomers(businessId, { search = '', page = 0 } = {}) {
  let query = supabase
    .from('customers')
    .select('*', { count: 'exact' })
    .eq('business_id', businessId)
    .order('created_at', { ascending: false })
    .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1)

  if (search.trim()) {
    query = query.or(`full_name.ilike.%${search.trim()}%,phone.ilike.%${search.trim()}%`)
  }
  return query
}

export function getCustomer(id) {
  return supabase.from('customers').select('*').eq('id', id).maybeSingle()
}

export function createCustomer(businessId, payload) {
  return supabase.from('customers').insert({ ...payload, business_id: businessId }).select().single()
}

export function updateCustomer(id, payload) {
  return supabase.from('customers').update(payload).eq('id', id).select().single()
}

export { PAGE_SIZE }
