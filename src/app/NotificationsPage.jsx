import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { usePermission } from '../hooks/usePermission'
import { usePushSubscription } from '../hooks/usePushSubscription'
import { listNotifications, sendManualNotification } from '../services/notifications'
import Card from '../components/Card'
import Button from '../components/Button'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

const TYPE_LABELS = {
  'reservation.created': 'Yeni Rezervasyon',
  'appointment.created': 'Yeni Randevu',
  manual: 'Elle Gönderilen',
}

// Badge bileşeninin hazır `status` renkleri (trial/active/suspended...)
// işletme durumuna özel — bildirim durumu farklı bir sözlük olduğu için
// burada kendi renk sınıflarımızı tanımlıyoruz, Badge'i sadece children
// modunda kullanıyoruz.
const STATUS_BADGE = {
  sent: { label: 'Gönderildi', className: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20' },
  failed: { label: 'Gönderilemedi', className: 'bg-red-50 text-red-700 ring-red-600/20' },
  no_subscribers: { label: 'Abone Yok', className: 'bg-amber-50 text-amber-700 ring-amber-600/20' },
  pending: { label: 'Bekliyor', className: 'bg-mist text-ink ring-slate-200' },
}

function StatusPill({ status }) {
  const info = STATUS_BADGE[status] ?? { label: status, className: 'bg-mist text-ink ring-slate-200' }
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${info.className}`}>
      {info.label}
    </span>
  )
}

export default function NotificationsPage() {
  const { activeBusinessId } = useBusiness()
  const { allowed: canSendManual } = usePermission('settings.manage')
  const { supported, enabled, loading: pushLoading, error: pushError, subscribe, unsubscribe } = usePushSubscription()

  const [notifications, setNotifications] = useState([])
  const [loading, setLoading] = useState(true)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [sending, setSending] = useState(false)
  const [sendError, setSendError] = useState('')
  const [sendSuccess, setSendSuccess] = useState(false)

  const loadNotifications = () => {
    if (!activeBusinessId) return
    setLoading(true)
    listNotifications(activeBusinessId).then(({ data, error }) => {
      if (error) console.error('bildirimler yüklenemedi', error)
      setNotifications(data ?? [])
      setLoading(false)
    })
  }

  useEffect(loadNotifications, [activeBusinessId])

  const handleSend = async (e) => {
    e.preventDefault()
    if (!title.trim() || !body.trim()) return
    setSending(true)
    setSendError('')
    setSendSuccess(false)
    const { error } = await sendManualNotification(activeBusinessId, title, body)
    setSending(false)
    if (error) {
      setSendError('Bildirim gönderilemedi, lütfen tekrar deneyin.')
      return
    }
    setTitle('')
    setBody('')
    setSendSuccess(true)
    loadNotifications()
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Bildirimler</h1>
      <p className="mt-1 text-sm text-slate-500">
        Yeni rezervasyon/randevu geldiğinde anında bildirim alın — uygulama kapalıyken bile.
      </p>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">Bu Cihazda Bildirimler</p>
            <p className="mt-0.5 text-xs text-slate-500">
              {!supported
                ? 'Bu tarayıcı push bildirimi desteklemiyor.'
                : enabled
                  ? 'Açık — bu cihaz yeni rezervasyon/randevularda anında bildirim alacak.'
                  : 'Kapalı — açmak için izin vermeniz gerekiyor.'}
            </p>
          </div>
          {supported && !pushLoading && (
            <Button variant={enabled ? 'secondary' : 'primary'} size="sm" onClick={enabled ? unsubscribe : subscribe}>
              {enabled ? 'Bildirimleri Kapat' : 'Bildirimleri Aç'}
            </Button>
          )}
        </div>
        {pushError && <p className="mt-2 text-xs text-red-600">{pushError}</p>}
        {supported && (
          <p className="mt-3 border-t border-slate-100 pt-3 text-xs text-slate-400">
            iPhone&apos;da çalışması için önce bu sayfayı Safari&apos;de &quot;Ana Ekrana Ekle&quot; ile ekleyip oradan açmanız
            gerekir — Android ve bilgisayarda ek bir adım gerekmez.
          </p>
        )}
      </Card>

      {canSendManual && (
        <Card className="mt-4 p-4">
          <p className="text-sm font-medium text-ink">Manuel Bildirim Gönder</p>
          <p className="mt-0.5 text-xs text-slate-500">Bildirimlere abone tüm cihazlara anında gönderilir.</p>
          <form onSubmit={handleSend} className="mt-3 space-y-3">
            <Input label="Başlık" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Örn. Bugün erken kapanıyoruz" />
            <div>
              <label className="mb-1.5 block text-sm font-medium text-ink">Mesaj</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={3}
                placeholder="Bildirim metni"
                className="w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm text-ink placeholder:text-slate-400 focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
              />
            </div>
            <div className="flex items-center gap-3">
              <Button type="submit" size="sm" disabled={sending || !title.trim() || !body.trim()}>
                {sending ? 'Gönderiliyor…' : 'Gönder'}
              </Button>
              {sendSuccess && <span className="text-sm font-medium text-teal-dark">Gönderildi.</span>}
              {sendError && <span className="text-sm text-red-600">{sendError}</span>}
            </div>
          </form>
        </Card>
      )}

      <Card className="mt-4 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : notifications.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz bildirim yok" description="Yeni bir rezervasyon/randevu geldiğinde burada görünecek." />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div key={n.id} className="flex items-start justify-between gap-3 px-5 py-3.5">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{TYPE_LABELS[n.type] ?? n.type}</p>
                  <p className="mt-0.5 text-sm font-medium text-ink">{n.title}</p>
                  <p className="mt-0.5 text-sm text-slate-600">{n.body}</p>
                  <p className="mt-1 text-xs text-slate-400">{new Date(n.created_at).toLocaleString('tr-TR')}</p>
                </div>
                <StatusPill status={n.status} />
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  )
}
