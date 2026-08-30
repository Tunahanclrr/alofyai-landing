import { useEffect, useState } from 'react'
import { listCalls, getCallToolInvocations, describeToolInvocation, formatEndReason } from '../services/vapi'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

const STATUS_LABELS = { started: 'Başladı', in_progress: 'Devam Ediyor', ended: 'Sona Erdi' }
const DIRECTION_LABELS = { inbound: 'Gelen', outbound: 'Giden' }

function formatDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}dk ${s}sn`
}

function callerName(call) {
  return call.customers?.full_name ?? call.caller_number ?? '—'
}
function callerPhone(call) {
  return call.customers?.phone ?? call.caller_number ?? '—'
}

export default function CallsPage() {
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedCall, setSelectedCall] = useState(null)
  const [invocations, setInvocations] = useState([])
  const [invocationsLoading, setInvocationsLoading] = useState(false)
  const [showRaw, setShowRaw] = useState(false)

  useEffect(() => {
    let active = true
    listCalls().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('çağrılar yüklenemedi', error)
      setCalls(data ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  const openDetails = async (call) => {
    setSelectedCall(call)
    setShowRaw(false)
    setInvocationsLoading(true)
    const { data, error } = await getCallToolInvocations(call.id)
    if (error) console.error('çağrı detayları yüklenemedi', error)
    setInvocations(data ?? [])
    setInvocationsLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Çağrılar</h1>
      <p className="mt-1 text-sm text-slate-500">Platform genelindeki AI telefon görüşmeleri. Bir satıra tıklayarak detayları görün.</p>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz çağrı yok" description="AI hattı aktifleştirilip ilk arama geldiğinde burada görünecek." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Müşteri</th>
                  <th className="px-5 py-3 font-medium">Yön</th>
                  <th className="px-5 py-3 font-medium">Süre</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {calls.map((call) => (
                  <tr key={call.id} className="cursor-pointer hover:bg-mist" onClick={() => openDetails(call)}>
                    <td className="px-5 py-3 font-medium text-ink">{call.businesses?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{callerName(call)}</td>
                    <td className="px-5 py-3 text-slate-600">{DIRECTION_LABELS[call.direction] ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{formatDuration(call.duration_seconds)}</td>
                    <td className="px-5 py-3">
                      <Badge>{STATUS_LABELS[call.status] ?? call.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{new Date(call.created_at).toLocaleString('tr-TR')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={Boolean(selectedCall)} title="Çağrı Detayı" onClose={() => setSelectedCall(null)} width="max-w-xl">
        {selectedCall && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div>
                <p className="text-xs text-slate-400">İşletme</p>
                <p className="font-medium text-ink">{selectedCall.businesses?.name ?? '—'}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Müşteri</p>
                <p className="font-medium text-ink">{callerName(selectedCall)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Telefon</p>
                <p className="font-medium text-ink">{callerPhone(selectedCall)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Süre</p>
                <p className="font-medium text-ink">{formatDuration(selectedCall.duration_seconds)}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Bitiş Nedeni</p>
                <p className="font-medium text-ink">{formatEndReason(selectedCall.end_reason)}</p>
              </div>
            </div>

            {selectedCall.recording_url && (
              <a
                href={selectedCall.recording_url}
                target="_blank"
                rel="noreferrer"
                className="text-sm font-medium text-teal-dark hover:underline"
              >
                Kaydı Dinle →
              </a>
            )}

            {selectedCall.summary && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Görüşme Özeti</p>
                <p className="mt-1 text-sm text-ink">{selectedCall.summary}</p>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Fonksiyon Çağrıları</p>
                {invocations.length > 0 && (
                  <button type="button" onClick={() => setShowRaw((v) => !v)} className="text-xs font-medium text-teal-dark hover:underline">
                    {showRaw ? 'Okunabilir görünüm' : 'Ham veriyi göster'}
                  </button>
                )}
              </div>
              {invocationsLoading ? (
                <Skeleton className="mt-2 h-16 w-full" />
              ) : invocations.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Bu çağrıda hiç fonksiyon çalıştırılmadı.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {invocations.map((inv) => {
                    const { label, detail } = describeToolInvocation(inv)
                    return (
                      <div key={inv.id} className="rounded-lg border border-slate-200 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-ink">{showRaw ? inv.tool_name : label}</span>
                          {inv.success ? <Badge status="active" /> : <Badge status="suspended" />}
                        </div>
                        {showRaw ? (
                          <pre className="mt-1.5 overflow-x-auto whitespace-pre-wrap break-words text-slate-500">
                            {JSON.stringify(inv.result, null, 2)}
                          </pre>
                        ) : (
                          detail && <p className="mt-1 text-slate-500">{detail}</p>
                        )}
                        {!showRaw && <p className="mt-1 font-mono text-[10px] text-slate-400">{inv.tool_name}</p>}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {selectedCall.transcript && (
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Konuşma Metni</p>
                <div className="mt-1.5 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-lg bg-mist p-3 text-xs text-ink">
                  {selectedCall.transcript}
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>
    </div>
  )
}
