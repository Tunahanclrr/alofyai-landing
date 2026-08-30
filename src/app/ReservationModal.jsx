import { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { listCustomers, createCustomer } from '../services/customers'
import { bookReservation, findAvailableTables, listTables, getRestaurantSettings, listReservationsForRange } from '../services/restaurant'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Button from '../components/Button'
import StepIndicator from '../components/StepIndicator'

const STEPS = ['Müşteri', 'Rezervasyon', 'Onay']

function pad(n) {
  return String(n).padStart(2, '0')
}
function formatDateInput(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function isSameDayAsToday(dateStr) {
  return dateStr === formatDateInput(new Date())
}
function isTimeInPast(timeStr) {
  const [h, m] = timeStr.split(':').map(Number)
  const now = new Date()
  return h < now.getHours() || (h === now.getHours() && m <= now.getMinutes())
}
function durationForPartySize(settings, partySize) {
  if (!settings) {
    return partySize <= 2 ? 75 : partySize <= 4 ? 90 : partySize <= 6 ? 120 : partySize <= 10 ? 150 : 180
  }
  if (partySize <= 2) return settings.default_duration_1_2
  if (partySize <= 4) return settings.default_duration_3_4
  if (partySize <= 6) return settings.default_duration_5_6
  if (partySize <= 10) return settings.default_duration_7_10
  return settings.default_duration_10_plus
}

export default function ReservationModal({ open, onClose, onBooked, defaultStart }) {
  const { activeBusinessId } = useBusiness()
  const [step, setStep] = useState(1)

  const [customerSearch, setCustomerSearch] = useState('')
  const [customerResults, setCustomerResults] = useState([])
  const [selectedCustomer, setSelectedCustomer] = useState(null)
  const [newCustomerMode, setNewCustomerMode] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState('')
  const [newCustomerPhone, setNewCustomerPhone] = useState('')

  const [partySize, setPartySize] = useState(2)
  const [dateStr, setDateStr] = useState('')
  const [timeStr, setTimeStr] = useState('')
  const [availableTables, setAvailableTables] = useState([])
  const [loadingTables, setLoadingTables] = useState(false)
  const [selectedTableId, setSelectedTableId] = useState('')

  const [dayTables, setDayTables] = useState([])
  const [daySettings, setDaySettings] = useState(null)
  const [dayReservations, setDayReservations] = useState([])
  const [loadingDay, setLoadingDay] = useState(false)

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
    setPartySize(2)
    setDateStr(formatDateInput(defaultStart ?? new Date()))
    setTimeStr('')
    setSelectedTableId('')
    setNotes('')
    setError('')
  }, [open, defaultStart])

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

  const duration = useMemo(() => durationForPartySize(daySettings, partySize), [daySettings, partySize])
  const buffer = daySettings?.reservation_buffer_minutes ?? 15

  // Gün geneli veri: masalar + ayarlar + o günün rezervasyonları — saat
  // ızgarasında dolu/boş (kırmızı/normal) önizlemesi için.
  useEffect(() => {
    if (!open || !dateStr || step !== 2) return
    let active = true
    setLoadingDay(true)
    const dayStart = new Date(`${dateStr}T00:00:00`)
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    Promise.all([listTables(activeBusinessId), getRestaurantSettings(activeBusinessId), listReservationsForRange(activeBusinessId, dayStart.toISOString(), dayEnd.toISOString())]).then(
      ([tablesRes, settingsRes, reservationsRes]) => {
        if (!active) return
        setDayTables((tablesRes.data ?? []).filter((t) => t.is_active && t.status !== 'blocked'))
        setDaySettings(settingsRes.data)
        setDayReservations((reservationsRes.data ?? []).filter((r) => r.reservations?.status !== 'cancelled' && r.reservations?.status !== 'no_show'))
        setLoadingDay(false)
      }
    )
    return () => {
      active = false
    }
  }, [open, dateStr, step, activeBusinessId])

  const slotLabels = useMemo(() => {
    const labels = []
    for (let h = 11; h <= 22; h++) {
      for (let m = 0; m < 60; m += 30) {
        if (h === 22 && m > 0) continue
        labels.push(`${pad(h)}:${pad(m)}`)
      }
    }
    return labels
  }, [])

  // Her slot için: bu parti büyüklüğüne uygun kapasiteli en az bir masa
  // gerçekten boş mu? (hızlı client-side önizleme — gerçek/nihai kontrol
  // find_available_tables RPC'sinde, masa seçilirken).
  const busySlots = useMemo(() => {
    if (!dateStr || dayTables.length === 0) return new Set()
    const qualifyingTables = dayTables.filter((t) => t.capacity >= partySize)
    const busy = new Set()
    for (const label of slotLabels) {
      const [h, m] = label.split(':').map(Number)
      const slotStart = new Date(`${dateStr}T00:00:00`)
      slotStart.setHours(h, m, 0, 0)
      const slotEnd = new Date(slotStart.getTime() + (duration + buffer) * 60000)

      const hasFreeTable = qualifyingTables.some((table) => {
        const overlaps = dayReservations.some((r) => {
          if (r.table_id !== table.id) return false
          const rStart = new Date(r.starts_at)
          const rEnd = new Date(r.ends_at)
          return rStart < slotEnd && rEnd > slotStart
        })
        return !overlaps
      })
      if (!hasFreeTable) busy.add(label)
    }
    return busy
  }, [dateStr, dayTables, dayReservations, slotLabels, partySize, duration, buffer])

  useEffect(() => {
    if (!open || !dateStr || !timeStr || step !== 2) return
    let active = true
    setLoadingTables(true)
    const [h, m] = timeStr.split(':').map(Number)
    const start = new Date(`${dateStr}T00:00:00`)
    start.setHours(h, m, 0, 0)
    const end = new Date(start.getTime() + (duration + buffer) * 60000)

    findAvailableTables(activeBusinessId, start.toISOString(), end.toISOString(), partySize).then(({ data }) => {
      if (!active) return
      setAvailableTables(data ?? [])
      setSelectedTableId((current) => (data?.some((t) => t.id === current) ? current : data?.[0]?.id ?? ''))
      setLoadingTables(false)
    })
    return () => {
      active = false
    }
  }, [open, dateStr, timeStr, partySize, duration, buffer, step, activeBusinessId])

  const canGoStep2 = Boolean(selectedCustomer || (newCustomerMode && newCustomerName && newCustomerPhone))
  const canGoStep3 = Boolean(dateStr && timeStr && selectedTableId)

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

    const { error: bookErr } = await bookReservation({
      customerId,
      tableId: selectedTableId,
      partySize,
      startsAt: startsAt.toISOString(),
      notes: notes || null,
    })
    setSubmitting(false)

    if (bookErr) {
      if (bookErr.code === '23P01' || bookErr.message?.includes('exclu')) {
        setError('Bu masa artık müsait değil — başka bir rezervasyona alındı.')
      } else if (bookErr.message?.includes('capacity_exceeded')) {
        setError('Seçilen masa bu kişi sayısı için yetersiz.')
      } else {
        setError('Rezervasyon oluşturulamadı: ' + bookErr.message)
      }
      return
    }

    onBooked?.()
    onClose()
  }

  const selectedTable = availableTables.find((t) => t.id === selectedTableId)

  return (
    <Modal open={open} title="Yeni Rezervasyon" onClose={onClose} width="max-w-2xl">
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
              <Input id="new-res-customer-name" placeholder="Ad Soyad" required value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} />
              <Input
                id="new-res-customer-phone"
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
            <Input
              id="res-party-size"
              label="Kişi Sayısı *"
              type="number"
              min={1}
              value={partySize}
              onChange={(e) => {
                setPartySize(Number(e.target.value))
                setTimeStr('')
              }}
            />
            <Input
              id="res-date"
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
          <p className="text-xs text-slate-500">
            Tahmini süre: {duration} dk + {buffer} dk buffer ({partySize} kişi için)
          </p>

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Saat *</span>
            {loadingDay ? (
              <p className="text-sm text-slate-400">Müsaitlik hesaplanıyor…</p>
            ) : (
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6">
                {slotLabels.map((label) => {
                  const isPast = isSameDayAsToday(dateStr) && isTimeInPast(label)
                  const isBusy = busySlots.has(label)
                  const isDisabled = isPast || isBusy
                  const isSelected = timeStr === label
                  return (
                    <button
                      type="button"
                      key={label}
                      disabled={isDisabled}
                      onClick={() => setTimeStr(label)}
                      className={`rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                        isBusy
                          ? 'cursor-not-allowed bg-red-50 text-red-300 line-through'
                          : isPast
                            ? 'cursor-not-allowed bg-slate-50 text-slate-300 line-through'
                            : isSelected
                              ? 'bg-teal text-white'
                              : 'bg-mist text-slate-600 hover:bg-teal/10 hover:text-teal-dark'
                      }`}
                    >
                      {label}
                      {isBusy && <span className="block text-[9px]">Dolu</span>}
                    </button>
                  )
                })}
              </div>
            )}
          </div>

          {timeStr && (
            <div>
              <span className="mb-1.5 block text-sm font-medium text-ink">Masa *</span>
              {loadingTables ? (
                <p className="text-sm text-slate-400">Uygun masalar aranıyor…</p>
              ) : availableTables.length === 0 ? (
                <p className="text-sm text-red-600">Bu saatte / kişi sayısı için uygun masa yok. Başka bir saat deneyin.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {availableTables.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setSelectedTableId(t.id)}
                      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        selectedTableId === t.id ? 'bg-teal text-white' : 'bg-mist text-slate-600 ring-1 ring-slate-200'
                      }`}
                    >
                      {t.label} · {t.capacity} kişilik
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

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
              <span className="text-slate-500">Kişi Sayısı</span>
              <span className="font-medium text-ink">{partySize}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tarih / Saat</span>
              <span className="font-medium text-ink">
                {dateStr} · {timeStr}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-500">Tahmini Süre</span>
              <span className="font-medium text-ink">{duration} dk (+{buffer} dk buffer)</span>
            </div>
            <div className="flex justify-between border-t border-slate-100 pt-2">
              <span className="text-slate-500">Masa</span>
              <span className="font-semibold text-ink">{selectedTable?.label}</span>
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="reservation-notes">
              Not
            </label>
            <textarea
              id="reservation-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              placeholder="Özel istek vb. (opsiyonel)"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}

          <div className="flex gap-2">
            <Button variant="secondary" className="flex-1" onClick={goBack} disabled={submitting}>
              Geri
            </Button>
            <Button className="flex-1" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Kaydediliyor…' : 'Rezervasyonu Oluştur'}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  )
}
