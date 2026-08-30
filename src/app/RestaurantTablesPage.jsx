import { useEffect, useMemo, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import {
  listTables,
  createTable,
  updateTable,
  setTableActive,
  setTableStatus,
  listTableAreas,
  createTableArea,
  listActiveSessions,
  completeTableSession,
  markTableCleaned,
} from '../services/restaurant'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const STATUS_META = {
  available: { label: 'Boş', dot: 'bg-emerald-500', card: 'border-emerald-200 bg-emerald-50/40' },
  reserved: { label: 'Rezerve', dot: 'bg-amber-500', card: 'border-amber-200 bg-amber-50/40' },
  occupied: { label: 'Dolu', dot: 'bg-red-500', card: 'border-red-200 bg-red-50/40' },
  cleaning: { label: 'Temizlik', dot: 'bg-blue-500', card: 'border-blue-200 bg-blue-50/40' },
  blocked: { label: 'Kapalı', dot: 'bg-slate-400', card: 'border-slate-200 bg-slate-50' },
}

const EMPTY_FORM = { label: '', capacity: 4, area_id: '', features: [], notes: '' }

const FEATURE_OPTIONS = [
  { value: 'window', label: 'Cam Kenarı' },
  { value: 'terrace', label: 'Teras' },
  { value: 'outdoor', label: 'Dış Mekan' },
  { value: 'indoor', label: 'İç Mekan' },
  { value: 'quiet', label: 'Sessiz' },
  { value: 'bar', label: 'Bar Kenarı' },
  { value: 'booth', label: 'Loca' },
  { value: 'high_chair', label: 'Çocuk Sandalyesi' },
  { value: 'accessible', label: 'Engelli Erişimi' },
  { value: 'smoking', label: 'Sigara İçilen' },
  { value: 'non_smoking', label: 'Sigara İçilmeyen' },
  { value: 'corner', label: 'Köşe Masa' },
]

function elapsed(startedAt, nowMs) {
  const mins = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 60000))
  const h = Math.floor(mins / 60)
  const m = mins % 60
  return h > 0 ? `${h}s ${m}dk` : `${m}dk`
}

export default function RestaurantTablesPage() {
  const { activeBusinessId } = useBusiness()
  const { allowed: canManage } = usePermission('settings.manage')
  const [tables, setTables] = useState([])
  const [areas, setAreas] = useState([])
  const [sessions, setSessions] = useState([])
  const [loading, setLoading] = useState(true)
  const [now, setNow] = useState(Date.now())

  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const [areaModalOpen, setAreaModalOpen] = useState(false)
  const [areaName, setAreaName] = useState('')
  const [areaSubmitting, setAreaSubmitting] = useState(false)
  const [areaError, setAreaError] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: tableData, error: err }, { data: areaData }, { data: sessionData }] = await Promise.all([
      listTables(activeBusinessId),
      listTableAreas(activeBusinessId),
      listActiveSessions(activeBusinessId),
    ])
    if (err) console.error('masalar yüklenemedi', err)
    setTables(tableData ?? [])
    setAreas(areaData ?? [])
    setSessions(sessionData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (activeBusinessId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId])

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000)
    return () => clearInterval(t)
  }, [])

  const sessionByTable = useMemo(() => Object.fromEntries(sessions.map((s) => [s.table_id, s])), [sessions])

  const openCreate = () => {
    setEditing(null)
    setForm({ ...EMPTY_FORM, area_id: areas[0]?.id ?? '' })
    setError('')
    setModalOpen(true)
  }

  const openEdit = (table) => {
    setEditing(table)
    setForm({
      label: table.label,
      capacity: table.capacity,
      area_id: table.area_id ?? '',
      features: table.features ?? [],
      notes: table.notes ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  const toggleFeature = (value) => {
    setForm((f) => ({
      ...f,
      features: f.features.includes(value) ? f.features.filter((v) => v !== value) : [...f.features, value],
    }))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const payload = {
      label: form.label,
      capacity: Number(form.capacity),
      area_id: form.area_id || null,
      features: form.features,
      notes: form.notes || null,
    }
    const { error: err } = editing ? await updateTable(editing.id, payload) : await createTable(activeBusinessId, payload)
    setSubmitting(false)
    if (err) {
      setError('Kaydedilemedi. Bilgileri kontrol edin.')
      return
    }
    setModalOpen(false)
    load()
  }

  const handleCreateArea = async (event) => {
    event.preventDefault()
    setAreaSubmitting(true)
    setAreaError('')
    const { error: err } = await createTableArea(activeBusinessId, areaName)
    setAreaSubmitting(false)
    if (err) {
      console.error('kategori oluşturulamadı', err)
      setAreaError('Kategori oluşturulamadı: ' + err.message)
      return
    }
    setAreaName('')
    setAreaModalOpen(false)
    load()
  }

  const toggleActive = async (table) => {
    const { error: err } = await setTableActive(table.id, !table.is_active)
    if (err) console.error('masa durumu güncellenemedi', err)
    load()
  }

  const handleComplete = async (table) => {
    const { error: err } = await completeTableSession(table.id)
    if (err) {
      console.error('oturum tamamlanamadı', err)
      window.alert('Masa kapatılamadı: ' + err.message)
      return
    }
    load()
  }

  const handleCleaned = async (table) => {
    const { error: err } = await markTableCleaned(table.id)
    if (err) {
      console.error('masa temizlik durumu güncellenemedi', err)
      window.alert('Temizlik tamamlanamadı: ' + err.message)
      return
    }
    load()
  }

  const toggleBlocked = async (table) => {
    const { error: err } = await setTableStatus(table.id, table.status === 'blocked' ? 'available' : 'blocked')
    if (err) {
      console.error('masa durumu güncellenemedi', err)
      window.alert('İşlem başarısız: ' + err.message)
      return
    }
    load()
  }

  const grouped = useMemo(() => {
    const byArea = areas.map((a) => ({ ...a, tables: tables.filter((t) => t.area_id === a.id) }))
    const noArea = tables.filter((t) => !t.area_id)
    return { byArea, noArea }
  }, [areas, tables])

  const TableCard = ({ table }) => {
    const meta = STATUS_META[table.status] ?? STATUS_META.available
    const session = sessionByTable[table.id]
    return (
      <Card className={`border p-4 text-center ${meta.card}`}>
        <p className="text-lg font-bold text-ink">{table.label}</p>
        <p className="text-xs text-slate-500">{table.capacity} Kişilik</p>
        <p className="mt-2 inline-flex items-center gap-1.5 text-xs font-semibold text-ink">
          <span className={`h-2 w-2 rounded-full ${meta.dot}`} /> {meta.label}
        </p>
        {table.features?.length > 0 && (
          <p className="mt-1 text-[11px] text-slate-400">
            {table.features.map((f) => FEATURE_OPTIONS.find((o) => o.value === f)?.label ?? f).join(' · ')}
          </p>
        )}
        {table.status === 'occupied' && session && (
          <p className="mt-1 text-[11px] text-slate-500">
            {session.party_size} kişi · {elapsed(session.started_at, now)}
          </p>
        )}

        {table.status === 'occupied' && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => handleComplete(table)}>
            Müşteri Çıktı
          </Button>
        )}
        {table.status === 'cleaning' && (
          <Button size="sm" variant="secondary" className="mt-3 w-full" onClick={() => handleCleaned(table)}>
            Temizlik Bitti
          </Button>
        )}
        {canManage && (
          <div className="mt-2 flex flex-wrap justify-center gap-x-3 gap-y-1 text-[11px]">
            <button onClick={() => openEdit(table)} className="font-medium text-teal hover:text-teal-dark">
              Düzenle
            </button>
            {(table.status === 'available' || table.status === 'blocked') && (
              <button onClick={() => toggleBlocked(table)} className="font-medium text-slate-500 hover:text-ink">
                {table.status === 'blocked' ? 'Kapatmayı Kaldır' : 'Kapat'}
              </button>
            )}
            <button onClick={() => toggleActive(table)} className="font-medium text-slate-500 hover:text-ink">
              {table.is_active ? 'Pasifleştir' : 'Aktifleştir'}
            </button>
          </div>
        )}
      </Card>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Masalar</h1>
          <p className="mt-1 text-sm text-slate-500">Restoranınızın masa düzeni ve anlık durumu.</p>
        </div>
        {canManage && (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setAreaError('')
                setAreaName('')
                setAreaModalOpen(true)
              }}
            >
              + Kategori
            </Button>
            <Button onClick={openCreate}>+ Yeni Masa</Button>
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-500">
        {Object.entries(STATUS_META).map(([key, s]) => (
          <span key={key} className="inline-flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${s.dot}`} /> {s.label}
          </span>
        ))}
      </div>

      {loading ? (
        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : tables.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            title="Henüz masa eklenmemiş"
            description="Rezervasyon alabilmek için en az bir masa eklemelisiniz."
            action={canManage && <Button onClick={openCreate}>+ Yeni Masa</Button>}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-8">
          {grouped.byArea.map(
            (area) =>
              area.tables.length > 0 && (
                <div key={area.id}>
                  <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">{area.name}</h2>
                  <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                    {area.tables.map((t) => (
                      <TableCard key={t.id} table={t} />
                    ))}
                  </div>
                </div>
              )
          )}
          {grouped.noArea.length > 0 && (
            <div>
              <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Kategorisiz</h2>
              <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
                {grouped.noArea.map((t) => (
                  <TableCard key={t.id} table={t} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      <Modal open={modalOpen} title={editing ? 'Masayı Düzenle' : 'Yeni Masa'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="table-label" label="Masa Adı / No" required value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Örn. Masa 4" />
          <Input id="table-capacity" label="Kapasite" type="number" min={1} required value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value })} />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="table-area">
              Kategori / Bölge
            </label>
            {areas.length === 0 ? (
              <p className="text-sm text-slate-500">Önce “+ Kategori” ile bir bölge ekleyin (Bahçe, Balkon vb.).</p>
            ) : (
              <select
                id="table-area"
                value={form.area_id}
                onChange={(e) => setForm({ ...form, area_id: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              >
                <option value="">Kategorisiz</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Masa Özellikleri</label>
            <p className="mb-2 text-xs text-slate-500">
              AI telefonda müşteri &quot;cam kenarı&quot;, &quot;teras&quot; gibi bir tercih belirttiğinde buradaki özelliklere göre masa önerir.
            </p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3">
              {FEATURE_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex items-center gap-1.5 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={form.features.includes(opt.value)}
                    onChange={() => toggleFeature(opt.value)}
                    className="h-4 w-4 rounded border-slate-300 text-teal focus:ring-teal/20"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="table-notes">
              Masa Notu
            </label>
            <textarea
              id="table-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Personele özel not (örn. 'prizin yanında') — müşteriye söylenmez"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Modal>

      <Modal open={areaModalOpen} title="Yeni Kategori" onClose={() => setAreaModalOpen(false)}>
        <form onSubmit={handleCreateArea} className="space-y-4">
          <Input id="area-name" label="Kategori Adı" required value={areaName} onChange={(e) => setAreaName(e.target.value)} placeholder="Örn. Bahçe, Balkon, İç Salon" />
          {areaError && <p className="text-sm text-red-600">{areaError}</p>}
          <Button type="submit" disabled={areaSubmitting} className="w-full">
            {areaSubmitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
