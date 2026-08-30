import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { listServices, createService, updateService, setServiceActive } from '../services/services'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const EMPTY_FORM = { name: '', duration_minutes: 30, price: 0, buffer_minutes: 0, notes: '' }

export default function ServicesPage() {
  const { activeBusinessId } = useBusiness()
  const { allowed: canManage } = usePermission('services.manage')
  const [services, setServices] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: err } = await listServices(activeBusinessId)
    if (err) console.error('hizmetler yüklenemedi', err)
    setServices(data ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (activeBusinessId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const openEdit = (service) => {
    setEditing(service)
    setForm({
      name: service.name,
      duration_minutes: service.duration_minutes,
      price: service.price,
      buffer_minutes: service.buffer_minutes,
      notes: service.notes ?? '',
    })
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const payload = {
      name: form.name,
      duration_minutes: Number(form.duration_minutes),
      price: Number(form.price),
      buffer_minutes: Number(form.buffer_minutes),
      notes: form.notes || null,
    }
    const { error: err } = editing ? await updateService(editing.id, payload) : await createService(activeBusinessId, payload)
    setSubmitting(false)
    if (err) {
      setError('Kaydedilemedi. Bilgileri kontrol edin.')
      return
    }
    setModalOpen(false)
    load()
  }

  const toggleActive = async (service) => {
    await setServiceActive(service.id, !service.is_active)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Hizmetler</h1>
          <p className="mt-1 text-sm text-slate-500">Salonunuzda sunulan hizmetler ve süreleri.</p>
        </div>
        {canManage && <Button onClick={openCreate}>+ Yeni Hizmet</Button>}
      </div>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : services.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Henüz hizmet eklenmemiş"
              description="Randevu alabilmek için en az bir hizmet eklemelisiniz."
              action={canManage && <Button onClick={openCreate}>+ Yeni Hizmet</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Hizmet</th>
                  <th className="px-5 py-3 font-medium">Süre</th>
                  <th className="px-5 py-3 font-medium">Fiyat</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {services.map((s) => (
                  <tr key={s.id} className="hover:bg-mist">
                    <td className="px-5 py-3 font-medium text-ink">{s.name}</td>
                    <td className="px-5 py-3 text-slate-600">{s.duration_minutes} dk</td>
                    <td className="px-5 py-3 text-slate-600">{Number(s.price).toLocaleString('tr-TR')} ₺</td>
                    <td className="px-5 py-3">
                      <Badge status={s.is_active ? 'active' : 'cancelled'}>{s.is_active ? 'Aktif' : 'Pasif'}</Badge>
                    </td>
                    {canManage && (
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => openEdit(s)} className="mr-3 text-sm font-medium text-teal hover:text-teal-dark">
                          Düzenle
                        </button>
                        <button onClick={() => toggleActive(s)} className="text-sm font-medium text-slate-500 hover:text-ink">
                          {s.is_active ? 'Pasifleştir' : 'Aktifleştir'}
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} title={editing ? 'Hizmeti Düzenle' : 'Yeni Hizmet'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="service-name" label="Hizmet Adı" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <div className="grid grid-cols-2 gap-3">
            <Input
              id="service-duration"
              label="Süre (dk)"
              type="number"
              min={5}
              required
              value={form.duration_minutes}
              onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            />
            <Input
              id="service-price"
              label="Fiyat (₺)"
              type="number"
              min={0}
              step="0.01"
              required
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value })}
            />
          </div>
          <Input
            id="service-buffer"
            label="Ara Süre / Buffer (dk)"
            type="number"
            min={0}
            value={form.buffer_minutes}
            onChange={(e) => setForm({ ...form, buffer_minutes: e.target.value })}
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="service-notes">
              Not
            </label>
            <textarea
              id="service-notes"
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="Personele veya ekibe özel not (opsiyonel)"
              className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <Button type="submit" disabled={submitting} className="w-full">
            {submitting ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
        </form>
      </Modal>
    </div>
  )
}
