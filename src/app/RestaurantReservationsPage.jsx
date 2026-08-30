import { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { listReservationsForRange, listTables } from '../services/restaurant'
import Card from '../components/Card'
import Button from '../components/Button'
import EmptyState from '../components/EmptyState'
import ReservationModal from './ReservationModal'
import ReservationDetailModal from './ReservationDetailModal'

const WEEKDAY_LABELS = ['PZT', 'SAL', 'ÇAR', 'PER', 'CUM', 'CTS', 'PAZ']
const STATUS_LABELS = {
  pending: 'Bekliyor',
  confirmed: 'Onaylı',
  arrived: 'Geldi',
  seated: 'Oturdu',
  completed: 'Tamamlandı',
  cancelled: 'İptal',
  no_show: 'Gelmedi',
}
const STATUS_STYLES = {
  pending: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  confirmed: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  arrived: 'bg-indigo-50 text-indigo-700 ring-indigo-600/20',
  seated: 'bg-blue-50 text-blue-700 ring-blue-600/20',
  completed: 'bg-teal/10 text-teal-dark ring-teal/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  no_show: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

function StatusBadge({ status }) {
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
  const day = (d.getDay() + 6) % 7
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

export default function RestaurantReservationsPage() {
  const { activeBusinessId } = useBusiness()
  const [date, setDate] = useState(() => startOfDay(new Date()))
  const [viewMode, setViewMode] = useState('list')
  const [tableFilter, setTableFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState('all')
  const [tables, setTables] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [bookingOpen, setBookingOpen] = useState(false)
  const [detailEntry, setDetailEntry] = useState(null)

  useEffect(() => {
    if (!activeBusinessId) return
    listTables(activeBusinessId).then(({ data }) => setTables((data ?? []).filter((t) => t.is_active)))
  }, [activeBusinessId])

  const rangeStart = viewMode === 'week' ? startOfWeek(date) : startOfDay(date)
  const rangeEnd = new Date(rangeStart)
  rangeEnd.setDate(rangeEnd.getDate() + (viewMode === 'week' ? 7 : 1))

  const loadRange = async () => {
    if (!activeBusinessId) return
    setLoading(true)
    const { data, error } = await listReservationsForRange(activeBusinessId, rangeStart.toISOString(), rangeEnd.toISOString())
    if (error) console.error('rezervasyonlar yüklenemedi', error)
    setEntries(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    loadRange()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId, rangeStart.getTime(), viewMode])

  const filtered = useMemo(() => {
    return entries.filter((item) => {
      if (tableFilter !== 'all' && item.table_id !== tableFilter) return false
      const status = item.reservations?.status
      if (statusFilter === 'all') return status !== 'cancelled'
      return status === statusFilter
    })
  }, [entries, tableFilter, statusFilter])

  const changeRange = (delta) => {
    const next = new Date(date)
    next.setDate(next.getDate() + delta * (viewMode === 'week' ? 7 : 1))
    setDate(startOfDay(next))
  }

  const subtitle =
    viewMode === 'week'
      ? `${rangeStart.toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })} - ${new Date(rangeEnd.getTime() - 86400000).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', year: 'numeric' })}`
      : date.toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' })

  const readyToBook = tables.length > 0

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Rezervasyonlar</h1>
          <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
        </div>
        <Button disabled={!readyToBook} onClick={() => setBookingOpen(true)}>
          + Yeni Rezervasyon
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

        <select value={tableFilter} onChange={(e) => setTableFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
          <option value="all">Tüm Masalar</option>
          {tables.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>

        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm">
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
            <EmptyState title="Önce masa ekleyin" description="Rezervasyon alabilmek için en az bir masa gerekiyor." />
          </Card>
        ) : loading ? (
          <Card className="p-10 text-center text-sm text-slate-500">Yükleniyor…</Card>
        ) : viewMode === 'list' ? (
          <ListView items={filtered} onSelect={setDetailEntry} />
        ) : (
          <WeekView rangeStart={rangeStart} items={filtered} onSelect={setDetailEntry} />
        )}
      </div>

      <ReservationModal open={bookingOpen} onClose={() => setBookingOpen(false)} onBooked={loadRange} defaultStart={date} />
      <ReservationDetailModal open={Boolean(detailEntry)} onClose={() => setDetailEntry(null)} onChanged={loadRange} entry={detailEntry} />
    </div>
  )
}

function ListView({ items, onSelect }) {
  const sorted = useMemo(() => [...items].sort((a, b) => new Date(a.starts_at) - new Date(b.starts_at)), [items])

  if (sorted.length === 0) {
    return (
      <Card className="p-4">
        <EmptyState title="Bu tarihte rezervasyon yok" description="Yeni bir rezervasyon oluşturarak başlayın." />
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
              <th className="px-5 py-3 font-medium">Masa</th>
              <th className="px-5 py-3 font-medium">Kişi</th>
              <th className="px-5 py-3 font-medium">Durum</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {sorted.map((item) => {
              const customer = item.reservations?.customers
              const status = item.reservations?.status
              return (
                <tr key={item.id} className="cursor-pointer hover:bg-mist" onClick={() => onSelect(item)}>
                  <td className="px-5 py-3 font-medium text-ink">{timeLabel(item.starts_at)}</td>
                  <td className="px-5 py-3">
                    <p className="font-medium text-ink">{customer?.full_name}</p>
                    {customer?.phone && <p className="text-xs text-slate-500">{customer.phone}</p>}
                  </td>
                  <td className="px-5 py-3 text-slate-600">{item.restaurant_tables?.label}</td>
                  <td className="px-5 py-3 text-slate-600">{item.reservations?.party_size}</td>
                  <td className="px-5 py-3">
                    <StatusBadge status={status} />
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
  const days = useMemo(() => [...Array(7)].map((_, i) => {
    const d = new Date(rangeStart)
    d.setDate(d.getDate() + i)
    return d
  }), [rangeStart])

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
                  <button key={item.id} onClick={() => onSelect(item)} className="block w-full rounded-lg bg-teal/10 px-2 py-1.5 text-left text-xs">
                    <span className="block font-semibold text-teal-dark">{timeLabel(item.starts_at)}</span>
                    <span className="block truncate text-ink">{item.reservations?.customers?.full_name}</span>
                    <span className="block truncate text-slate-500">
                      {item.restaurant_tables?.label} · {item.reservations?.party_size} kişi
                    </span>
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
