import { useEffect, useState } from 'react'
import Modal from '../components/Modal'
import Button from '../components/Button'
import Input from '../components/Input'
import { cancelAppointment, setAppointmentStatus, updateAppointmentNotes, rescheduleAppointment } from '../services/appointments'

function pad(n) {
  return String(n).padStart(2, '0')
}
function toDateTimeLocal(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

export default function AppointmentDetailModal({ open, onClose, onChanged, appointmentService }) {
  const [submitting, setSubmitting] = useState('')
  const [actionError, setActionError] = useState('')
  const [noteDraft, setNoteDraft] = useState('')
  const [savingNote, setSavingNote] = useState(false)
  const [rescheduling, setRescheduling] = useState(false)
  const [newStartsAt, setNewStartsAt] = useState('')
  const [rescheduleError, setRescheduleError] = useState('')

  useEffect(() => {
    setNoteDraft(appointmentService?.appointments?.notes ?? '')
    setRescheduling(false)
    setRescheduleError('')
    setActionError('')
    if (appointmentService?.starts_at) {
      setNewStartsAt(toDateTimeLocal(new Date(appointmentService.starts_at)))
    }
  }, [appointmentService])

  if (!appointmentService) return null

  const appointment = appointmentService.appointments
  const customer = appointment?.customers

  const run = async (action) => {
    setSubmitting(action)
    setActionError('')
    let error = null
    if (action === 'cancel') {
      const reason = window.prompt('İptal nedeni (opsiyonel):') ?? ''
      ;({ error } = await cancelAppointment(appointment.id, reason || null))
    } else {
      ;({ error } = await setAppointmentStatus(appointment.id, action))
    }
    setSubmitting('')
    if (error) {
      console.error(`appointment action "${action}" failed`, error)
      setActionError(error.message)
      return
    }
    onChanged?.()
    onClose()
  }

  const saveNote = async () => {
    setSavingNote(true)
    await updateAppointmentNotes(appointment.id, noteDraft || null)
    setSavingNote(false)
    onChanged?.()
  }

  const saveReschedule = async () => {
    setRescheduleError('')
    if (!newStartsAt) return
    const iso = new Date(newStartsAt).toISOString()
    if (new Date(iso) <= new Date()) {
      setRescheduleError('Geçmiş bir saate randevu ertelenemez.')
      return
    }
    setSubmitting('reschedule')
    const { error } = await rescheduleAppointment(appointment.id, iso)
    setSubmitting('')
    if (error) {
      if (error.code === '23P01' || error.message?.includes('exclu')) {
        setRescheduleError('Bu saat artık müsait değil.')
      } else if (error.message?.includes('cannot_reschedule_past')) {
        setRescheduleError('Geçmiş bir saate randevu ertelenemez.')
      } else {
        setRescheduleError('Erteleme başarısız: ' + error.message)
      }
      return
    }
    setRescheduling(false)
    onChanged?.()
    onClose()
  }

  const isFinal = appointment?.status !== 'booked'

  return (
    <Modal open={open} title="Randevu Detayı" onClose={onClose}>
      <div className="space-y-1 text-sm">
        <p className="font-medium text-ink">{customer?.full_name}</p>
        {customer?.phone && <p className="text-slate-500">{customer.phone}</p>}
        <p className="mt-3 text-ink">{appointmentService.services?.name}</p>
        <p className="text-slate-500">
          {new Date(appointmentService.starts_at).toLocaleDateString('tr-TR')}{' '}
          {new Date(appointmentService.starts_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} –{' '}
          {new Date(appointmentService.ends_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' })} ·{' '}
          {appointmentService.staff?.full_name}
        </p>
        <p className="text-slate-500">
          Durum: <span className="font-medium text-ink">{appointment?.status}</span>
          {appointment?.source === 'vapi' && <span className="ml-1 text-teal-dark">🤖 AI tarafından oluşturuldu</span>}
        </p>
      </div>

      {!isFinal && (
        <div className="mt-4">
          {rescheduling ? (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <Input
                id="reschedule-datetime"
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
              Randevuyu Ertele
            </button>
          )}
        </div>
      )}

      <div className="mt-4">
        <label className="mb-1.5 block text-sm font-medium text-ink" htmlFor="appointment-note-edit">
          Not
        </label>
        <textarea
          id="appointment-note-edit"
          value={noteDraft}
          onChange={(e) => setNoteDraft(e.target.value)}
          rows={2}
          placeholder="Not ekleyin…"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
        />
        {noteDraft !== (appointment?.notes ?? '') && (
          <Button size="sm" variant="secondary" onClick={saveNote} disabled={savingNote} className="mt-2">
            {savingNote ? 'Kaydediliyor…' : 'Notu Kaydet'}
          </Button>
        )}
      </div>

      {!isFinal && (
        <div className="mt-5 flex flex-wrap gap-2">
          <Button size="sm" onClick={() => run('completed')} disabled={Boolean(submitting)}>
            {submitting === 'completed' ? 'İşleniyor…' : 'Tamamlandı'}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => run('no_show')} disabled={Boolean(submitting)}>
            {submitting === 'no_show' ? 'İşleniyor…' : 'Gelmedi'}
          </Button>
          <Button size="sm" variant="danger" onClick={() => run('cancel')} disabled={Boolean(submitting)}>
            {submitting === 'cancel' ? 'İşleniyor…' : 'İptal Et'}
          </Button>
        </div>
      )}

      {actionError && <p className="mt-3 text-sm text-red-600">{actionError}</p>}
    </Modal>
  )
}
