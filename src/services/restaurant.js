import { supabase } from '../lib/supabaseClient'

// --- Masa bölgeleri/kategorileri ---

export function listTableAreas(businessId) {
  return supabase.from('table_areas').select('*').eq('business_id', businessId).order('sort_order')
}

export function createTableArea(businessId, name) {
  return supabase.from('table_areas').insert({ business_id: businessId, name }).select().single()
}

// --- Masalar ---

export function listTables(businessId) {
  return supabase.from('restaurant_tables').select('*, table_areas(name)').eq('business_id', businessId).order('label')
}

export function createTable(businessId, payload) {
  return supabase.from('restaurant_tables').insert({ ...payload, business_id: businessId }).select().single()
}

export function updateTable(id, payload) {
  return supabase.from('restaurant_tables').update(payload).eq('id', id).select().single()
}

export function setTableStatus(id, status) {
  return supabase.from('restaurant_tables').update({ status }).eq('id', id)
}

export function setTableActive(id, isActive) {
  return supabase.from('restaurant_tables').update({ is_active: isActive }).eq('id', id)
}

export function markTableCleaned(tableId) {
  return supabase.rpc('mark_table_cleaned', { p_table_id: tableId })
}

// --- Gerçek masa oturumları (table_sessions) ---

export function listActiveSessions(businessId) {
  return supabase.from('table_sessions').select('*').eq('business_id', businessId).eq('status', 'active')
}

export function checkInReservation(reservationId, tableId) {
  return supabase.rpc('check_in_reservation', { p_reservation_id: reservationId, p_table_id: tableId ?? null })
}

export function completeTableSession(tableId) {
  return supabase.rpc('complete_table_session', { p_table_id: tableId })
}

// --- Rezervasyonlar ---

export function listReservationsForRange(businessId, startIso, endIso) {
  return supabase
    .from('reservation_tables')
    .select(
      'id, reservation_id, table_id, starts_at, ends_at, restaurant_tables(label, capacity), ' +
        'reservations!inner(id, status, source, party_size, notes, customer_id, estimated_duration, buffer_minutes, estimated_end_time, seated_at, actual_end_time, customers(full_name, phone))'
    )
    .eq('business_id', businessId)
    .gte('starts_at', startIso)
    .lt('starts_at', endIso)
    .order('starts_at')
}

// Bildirimden ("Yeni Rezervasyon" push'una tıklayınca) DOĞRUDAN o
// rezervasyonun detayına atlayabilmek için — listReservationsForRange'in
// tarih aralığına bağlı olmadan, tek bir reservation_id ile aynı şekle
// sahip satırı getirir.
export function getReservationEntryById(reservationId) {
  return supabase
    .from('reservation_tables')
    .select(
      'id, reservation_id, table_id, starts_at, ends_at, restaurant_tables(label, capacity), ' +
        'reservations!inner(id, status, source, party_size, notes, customer_id, estimated_duration, buffer_minutes, estimated_end_time, seated_at, actual_end_time, customers(full_name, phone))'
    )
    .eq('reservation_id', reservationId)
    .maybeSingle()
}

export function findAvailableTables(businessId, startsAtIso, endsAtIso, partySize) {
  return supabase.rpc('find_available_tables', {
    p_business_id: businessId,
    p_starts_at: startsAtIso,
    p_ends_at: endsAtIso,
    p_party_size: partySize,
  })
}

export function getRestaurantSettings(businessId) {
  return supabase.from('restaurant_settings').select('*').eq('business_id', businessId).maybeSingle()
}

export function bookReservation({ customerId, tableId, partySize, startsAt, notes }) {
  return supabase.rpc('book_reservation', {
    p_customer_id: customerId,
    p_table_id: tableId,
    p_party_size: partySize,
    p_starts_at: startsAt,
    p_notes: notes ?? null,
  })
}

export function cancelReservation(reservationId, reason) {
  return supabase.rpc('cancel_reservation', { p_reservation_id: reservationId, p_reason: reason ?? null })
}

export function markReservationNoShow(reservationId) {
  return supabase.rpc('mark_reservation_no_show', { p_reservation_id: reservationId })
}

export function rescheduleReservation(reservationId, newStartsAtIso) {
  return supabase.rpc('reschedule_reservation', { p_reservation_id: reservationId, p_new_starts_at: newStartsAtIso })
}

// --- Menü ---

export function listMenuCategories(businessId) {
  return supabase.from('menu_categories').select('*').eq('business_id', businessId).order('sort_order')
}

export function createMenuCategory(businessId, payload) {
  return supabase.from('menu_categories').insert({ ...payload, business_id: businessId }).select().single()
}

export function listMenuItems(businessId) {
  return supabase.from('menu_items').select('*, menu_categories(name)').eq('business_id', businessId).order('name')
}

export function createMenuItem(businessId, payload) {
  return supabase.from('menu_items').insert({ ...payload, business_id: businessId }).select().single()
}

export function updateMenuItem(id, payload) {
  return supabase.from('menu_items').update(payload).eq('id', id).select().single()
}

export function setMenuItemActive(id, isActive) {
  return supabase.from('menu_items').update({ is_active: isActive }).eq('id', id)
}
