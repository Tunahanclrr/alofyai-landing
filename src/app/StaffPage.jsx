import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { listStaff, createStaff, updateStaff, setStaffActive, setStaffServices } from '../services/staff'
import { listServices } from '../services/services'
import Card from '../components/Card'
import Button from '../components/Button'
import Badge from '../components/Badge'
import Modal from '../components/Modal'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import { usePermission } from '../hooks/usePermission'

const EMPTY_FORM = { full_name: '', phone: '', email: '' }

export default function StaffPage() {
  const { activeBusinessId } = useBusiness()
  const { allowed: canManage } = usePermission('staff.manage')
  const [staff, setStaff] = useState([])
  const [services, setServicesList] = useState([])
  const [loading, setLoading] = useState(true)
  const [modalOpen, setModalOpen] = useState(false)
  const [editing, setEditing] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [selectedServices, setSelectedServices] = useState([])
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const load = async () => {
    setLoading(true)
    const [{ data: staffData, error: staffErr }, { data: servicesData }] = await Promise.all([
      listStaff(activeBusinessId),
      listServices(activeBusinessId),
    ])
    if (staffErr) console.error('personeller yüklenemedi', staffErr)
    setStaff(staffData ?? [])
    setServicesList(servicesData ?? [])
    setLoading(false)
  }

  useEffect(() => {
    if (activeBusinessId) load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeBusinessId])

  const openCreate = () => {
    setEditing(null)
    setForm(EMPTY_FORM)
    setSelectedServices([])
    setError('')
    setModalOpen(true)
  }

  const openEdit = (member) => {
    setEditing(member)
    setForm({ full_name: member.full_name, phone: member.phone ?? '', email: member.email ?? '' })
    setSelectedServices((member.staff_services ?? []).map((s) => s.service_id))
    setError('')
    setModalOpen(true)
  }

  const toggleService = (serviceId) => {
    setSelectedServices((current) => (current.includes(serviceId) ? current.filter((id) => id !== serviceId) : [...current, serviceId]))
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setSubmitting(true)
    setError('')

    const { data: saved, error: err } = editing
      ? await updateStaff(editing.id, form)
      : await createStaff(activeBusinessId, form)

    if (err) {
      setSubmitting(false)
      setError('Kaydedilemedi. Bilgileri kontrol edin.')
      return
    }

    const staffId = saved.id
    const { error: servicesErr } = await setStaffServices(activeBusinessId, staffId, selectedServices)
    setSubmitting(false)
    if (servicesErr) {
      setError('Personel kaydedildi ama hizmet ataması başarısız oldu.')
      return
    }

    setModalOpen(false)
    load()
  }

  const toggleActive = async (member) => {
    await setStaffActive(member.id, !member.is_active)
    load()
  }

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Personeller</h1>
          <p className="mt-1 text-sm text-slate-500">Ekibiniz ve hangi hizmetleri yapabildikleri.</p>
        </div>
        {canManage && <Button onClick={openCreate}>+ Yeni Personel</Button>}
      </div>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(3)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : staff.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Henüz personel eklenmemiş"
              description="Randevu ataması yapabilmek için en az bir personel eklemelisiniz."
              action={canManage && <Button onClick={openCreate}>+ Yeni Personel</Button>}
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Personel</th>
                  <th className="px-5 py-3 font-medium">Telefon</th>
                  <th className="px-5 py-3 font-medium">Yaptığı Hizmet Sayısı</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  {canManage && <th className="px-5 py-3" />}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {staff.map((s) => (
                  <tr key={s.id} className="hover:bg-mist">
                    <td className="px-5 py-3 font-medium text-ink">{s.full_name}</td>
                    <td className="px-5 py-3 text-slate-600">{s.phone || '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{(s.staff_services ?? []).length}</td>
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

      <Modal open={modalOpen} title={editing ? 'Personeli Düzenle' : 'Yeni Personel'} onClose={() => setModalOpen(false)}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input id="staff-name" label="Ad Soyad" required value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          <Input id="staff-phone" label="Telefon" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="0555 000 00 00" />
          <Input id="staff-email" label="E-posta" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} />

          <div>
            <span className="mb-1.5 block text-sm font-medium text-ink">Yapabildiği Hizmetler</span>
            {services.length === 0 ? (
              <p className="text-sm text-slate-500">Önce Hizmetler sayfasından hizmet ekleyin.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {services.map((svc) => (
                  <button
                    type="button"
                    key={svc.id}
                    onClick={() => toggleService(svc.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      selectedServices.includes(svc.id) ? 'bg-teal text-white' : 'bg-mist text-slate-600 ring-1 ring-slate-200'
                    }`}
                  >
                    {svc.name}
                  </button>
                ))}
              </div>
            )}
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
