import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import { cancelReservation, rescheduleReservation, checkInReservation, completeTableSession, markReservationNoShow } from '../services/restaurant'

function pad(n) {
  return String(n).padStart(2, '0')
}
function toDateTimeLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}
function timeOf(iso) {
  return new Date(iso).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })
}

export default function ReservationDetailModal({ open, onClose, onChanged, entry }) {
  const [submitting, setSubmitting] = useState('')
  const [actionError, setActionError] = useState('')
  const [rescheduling, setRescheduling] = useState(false)
  const [newStartsAt, setNewStartsAt] = useState('')
  const [rescheduleError, setRescheduleError] = useState('')

  useEffect(() => {
    setRescheduling(false)
    setRescheduleError('')
    setActionError('')
    if (entry?.starts_at) setNewStartsAt(toDateTimeLocal(new Date(entry.starts_at)))
  }, [entry])

  if (!entry) return null

  const reservation = entry.reservations
  const customer = reservation?.customers
  const status = reservation?.status

  const run = async (action) => {
    setSubmitting(action)
    setActionError('')
    let error = null
    if (action === 'cancel') {
      const reason = window.prompt('İptal nedeni (opsiyonel):') ?? ''
      ;({ error } = await cancelReservation(reservation.id, reason || null))
    } else if (action === 'check_in') {
      ;({ error } = await checkInReservation(reservation.id, entry.table_id))
    } else if (action === 'complete') {
      ;({ error } = await completeTableSession(entry.table_id))
    } else if (action === 'no_show') {
      ;({ error } = await markReservationNoShow(reservation.id))
    }
    setSubmitting('')
    if (error) {
      console.error(`reservation action "${action}" failed`, error)
      setActionError(error.message)
      return
    }
    onChanged?.()
    onClose()
  }

  const saveReschedule = async () => {
    setRescheduleError('')
    if (!newStartsAt) return
    const iso = new Date(newStartsAt).toISOString()
    if (new Date(iso) <= new Date()) {
      setRescheduleError('Geçmiş bir saate rezervasyon ertelenemez.')
      return
    }
    setSubmitting('reschedule')
    const { error } = await rescheduleReservation(reservation.id, iso)
    setSubmitting('')
    if (error) {
      setRescheduleError(error.code === '23P01' || error.message?.includes('exclu') ? 'Bu saatte masa müsait değil.' : 'Erteleme başarısız: ' + error.message)
      return
    }
    setRescheduling(false)
    onChanged?.()
    onClose()
  }

  const isUpcoming = status === 'confirmed' || status === 'pending' || status === 'arrived'
  const isSeated = status === 'seated'

  return (
    <Modal open={open} title="Rezervasyon Detayı" onClose={onClose}>
      <div className="space-y-1 text-sm">
        <p className="font-medium text-ink">{customer?.full_name}</p>
        {customer?.phone && <p className="text-slate-500">{customer.phone}</p>}
        <p className="mt-3 text-ink">
          {entry.restaurant_tables?.label} · {reservation?.party_size} kişi
        </p>
        <p className="text-slate-500">
          {new Date(entry.starts_at).toLocaleDateString('tr-TR')} {timeOf(entry.starts_at)}
          {reservation?.estimated_end_time && <> – tahmini {timeOf(reservation.estimated_end_time)}</>}
        </p>
        {reservation?.seated_at && <p className="text-slate-500">Oturdu: {timeOf(reservation.seated_at)}</p>}
        {reservation?.actual_end_time && <p className="text-slate-500">Çıkış: {timeOf(reservation.actual_end_time)}</p>}
        <p className="text-slate-500">
          Durum: <span className="font-medium text-ink">{status}</span>
          {reservation?.source === 'vapi' && <span className="ml-1 text-teal-dark">🤖 AI tarafından oluşturuldu</span>}
        </p>
        {reservation?.notes && <p className="text-slate-500">Not: {reservation.notes}</p>}
      </div>

      {isUpcoming && (
        <div className="mt-4">
          {rescheduling ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Input
                id="reschedule-reservation-datetime"
                label="Yeni Tarih ve Saat"
                type="datetime-local"
                min={toDateTimeLocal(new Date())}
                value={newStartsAt}
                onChange={(e) => setNewStartsAt(e.target.value)}
              />
              {rescheduleError && <p className="text-sm text-red-600">{rescheduleError}</p>}
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" className="flex-1" onClick={() => setRescheduling(false)} disabled={submitting === 'reschedule'}>
                  Vazgeç
                </Button>
                <Button size="sm" className="flex-1" onClick={saveReschedule} disabled={submitting === 'reschedule'}>
                  {submitting === 'reschedule' ? 'Kaydediliyor…' : 'Ertele'}
                </Button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => setRescheduling(true)} className="text-sm font-medium text-teal hover:text-teal-dark">
              Rezervasyonu Ertele
            </button>
          )}
        </div>
      )}

      {isUpcoming && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run('check_in')} disabled={Boolean(submitting)}>
            {submitting === 'check_in' ? 'İşleniyor…' : 'Check-in (Müşteri Geldi)'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => run('no_show')} disabled={Boolean(submitting)}>
            {submitting === 'no_show' ? 'İşleniyor…' : 'Gelmedi'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => run('cancel')} disabled={Boolean(submitting)}>
            {submitting === 'cancel' ? 'İşleniyor…' : 'İptal Et'}
          </Button>
        </div>
      )}

      {isSeated && (
        <div className="mt-5">
          <Button size="sm" onClick={() => run('complete')} disabled={Boolean(submitting)}>
            {submitting === 'complete' ? 'İşleniyor…' : 'Müşteri Çıktı'}
          </Button>
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
    </Modal>
  )
}
