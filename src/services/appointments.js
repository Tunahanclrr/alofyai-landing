import { supabase } from '../lib/supabaseClient'

export function listAppointmentsForDay(businessId, dayStartIso, dayEndIso) {
  return supabase
    .from('appointment_services')
    .select(
      'id, appointment_id, staff_id, service_id, starts_at, ends_at, price, ' +
        'services(name), staff(full_name, color), ' +
        'appointments!inner(id, status, source, notes, customer_id, customers(full_name, phone))'
    )
    .eq('business_id', businessId)
    .gte('starts_at', dayStartIso)
    .lt('starts_at', dayEndIso)
    .order('starts_at')
}

export function listStaffDayAppointments(businessId, staffId, dayStartIso, dayEndIso) {
  return supabase
    .from('appointment_services')
    .select('starts_at, ends_at, appointments!inner(status)')
    .eq('business_id', businessId)
    .eq('staff_id', staffId)
    .gte('starts_at', dayStartIso)
    .lt('starts_at', dayEndIso)
    .neq('appointments.status', 'cancelled')
}

// Bildirimden ("Yeni Randevu" push'una tıklayınca) DOĞRUDAN o randevunun
// detayına atlayabilmek için — listAppointmentsForDay'in tarih aralığına
// bağlı olmadan, tek bir appointment_id ile aynı şekle sahip satırı getirir.
// Çoklu hizmetli randevularda (Ombre + Kesim gibi) ilk satırı döner — takvim
// listesindeki tıklamada da zaten aynı davranış kullanılıyor (bkz. CalendarPage
// ListView: onSelect(first)).
export function getAppointmentEntryById(appointmentId) {
  return supabase
    .from('appointment_services')
    .select(
      'id, appointment_id, staff_id, service_id, starts_at, ends_at, price, ' +
        'services(name), staff(full_name, color), ' +
        'appointments!inner(id, status, source, notes, customer_id, customers(full_name, phone))'
    )
    .eq('appointment_id', appointmentId)
    .order('starts_at')
    .limit(1)
    .maybeSingle()
}

export function listCustomerAppointments(customerId) {
  return supabase
    .from('appointment_services')
    .select('id, starts_at, ends_at, price, services(name), staff(full_name), appointments!inner(id, status, source, notes)')
    .eq('appointments.customer_id', customerId)
    .order('starts_at', { ascending: false })
}

export function bookAppointment({ customerId, items, startsAt, notes }) {
  return supabase.rpc('book_appointment', {
    p_customer_id: customerId,
    p_items: items,
    p_starts_at: startsAt,
    p_notes: notes ?? null,
  })
}

export function updateAppointmentNotes(appointmentId, notes) {
  return supabase.rpc('update_appointment_notes', { p_appointment_id: appointmentId, p_notes: notes })
}

export function rescheduleAppointment(appointmentId, newStartsAtIso) {
  return supabase.rpc('reschedule_appointment', { p_appointment_id: appointmentId, p_new_starts_at: newStartsAtIso })
}

export function cancelAppointment(appointmentId, reason) {
  return supabase.rpc('cancel_appointment', { p_appointment_id: appointmentId, p_reason: reason ?? null })
}

export function setAppointmentStatus(appointmentId, status) {
  return supabase.rpc('set_appointment_status', { p_appointment_id: appointmentId, p_status: status })
}
