import { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { listCustomers, createCustomer } from '../services/customers'
import { bookAppointment, listStaffDayAppointments } from '../services/appointments'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Button from '../components/Button'
import StepIndicator from '../components/StepIndicator'

const STEPS = ['Müşteri', 'Randevu', 'Onay']
const SLOT_MINUTES = 30
const DAY_START_HOUR = 9
const DAY_END_HOUR = 20

function pad(n) {
  return String(n).padStart(2, '0')
}
function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function buildSlotLabels() {
  const labels = []
  for (let h = DAY_START_HOUR; h < DAY_END_HOUR; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      labels.push(`${pad(h)}:${pad(m)}`)
    }
  }
  return labels
}
const SLOT_LABELS = buildSlotLabels()

function isSameDayAsToday(dateStr) {
  return dateStr === formatDateInput(new Date())
}
function isSlotInPast(label) {
  const [h, m] = label.split(':').map(Number)
  const now = new Date()
  return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())
}

export default function BookingModal({ open, onClose, onBooked, staff, services, defaultStaffId, defaultStart }) {
  const { activeBusinessId } = useBusiness()
  const [step, setStep] = useState(1)

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [newCustomerMode, setNewCustomerMode] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [staffId, setStaffId] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [selectedServiceIds, setSelectedServiceIds] = useState([])
  const [busySlots, setBusySlots] = useState(new Set())
  const [loadingSlots, setLoadingSlots] = useState(false)

  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!open) return
    setStep(1)
    setCustomerSearch('')
    setCustomerResults([])
    setSelectedCustomer(null)
    setNewCustomerMode(false)
    setNewCustomerName('')
    setNewCustomerPhone('')
    setStaffId(defaultStaffId ?? staff[0]?.id ?? '')
    setDateStr(formatDateInput(defaultStart ?? new Date()))
    setTimeStr(defaultStart ? `${pad(defaultStart.getHours())}:${pad(defaultStart.getMinutes())}` : '')
    setSelectedServiceIds([])
    setNotes('')
    setError('')
  }, [open, defaultStaffId, defaultStart, staff])

  useEffect(() => {
    if (!open || !customerSearch.trim()) {
      setCustomerResults([])
      return
    }
    const t = setTimeout(async () => {
      const { data } = await listCustomers(activeBusinessId, { search: customerSearch })
      setCustomerResults(data ?? [])
    }, 250)
    return () => clearTimeout(t)
  }, [customerSearch, activeBusinessId, open])

  const qualifiedServices = useMemo(() => {
    const member = staff.find((s) => s.id === staffId)
    const qualifiedIds = new Set((member?.staff_services ?? []).map((s) => s.service_id))
    return services.filter((svc) => qualifiedIds.has(svc.id))
  }, [staff, staffId, services])

  useEffect(() => {
    setSelectedServiceIds((current) => current.filter((id) => qualifiedServices.some((s) => s.id === id)))
  }, [qualifiedServices])

  // Seçilen personel + tarih için o günün dolu saatlerini çeker.
  useEffect(() => {
    if (!open || !staffId || !dateStr || step !== 2) return
    let active = true
    setLoadingSlots(true)
    const dayStart = new Date(`${dateStr}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    listStaffDayAppointments(activeBusinessId, staffId, dayStart.toISOString(), dayEnd.toISOString()).then(({ data }) => {
      if (!active) return
      const busy = new Set()
      for (const appt of data ?? []) {
        const s = new Date(appt.starts_at)
        const e = new Date(appt.ends_at)
        for (const label of SLOT_LABELS) {
          const [h, m] = label.split(':').map(Number)
          const slotStart = new Date(dayStart)
          slotStart.setHours(h, m, 0, 0)
          const slotEnd = new Date(slotStart.getTime() + SLOT_MINUTES * 60000)
          if (s < slotEnd && e > slotStart) busy.add(label)
        }
      }
      setBusySlots(busy)
      setLoadingSlots(false)
    })
    return () => {
      active = false
    }
  }, [open, staffId, dateStr, step, activeBusinessId])

  const toggleService = (serviceId) => {
    setSelectedServiceIds((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]))
  }

  const totals = useMemo(() => {
    const picked = qualifiedServices.filter((s) => selectedServiceIds.includes(s.id))
    return {
      duration: picked.reduce((sum, s) => sum + s.duration_minutes, 0),
      price: picked.reduce((sum, s) => sum + Number(s.price), 0),
      picked,
    }
  }, [qualifiedServices, selectedServiceIds])

  const canGoStep2 = Boolean(selectedCustomer || (newCustomerMode && newCustomerName && newCustomerPhone))
  const canGoStep3 = Boolean(staffId && dateStr && timeStr && selectedServiceIds.length > 0)

  const goNext = () => setStep((s) => Math.min(3, s + 1))
  const goBack = () => setStep((s) => Math.max(1, s - 1))

  const handleSubmit = async () => {
    setError('')
    let customerId = selectedCustomer?.id
    setSubmitting(true)

    if (!customerId && newCustomerMode) {
      const { data, error: custErr } = await createCustomer(activeBusinessId, { full_name: newCustomerName, phone: newCustomerPhone })
      if (custErr) {
        setSubmitting(false)
        setError(custErr.code === '23505' ? 'Bu telefonla kayıtlı bir müşteri zaten var.' : 'Müşteri oluşturulamadı.')
        return
      }
      customerId = data.id
    }

    const [h, m] = timeStr.split(':').map(Number)
    const startsAt = new Date(`${dateStr}T00:00:00`)
    startsAt.setHours(h, m, 0, 0)

    const { error: bookErr } = await bookAppointment({
      customerId,
      items: selectedServiceIds.map((service_id) => ({ service_id, staff_id: staffId })),
      startsAt: startsAt.toISOString(),
      notes: notes || null,
    })
    setSubmitting(false)

    if (bookErr) {
      if (bookErr.code === '23P01' || bookErr.message?.includes('exclu')) {
        setError('Bu saat artık müsait değil — personel başka bir randevuya alındı.')
      } else if (bookErr.message?.includes('staff_not_qualified')) {
        setError('Seçilen personel bu hizmeti yapamıyor.')
      } else if (bookErr.message?.includes('outside_working_hours')) {
        setError('Personel bu saatte çalışmıyor.')
      } else if (bookErr.message?.includes('staff_time_off')) {
        setError('Personel bu tarihte izinli.')
      } else {
        setError('Randevu oluşturulamadı: ' + bookErr.message)
      }
      return
    }

    onBooked?.()
    onClose()
  }

  return (
    <Modal open={open} title="Yeni Randevu" onClose={onClose} width="max-w-xl">
      <div className="mb-5 flex justify-center">
        <StepIndicator steps={STEPS} current={step} />
      </div>

      {step === 1 && (
        <div className="space-y-3">
          {selectedCustomer ? (
            <div className="flex items-center justify-between rounded-lg bg-teal/5 px-4 py-3 text-sm ring-1 ring-teal/20">
              <div>
                <p className="font-medium text-ink">{selectedCustomer.full_name}</p>
                {selectedCustomer.phone && <p className="text-xs text-slate-500">{selectedCustomer.phone}</p>}
              </div>
              <button type="button" onClick={() => setSelectedCustomer(null)} className="text-xs font-medium text-teal hover:text-teal-dark">
                Değiştir
              </button>
            </div>
          ) : newCustomerMode ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Input id="new-customer-name" placeholder="Ad Soyad" required value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
              <Input
                id="new-customer-phone"
                placeholder="Telefon"
                required
                type="tel"
                value={newCustomerPhone}
                onChange={(e) => setNewCustomerPhone(e.target.value)}
              />
              <button type="button" onClick={() => setNewCustomerMode(false)} className="text-xs font-medium text-slate-500 hover:text-ink">
                Vazgeç, müşteri ara
              </button>
            </div>
          ) : (
            <div>
              <input
                autoFocus
                value={customerSearch}
                onChange={(e) => setCustomerSearch(e.target.value)}
                placeholder="İsim veya telefon ile ara…"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
              {customerResults.length > 0 && (
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg border border-slate-200">
                  {customerResults.map((c) => (
                    <button
                      type="button"
                      key={c.id}
                      onClick={() => {
                        setSelectedCustomer(c)
                        setCustomerResults([])
                      }}
                      className="block w-full px-3 py-2 text-left text-sm hover:bg-mist"
                    >
                      {c.full_name} {c.phone && `· ${c.phone}`}
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setNewCustomerMode(true)} className="mt-1.5 text-xs font-medium text-teal hover:text-teal-dark">
                + Yeni müşteri oluştur
              </button>
            </div>
          )}

          <Button className="w-full" disabled={!canGoStep2} onClick={goNext}>
            İleri
          </Button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="rounded-lg bg-mist px-4 py-2.5 text-sm">
            <span className="font-medium text-ink">{selectedCustomer?.full_name ?? newCustomerName}</span>
            {(selectedCustomer?.phone ?? newCustomerPhone) && (
              <span className="text-slate-500"> · {selectedCustomer?.phone ?? newCustomerPhone}</span>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="booking-staff">
                Personel *
              </label>
              <select
                id="booking-staff"
                value={staffId}
                onChange={(e) => setStaffId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              >
                {staff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name}
                  </option>
                ))}
              </select>
            </div>
            <Input
              id="booking-date"
              label="Tarih *"
              type="date"
              min={formatDateInput(new Date())}
              value={dateStr}
              onChange={(e) => {
                setDateStr(e.target.value)
                setTimeStr('')
              }}
            />
          </div>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Saat *</span>
            {loadingSlots ? (
              <p className="text-sm text-slate-400">Yükleniyor…</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                {SLOT_LABELS.map((label) => {
                  const isBusy = busySlots.has(label)
                  const isPast = isSameDayAsToday(dateStr) && isSlotInPast(label)
                  const isDisabled = isBusy || isPast
                  const isSelected = timeStr === label
                  return (
                    <button
                      type="button"
                      key={label}
                      disabled={isDisabled}
                      onClick={() => setTimeStr(label)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        isDisabled
                          ? 'cursor-not-allowed bg-slate-50 text-slate-300 line-through'
                          : isSelected
                            ? 'bg-teal text-white'
                            : 'bg-mist text-slate-600 hover:bg-teal/10 hover:text-teal-dark'
                      }`}
                    >
                      {label}
                      {isBusy && <span className="block text-[9px]">Dolu</span>}
                      {!isBusy && isPast && <span className="block text-[9px]">Geçti</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-sm font-medium text-ink">Hizmetler *</span>
            </div>
            {qualifiedServices.length === 0 ? (
              <p className="text-sm text-slate-500">Bu personelin yapabildiği hizmet tanımlı değil.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {qualifiedServices.map((svc) => (
                  <button
                    type="button"
                    key={svc.id}
                    onClick={() => toggleService(svc.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedServiceIds.includes(svc.id) ? 'bg-teal text-white' : 'bg-mist text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    {svc.name} · {svc.duration_minutes} dk
                  </button>
                ))}
              </div>
            )}
            {totals.picked.length > 0 && (
              <div className="mt-3 flex justify-between rounded-lg bg-mist px-4 py-2.5 text-sm">
                <span className="text-slate-500">Toplam Süre / Tutar</span>
                <span className="font-medium text-ink">
                  {totals.duration} dk · {totals.price.toLocaleString('tr-TR')} ₺
                </span>
              </div>
            )}
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={goBack}>
              Geri
            </Button>
            <Button className="flex-1" disabled={!canGoStep3} onClick={goNext}>
              İleri
            </Button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-2 rounded-lg border border-slate-200 p-4 text-sm">
            <div className="flex justify-between">
              <span className="text-slate-500">Müşteri</span>
              <span className="font-medium text-ink">{selectedCustomer?.full_name ?? newCustomerName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Personel</span>
              <span className="font-medium text-ink">{staff.find((s) => s.id === staffId)?.full_name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tarih / Saat</span>
              <span className="font-medium text-ink">
                {dateStr} · {timeStr}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Hizmetler</span>
              <span className="font-medium text-ink text-right">{totals.picked.map((s) => s.name).join(', ')}</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-500">Toplam</span>
              <span className="font-semibold text-ink">
                {totals.duration} dk · {totals.price.toLocaleString('tr-TR')} ₺
              </span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="booking-notes">
              Not
            </label>
            <textarea
              id="booking-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Bu randevuyla ilgili not (opsiyonel)"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={goBack} disabled={submitting}>
              Geri
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Kaydediliyor…' : 'Randevuyu Oluştur'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
