import { resolveOrCreateCustomer, translateDbError } from './shared.js'
import { localToUtc, utcToLocalParts, addMinutes } from '../../_shared/time.js'

const SLOT_STEP_MIN = 15
const MAX_SLOTS_RETURNED = 12

export async function list_services(ctx) {
  const { data } = await ctx.supabaseAdmin
    .from('services')
    .select('id, name, duration_minutes, price')
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)
    .order('name')
  return { services: data ?? [] }
}

export async function list_staff(ctx) {
  const { data } = await ctx.supabaseAdmin
    .from('staff')
    .select('id, full_name')
    .eq('business_id', ctx.businessId)
    .eq('is_active', true)
    .order('full_name')
  return { staff: data ?? [] }
}

// v1 slot-bulucu: business_hours/special_hours + staff_working_hours +
// staff_time_off + mevcut appointment_services çakışmalarını hesaba katarak
// SLOT_STEP_MIN aralıklarla uygun başlangıç saatleri üretir. Race-safe
// garanti burada DEĞİL — nihai güvenlik create_appointment'ın çağırdığı
// _book_appointment_core + EXCLUDE constraint'te (bu sadece öneri amaçlı).
export async function check_availability(ctx, args) {
  const { service_id, date, staff_id } = args
  if (!service_id || !date) return { error: 'service_id ve date zorunlu.' }

  const { data: business } = await ctx.supabaseAdmin.from('businesses').select('timezone').eq('id', ctx.businessId).maybeSingle()
  const timezone = business?.timezone || 'Europe/Istanbul'

  const { data: service } = await ctx.supabaseAdmin
    .from('services')
    .select('id, name, duration_minutes')
    .eq('id', service_id)
    .eq('business_id', ctx.businessId)
    .maybeSingle()
  if (!service) return { error: 'Hizmet bulunamadı.' }

  let staffQuery = ctx.supabaseAdmin
    .from('staff_services')
    .select('staff_id, staff:staff_id(id, full_name, is_active)')
    .eq('service_id', service_id)
    .eq('business_id', ctx.businessId)
  if (staff_id) staffQuery = staffQuery.eq('staff_id', staff_id)
  const { data: staffLinks } = await staffQuery
  const candidateStaff = (staffLinks ?? []).map((l) => l.staff).filter((s) => s?.is_active)
  if (candidateStaff.length === 0) return { error: 'Bu hizmeti verebilecek uygun personel bulunamadı.' }

  const dayStartUtc = localToUtc(date, '00:00', timezone)
  const dayEndUtc = addMinutes(dayStartUtc, 24 * 60)
  const { dayOfWeek } = utcToLocalParts(dayStartUtc, timezone)

  const [{ data: special }, { data: hours }] = await Promise.all([
    ctx.supabaseAdmin.from('business_special_hours').select('*').eq('business_id', ctx.businessId).eq('date', date).maybeSingle(),
    ctx.supabaseAdmin.from('business_hours').select('*').eq('business_id', ctx.businessId).eq('day_of_week', dayOfWeek).maybeSingle(),
  ])
  const closed = special ? special.is_closed : (hours?.is_closed ?? true)
  if (closed) return { service: service.name, available_slots: [], note: 'İşletme bu tarihte kapalı.' }
  const opensAt = (special?.opens_at ?? hours?.opens_at ?? '09:00').slice(0, 5)
  const closesAt = (special?.closes_at ?? hours?.closes_at ?? '18:00').slice(0, 5)

  const windowStart = localToUtc(date, opensAt, timezone)
  const windowEnd = localToUtc(date, closesAt, timezone)
  const now = new Date()

  const results = []
  for (const staffMember of candidateStaff) {
    const { data: workingHours } = await ctx.supabaseAdmin
      .from('staff_working_hours')
      .select('starts_at, ends_at')
      .eq('staff_id', staffMember.id)
      .eq('business_id', ctx.businessId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    let staffStart = windowStart
    let staffEnd = windowEnd
    if (workingHours) {
      const ws = localToUtc(date, workingHours.starts_at.slice(0, 5), timezone)
      const we = localToUtc(date, workingHours.ends_at.slice(0, 5), timezone)
      staffStart = ws > windowStart ? ws : windowStart
      staffEnd = we < windowEnd ? we : windowEnd
    }
    if (staffStart >= staffEnd) continue

    const [{ data: busyAppointments }, { data: timeOff }] = await Promise.all([
      ctx.supabaseAdmin
        .from('appointment_services')
        .select('starts_at, ends_at')
        .eq('staff_id', staffMember.id)
        .eq('business_id', ctx.businessId)
        .eq('blocks_schedule', true)
        .lt('starts_at', dayEndUtc.toISOString())
        .gt('ends_at', dayStartUtc.toISOString()),
      ctx.supabaseAdmin
        .from('staff_time_off')
        .select('starts_at, ends_at')
        .eq('staff_id', staffMember.id)
        .eq('business_id', ctx.businessId)
        .lt('starts_at', dayEndUtc.toISOString())
        .gt('ends_at', dayStartUtc.toISOString()),
    ])
    const busyRanges = [...(busyAppointments ?? []), ...(timeOff ?? [])].map((r) => ({
      start: new Date(r.starts_at),
      end: new Date(r.ends_at),
    }))

    for (let slotStart = staffStart; addMinutes(slotStart, service.duration_minutes) <= staffEnd; slotStart = addMinutes(slotStart, SLOT_STEP_MIN)) {
      if (slotStart <= now) continue
      const slotEnd = addMinutes(slotStart, service.duration_minutes)
      const overlaps = busyRanges.some((r) => slotStart < r.end && slotEnd > r.start)
      if (overlaps) continue
      results.push({ staff_id: staffMember.id, staff_name: staffMember.full_name, starts_at: slotStart.toISOString() })
      if (results.length >= MAX_SLOTS_RETURNED) break
    }
    if (results.length >= MAX_SLOTS_RETURNED) break
  }

  return { service: service.name, duration_minutes: service.duration_minutes, available_slots: results }
}

export async function create_appointment(ctx, args) {
  const { customer_phone, customer_name, service_id, staff_id, starts_at } = args
  if (!customer_phone || !service_id || !staff_id || !starts_at) {
    return { error: 'customer_phone, service_id, staff_id ve starts_at zorunlu.' }
  }

  const customer = await resolveOrCreateCustomer(ctx, customer_phone, customer_name)
  if (customer.error) return customer

  const { data: appointment, error } = await ctx.supabaseAdmin.rpc('_book_appointment_core', {
    p_business_id: ctx.businessId,
    p_customer_id: customer.id,
    p_items: [{ service_id, staff_id }],
    p_starts_at: starts_at,
    p_source: 'vapi',
    p_call_id: ctx.callId,
    p_notes: null,
  })
  if (error) return { error: translateDbError(error.message) }
  return { success: true, appointment_id: appointment.id, starts_at: appointment.starts_at, ends_at: appointment.ends_at }
}

export async function cancel_appointment(ctx, args) {
  const { appointment_id, reason } = args
  if (!appointment_id) return { error: 'appointment_id zorunlu.' }
  const { data, error } = await ctx.supabaseAdmin.rpc('_cancel_appointment_core', {
    p_appointment_id: appointment_id,
    p_business_id: ctx.businessId,
    p_reason: reason ?? 'Müşteri telefonla iptal etti (AI)',
    p_source: 'vapi',
  })
  if (error) return { error: translateDbError(error.message) }
  return { success: true, appointment_id: data.id, status: data.status }
}

export async function reschedule_appointment(ctx, args) {
  const { appointment_id, new_starts_at } = args
  if (!appointment_id || !new_starts_at) return { error: 'appointment_id ve new_starts_at zorunlu.' }
  const { data, error } = await ctx.supabaseAdmin.rpc('_reschedule_appointment_core', {
    p_appointment_id: appointment_id,
    p_business_id: ctx.businessId,
    p_new_starts_at: new_starts_at,
  })
  if (error) return { error: translateDbError(error.message) }
  return { success: true, appointment_id: data.id, starts_at: data.starts_at, ends_at: data.ends_at }
}
