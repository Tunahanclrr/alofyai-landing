import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useBusiness } from '../context/BusinessContext'
import { listAppointmentsForDay, getAppointmentEntryById } from '../services/appointments'
import { listStaff } from '../services/staff'
import { listServices } from '../services/services'
import Card from '../components/Card'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import BookingModal from './BookingModal'
import AppointmentDetailModal from './AppointmentDetailModal'

const WEEKDAY_LABELS = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS', 'PAZ']
const STATUS_LABELS = { booked: 'Onaylı', completed: 'Tamamlandı', cancelled: 'İptal', no_show: 'Gelmedi' }
const STATUS_STYLES = {
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  completed: 'bg-teal/10 text-teal-dark ring-teal/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  no_show: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

function AppointmentStatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status] ?? STATUS_STYLES.cancelled}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}
function startOfWeek(date) {
  const d = startOfDay(date)
  const day = (d.getDay() + 6) % 7 // Pazartesi = 0
  d.setDate(d.getDate() - day)
  return d
}
function formatDateInput(date) {
  const pad = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}
function timeLabel(iso) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export default function CalendarPage() {
  const { activeBusinessId } = useBusiness()
  const [searchParams, setSearchParams] = useSearchParams()
  const [date, setDate] = useState(() => startOfDay(new Date()))
  const [viewMode, setViewMode] = useState('list')
  const [staffFilter, setStaffFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [staff, setStaff] = useState([])
  const [services, setServices] = useState([])
  const [appointmentServices, setAppointmentServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingContext, setBookingContext] = useState(null)
  const [detailAppointment, setDetailAppointment] = useState(null)

  useEffect(() => {
    if (!activeBusinessId) return
    Promise.all([listStaff(activeBusinessId), listServices(activeBusinessId)]).then(([s, sv]) => {
      setStaff((s.data ?? []).filter((m) => m.is_active))
      setServices((sv.data ?? []).filter((svc) => svc.is_active))
    })
  }, [activeBusinessId])

  // Bir bildirime ("Yeni Randevu" push'u ya da Bildirimler sayfasındaki
  // satır) tıklanınca ?appointment=<id> ile buraya düşülür — o randevuyu şu
  // an ekranda gösterilen tarih aralığından BAĞIMSIZ olarak doğrudan getirip
  // detay modalını açar.
  useEffect(() => {
    const appointmentId = searchParams.get('appointment')
    if (!appointmentId) return
    getAppointmentEntryById(appointmentId).then(({ data, error }) => {
      if (error) console.error('bildirimden randevu açılamadı', error)
      if (data) setDetailAppointment(data)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams.get('appointment')])

  const closeDetail = () => {
    setDetailAppointment(null)
    if (searchParams.get('appointment')) {
      searchParams.delete('appointment')
      setSearchParams(searchParams, { replace: true })
    }
  }

  const rangeStart = viewMode === 'week' ? startOfWeek(date) : startOfDay(date)
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + (viewMode === 'week' ? 7 : 1))

  const loadRange = async () => {
    if (!activeBusinessId) return
    setLoading(true)
    const { data, error } = await listAppointmentsForDay(activeBusinessId, rangeStart.toISOString(), rangeEnd.toISOString())
    if (error) console.error('randevular yüklenemedi', error)
    setAppointmentServices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId, rangeStart.getTime(), viewMode])

  const filtered = useMemo(() => {
    return appointmentServices.filter((item) => {
      if (staffFilter !== 'all' && item.staff_id !== staffFilter) return false
      const status = item.appointments?.status
      if (statusFilter === 'all') return status !== 'cancelled'
      return status === statusFilter
    })
  }, [appointmentServices, staffFilter, statusFilter])

  const changeRange = (delta) => {
    const next = new Date(date)
    next.setDate(next.getDate() + delta * (viewMode === 'week' ? 7 : 1))
    setDate(startOfDay(next))
  }

  const openNewBooking = () => {
    const start = new Date(date)
    start.setHours(9, 0, 0, 0)
    setBookingContext({ staffId: staffFilter !== 'all' ? staffFilter : undefined, start })
  }

  const subtitle =
    viewMode === 'week'
      ? `${rangeStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${new Date(rangeEnd.getTime() - 86400000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })

  const readyToBook = staff.length > 0 && services.length > 0

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Randevular</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Button disabled={!readyToBook} onClick={openNewBooking}>
          + Yeni Randevu
        </Button>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Button variant="secondary" size="sm" onClick={() => changeRange(-1)}>
          ‹
        </Button>
        <Button variant="secondary" size="sm" onClick={() => setDate(startOfDay(new Date()))}>
          Bugün
        </Button>
        <Button variant="secondary" size="sm" onClick={() => changeRange(1)}>
          ›
        </Button>

        <div className="ml-1 flex rounded-lg bg-mist p-1">
          <button
            onClick={() => setViewMode('list')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'list' ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}
          >
            ☰ Liste
          </button>
          <button
            onClick={() => setViewMode('week')}
            className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors ${viewMode === 'week' ? 'bg-white shadow-sm text-ink' : 'text-slate-500'}`}
          >
            ▦ Hafta
          </button>
        </div>

        <select
          value={staffFilter}
          onChange={(e) => setStaffFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">Tüm Personel</option>
          {staff.map((s) => (
            <option key={s.id} value={s.id}>
              {s.full_name}
            </option>
          ))}
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
        >
          <option value="all">Tüm Durumlar</option>
          {Object.entries(STATUS_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="mt-4">
        {!readyToBook ? (
          <Card className="p-4">
            <EmptyState
              title="Önce personel ve hizmet ekleyin"
              description="Randevu oluşturabilmek için en az bir aktif personel ve hizmet gerekiyor."
            />
          </Card>
        ) : loading ? (
          <Card className="p-10 text-center text-sm text-slate-500">Yükleniyor…</Card>
        ) : viewMode === 'list' ? (
          <ListView items={filtered} onSelect={setDetailAppointment} />
        ) : (
          <WeekView rangeStart={rangeStart} items={filtered} onSelect={setDetailAppointment} />
        )}
      </div>

      <BookingModal
        open={Boolean(bookingContext)}
        onClose={() => setBookingContext(null)}
        onBooked={loadRange}
        staff={staff}
        services={services}
        defaultStaffId={bookingContext?.staffId}
        defaultStart={bookingContext?.start}
      />

      <AppointmentDetailModal
        open={Boolean(detailAppointment)}
        onClose={closeDetail}
        onChanged={loadRange}
        appointmentService={detailAppointment}
      />
    </div>
  )
}

function ListView({ items, onSelect }) {
  const grouped = useMemo(() => {
    const byAppointment = new Map()
    for (const item of items) {
      const id = item.appointment_id
      if (!byAppointment.has(id)) byAppointment.set(id, [])
      byAppointment.get(id).push(item)
    }
    return [...byAppointment.values()].sort((a, b) => new Date(a[0].starts_at) - new Date(b[0].starts_at))
  }, [items])

  if (grouped.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="Bu tarihte randevu yok" description="Yeni bir randevu oluşturarak başlayın." />
      </Card>
    )
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
              <th className="px-5 py-3 font-medium">Saat</th>
              <th className="px-5 py-3 font-medium">Müşteri</th>
              <th className="px-5 py-3 font-medium">Personel</th>
              <th className="px-5 py-3 font-medium">Hizmetler</th>
              <th className="px-5 py-3 font-medium">Tutar</th>
              <th className="px-5 py-3 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {grouped.map((group) => {
              const first = group[0]
              const customer = first.appointments?.customers
              const status = first.appointments?.status
              const totalPrice = group.reduce((sum, g) => sum + Number(g.price), 0)
              return (
                <tr key={first.appointment_id} className="cursor-pointer hover:bg-mist" onClick={() => onSelect(first)}>
                  <td className="px-5 py-3 font-medium text-ink">
                    {timeLabel(first.starts_at)} - {timeLabel(group[group.length - 1].ends_at)}
                  </td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{customer?.full_name}</p>
                    {customer?.phone && <p className="text-xs text-slate-500">{customer.phone}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{first.staff?.full_name}</td>
                  <td className="px-5 py-3 text-slate-600">{group.map((g) => g.services?.name).join(', ')}</td>
                  <td className="px-5 py-3 text-slate-600">{totalPrice.toLocaleString('tr-TR')} ₺</td>
                  <td className="px-5 py-3">
                    <AppointmentStatusBadge status={status} />
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

function WeekView({ rangeStart, items, onSelect }) {
  const days = useMemo(() => {
    return [...Array(7)].map((_, i) => {
      const d = new Date(rangeStart)
      d.setDate(d.getDate() + i)
      return d
    })
  }, [rangeStart])

  const byDay = useMemo(() => {
    const map = {}
    for (const item of items) {
      const key = formatDateInput(new Date(item.starts_at))
      if (!map[key]) map[key] = []
      map[key].push(item)
    }
    for (const key in map) map[key].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at))
    return map
  }, [items])

  const isToday = (d) => formatDateInput(d) === formatDateInput(new Date())

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
      {days.map((day) => {
        const key = formatDateInput(day)
        const dayItems = byDay[key] ?? []
        return (
          <Card key={key} className={`p-3 ${isToday(day) ? 'ring-2 ring-teal' : ''}`}>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{WEEKDAY_LABELS[(day.getDay() + 6) % 7]}</span>
              <span className={`text-sm font-semibold ${isToday(day) ? 'text-teal-dark' : 'text-ink'}`}>{day.getDate()}</span>
            </div>
            <div className="space-y-1.5">
              {dayItems.length === 0 ? (
                <p className="py-4 text-center text-xs text-slate-300">Boş</p>
              ) : (
                dayItems.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => onSelect(item)}
                    className="block w-full rounded-lg px-2 py-1.5 text-left text-xs transition-colors"
                    style={{ backgroundColor: (item.staff?.color || '#19b6aa') + '1a' }}
                  >
                    <span className="block font-semibold" style={{ color: item.staff?.color || '#0c8e88' }}>
                      {timeLabel(item.starts_at)}
                    </span>
                    <span className="block truncate text-ink">{item.appointments?.customers?.full_name}</span>
                    <span className="block truncate text-slate-500">{item.staff?.full_name}</span>
                  </button>
                ))
              )}
            </div>
          </Card>
        )
      })}
    </div>
  )
}
