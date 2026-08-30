import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useBusiness } from '../context/BusinessContext'
import { listCustomers, createCustomer, PAGE_SIZE } from '../services/customers'
import Card from '../components/Card'
import Button from '../components/Button'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const EMPTY_FORM = { full_name: '', phone: '', notes: '' }

export default function CustomersPage() {
  const navigate = useNavigate()
  const { activeBusinessId } = useBusiness()
  const { allowed: canCreate } = usePermission('customers.create')
  const [customers, setCustomers] = useState([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(0)
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const { data, error: err, count: total } = await listCustomers(activeBusinessId, { search, page })
    if (err) console.error('müşteriler yüklenemedi', err)
    setCustomers(data ?? [])
    setCount(total ?? 0)
    setLoading(false)
  }

  useEffect(() => {
    if (activeBusinessId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId, page])

  useEffect(() => {
    setPage(0)
    const t = setTimeout(() => {
      if (activeBusinessId) load()
    }, 300)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const openCreate = () => {
    setForm(EMPTY_FORM)
    setError('')
    setModalOpen(true)
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    const { error: err } = await createCustomer(activeBusinessId, form)
    setSubmitting(false)
    if (err) {
      setError(err.code === '23505' ? 'Bu telefon numarasıyla kayıtlı bir müşteri zaten var.' : 'Kaydedilemedi. Bilgileri kontrol edin.')
      return
    }
    setModalOpen(false)
    load()
  }

  const totalPages = Math.max(1, Math.ceil(count / PAGE_SIZE))

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Müşteriler</h1>
          <p className="mt-1 text-sm text-slate-500">{count} müşteri</p>
        </div>
        <div className="flex gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="İsim veya telefon ara…"
            className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 sm:w-64"
          />
          {canCreate && <Button onClick={openCreate}>+ Yeni Müşteri</Button>}
        </div>
      </div>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Henüz müşteriniz bulunmuyor"
              description="Yeni bir müşteri ekleyerek başlayın."
              action={canCreate && <Button onClick={openCreate}>+ Yeni Müşteri</Button>}
            />
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                    <th className="px-5 py-3 font-medium">Müşteri</th>
                    <th className="px-5 py-3 font-medium">Telefon</th>
                    <th className="px-5 py-3 font-medium">Toplam Ziyaret</th>
                    <th className="px-5 py-3 font-medium">No-show</th>
                    <th className="px-5 py-3 font-medium">Son Ziyaret</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {customers.map((c) => (
                    <tr key={c.id} className="cursor-pointer hover:bg-mist" onClick={() => navigate(`/app/customers/${c.id}`)}>
                      <td className="px-5 py-3 font-medium text-ink">{c.full_name}</td>
                      <td className="px-5 py-3 text-slate-600">{c.phone || '—'}</td>
                      <td className="px-5 py-3 text-slate-600">{c.total_visits}</td>
                      <td className="px-5 py-3 text-slate-600">{c.no_show_count}</td>
                      <td className="px-5 py-3 text-slate-500">
                        {c.last_visit_at ? new Date(c.last_visit_at).toLocaleDateString('tr-TR') : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {totalPages > 1 && (
              <div className="flex items-center justify-between border-t border-slate-100 px-5 py-3 text-sm text-slate-500">
                <span>
                  Sayfa {page + 1} / {totalPages}
                </span>
                <div className="flex gap-2">
                  <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
                    Önceki
                  </Button>
                  <Button variant="secondary" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                    Sonraki
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </Card>

      <Modal open={modalOpen} title="Yeni Müşteri" onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="customer-name" label="Ad Soyad" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input
            id="customer-phone"
            label="Telefon"
            required
            type="tel"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="0555 000 00 00"
          />
          <div>
            <label className="mb-1.5 block text-sm font-medium text-ink">Notlar</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
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
