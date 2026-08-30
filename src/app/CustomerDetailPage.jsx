import { useCallback, useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getCustomer, updateCustomer } from '../services/customers'
import { listCustomerAppointments } from '../services/appointments'
import Card from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const STATUS_LABELS = { booked: 'Onaylı', completed: 'Tamamlandı', cancelled: 'İptal', no_show: 'Gelmedi' }
const STATUS_STYLES = {
  booked: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  completed: 'bg-teal/10 text-teal-dark ring-teal/20',
  cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
  no_show: 'bg-amber-50 text-amber-700 ring-amber-600/20',
}

export default function CustomerDetailPage() {
  const { id } = useParams()
  const { allowed: canUpdate } = usePermission('customers.update')
  const [customer, setCustomer] = useState(null)
  const [history, setHistory] = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ full_name: '', phone: '', notes: '' })
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    const [{ data: customerData, error: custErr }, { data: historyData, error: histErr }] = await Promise.all([
      getCustomer(id),
      listCustomerAppointments(id),
    ])
    if (custErr) console.error('müşteri yüklenemedi', custErr)
    if (histErr) console.error('geçmiş yüklenemedi', histErr)
    setCustomer(customerData ?? null)
    if (customerData) {
      setForm({ full_name: customerData.full_name, phone: customerData.phone ?? '', notes: customerData.notes ?? '' })
    }
    setHistory(historyData ?? [])
    setLoading(false)
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  const handleSave = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: err } = await updateCustomer(id, form)
    setSubmitting(false)
    if (err) {
      setError(err.code === '23505' ? 'Bu telefonla kayıtlı başka bir müşteri var.' : 'Kaydedilemedi.')
      return
    }
    setEditing(false)
    load()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
      </div>
    )
  }

  if (!customer) {
    return <p className="text-sm text-slate-500">Müşteri bulunamadı.</p>
  }

  const completedCount = history.filter((h) => h.appointments?.status === 'completed').length
  const totalSpent = history
    .filter((h) => h.appointments?.status === 'completed')
    .reduce((sum, h) => sum + Number(h.price), 0)

  return (
    <div>
      <Link to="/app/customers" className="text-sm font-medium text-slate-500 hover:text-ink">
        ← Müşteriler
      </Link>

      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{customer.full_name}</h1>
          <p className="mt-1 text-sm text-slate-500">{customer.phone}</p>
        </div>
        {canUpdate && !editing && (
          <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Düzenle
          </Button>
        )}
      </div>

      {editing && (
        <Card className="mt-4 p-5">
          <form onSubmit={handleSave} className="space-y-4">
            <Input id="edit-customer-name" label="Ad Soyad" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
            <Input
              id="edit-customer-phone"
              label="Telefon"
              required
              type="tel"
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="edit-customer-notes">
                Notlar
              </label>
              <textarea
                id="edit-customer-notes"
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
            </div>
            {error && <p className="text-sm text-red-600">{error}</p>}
            <div className="flex gap-2">
              <Button type="button" variant="secondary" className="flex-1" onClick={() => setEditing(false)}>
                Vazgeç
              </Button>
              <Button type="submit" className="flex-1" disabled={submitting}>
                {submitting ? 'Kaydediliyor…' : 'Kaydet'}
              </Button>
            </div>
          </form>
        </Card>
      )}

      <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Toplam Ziyaret</p>
          <p className="mt-1 text-2xl font-bold text-ink">{customer.total_visits}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">No-show</p>
          <p className="mt-1 text-2xl font-bold text-ink">{customer.no_show_count}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Toplam Harcama</p>
          <p className="mt-1 text-2xl font-bold text-ink">{totalSpent.toLocaleString('tr-TR')} ₺</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Son Ziyaret</p>
          <p className="mt-1 text-lg font-bold text-ink">
            {customer.last_visit_at ? new Date(customer.last_visit_at).toLocaleDateString('tr-TR') : '—'}
          </p>
        </Card>
      </div>

      {!editing && customer.notes && (
        <Card className="mt-4 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Notlar</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-ink">{customer.notes}</p>
        </Card>
      )}

      <h2 className="mt-8 text-sm font-semibold text-ink">Randevu Geçmişi ({completedCount} tamamlanan)</h2>
      <Card className="mt-3 overflow-hidden">
        {history.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz randevu geçmişi yok" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Tarih</th>
                  <th className="px-5 py-3 font-medium">Hizmet</th>
                  <th className="px-5 py-3 font-medium">Personel</th>
                  <th className="px-5 py-3 font-medium">Tutar</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 font-medium">Kaynak</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {history.map((h) => (
                  <tr key={h.id} className="hover:bg-mist">
                    <td className="px-5 py-3 text-slate-600">
                      {new Date(h.starts_at).toLocaleDateString('tr-TR')}{' '}
                      {new Date(h.starts_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="px-5 py-3 font-medium text-ink">{h.services?.name}</td>
                    <td className="px-5 py-3 text-slate-600">{h.staff?.full_name}</td>
                    <td className="px-5 py-3 text-slate-600">{Number(h.price).toLocaleString('tr-TR')} ₺</td>
                    <td className="px-5 py-3">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[h.appointments?.status] ?? STATUS_STYLES.cancelled}`}
                      >
                        {STATUS_LABELS[h.appointments?.status] ?? h.appointments?.status}
                      </span>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{h.appointments?.source === 'vapi' ? '🤖 AI' : 'Panel'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
