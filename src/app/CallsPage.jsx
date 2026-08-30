import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import {
  listCallsForBusiness,
  getCallToolInvocations,
  getAgentForBusiness,
  getPhoneNumberForBusiness,
  getMonthlyMinutesUsed,
  describeToolInvocation,
  formatEndReason,
} from '../services/vapi'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

const STATUS_LABELS = { started: 'Başladı', in_progress: 'Devam Ediyor', ended: 'Sona Erdi' }
const DIRECTION_LABELS = { inbound: 'Gelen', outbound: 'Giden' }
const TONE_BADGE_STATUS = { success: 'active', error: 'suspended', neutral: undefined }

function formatDuration(seconds) {
  if (!seconds) return '—'
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}dk ${s}sn`
}

// customer_id sadece bir customers kaydı gerçekten eşleşince/oluşunca dolar
// (tool çağrısı sırasında) — henüz dolmamışsa Vapi'nin verdiği ham arayan
// numarasına (caller_number) düşer, o da yoksa '—'.
function callerName(call) {
  return call.customers?.full_name ?? call.caller_number ?? '—'
}
function callerPhone(call) {
  return call.customers?.phone ?? call.caller_number ?? '—'
}

export default function CallsPage() {
  const { activeBusinessId } = useBusiness()
  const [calls, setCalls] = useState([])
  const [loading, setLoading] = useState(true)
  const [agent, setAgent] = useState(null)
  const [phoneNumber, setPhoneNumber] = useState(null)
  const [minutesUsed, setMinutesUsed] = useState(null)
  const [selectedCall, setSelectedCall] = useState(null)
  const [invocations, setInvocations] = useState([])
  const [invocationsLoading, setInvocationsLoading] = useState(false)

  useEffect(() => {
    if (!activeBusinessId) return
    let active = true
    setLoading(true)
    Promise.all([
      listCallsForBusiness(activeBusinessId),
      getAgentForBusiness(activeBusinessId),
      getPhoneNumberForBusiness(activeBusinessId),
      getMonthlyMinutesUsed(activeBusinessId),
    ]).then(([callsRes, agentRes, phoneRes, minutesRes]) => {
      if (!active) return
      if (callsRes.error) console.error('çağrılar yüklenemedi', callsRes.error)
      if (minutesRes.error) console.error('kullanım yüklenemedi', minutesRes.error)
      setCalls(callsRes.data ?? [])
      setAgent(agentRes.data ?? null)
      setPhoneNumber(phoneRes.data ?? null)
      setMinutesUsed(minutesRes.data ?? null)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [activeBusinessId])

  const openDetails = async (call) => {
    setSelectedCall(call)
    setInvocationsLoading(true)
    const { data, error } = await getCallToolInvocations(call.id)
    if (error) console.error('çağrı detayları yüklenemedi', error)
    setInvocations(data ?? [])
    setInvocationsLoading(false)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Çağrılar</h1>
      <p className="mt-1 text-sm text-slate-500">AI asistanınızın aldığı telefon görüşmeleri.</p>

      {!loading && (
        <Card className="mt-4 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">AI Asistanınız</p>
              {agent ? (
                <p className="mt-0.5 text-sm font-medium text-ink">
                  {phoneNumber ? <span className="font-mono">{phoneNumber.e164_number}</span> : 'Henüz telefon numarası bağlanmadı'}
                </p>
              ) : (
                <p className="mt-0.5 text-sm text-slate-500">Henüz aktifleştirilmedi</p>
              )}
            </div>
            {agent ? (
              agent.is_active ? (
                <Badge status="active" />
              ) : (
                <Badge>Pasif</Badge>
              )
            ) : (
              <Badge>Kurulum Bekliyor</Badge>
            )}
          </div>

          {agent && minutesUsed != null && (
            <div className="mt-3 border-t border-slate-100 pt-3">
              <p className="text-xs text-slate-500">
                Bu ay kullanılan: <span className="font-medium text-ink">{minutesUsed.toFixed(1)} dk</span>
                {agent.monthly_minute_limit != null ? ` / ${agent.monthly_minute_limit} dk` : ' (sınırsız)'}
                {agent.monthly_minute_limit != null && (
                  <span>
                    {' '}
                    · Kalan:{' '}
                    <span className={minutesUsed >= agent.monthly_minute_limit ? 'font-medium text-red-600' : 'font-medium text-ink'}>
                      {Math.max(0, agent.monthly_minute_limit - minutesUsed).toFixed(1)} dk
                    </span>
                  </span>
                )}
              </p>
              {agent.monthly_minute_limit != null && (
                <div className="mt-1.5 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${minutesUsed >= agent.monthly_minute_limit ? 'bg-red-500' : 'bg-teal'}`}
                    style={{ width: `${Math.min(100, (minutesUsed / agent.monthly_minute_limit) * 100)}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Card className="p-4">
          <p className="text-xs text-slate-500">Toplam Çağrı</p>
          <p className="mt-1 text-2xl font-semibold text-ink">{calls.length}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs text-slate-500">Toplam Süre</p>
          <p className="mt-1 text-2xl font-semibold text-ink">
            {formatDuration(calls.reduce((sum, c) => sum + (c.duration_seconds ?? 0), 0))}
          </p>
        </Card>
      </div>

      <Card className="mt-4 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Henüz çağrı yok"
              description="AI hattınız aktifleştirilip ilk arama geldiğinde burada görünecek."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
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
                    <td className="px-5 py-3 font-medium text-ink">{callerName(call)}</td>
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
              <div>
                <p className="text-xs text-slate-400">Tarih</p>
                <p className="font-medium text-ink">{new Date(selectedCall.created_at).toLocaleString('tr-TR')}</p>
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
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">AI Ne Yaptı?</p>
              {invocationsLoading ? (
                <Skeleton className="mt-2 h-16 w-full" />
              ) : invocations.length === 0 ? (
                <p className="mt-2 text-sm text-slate-500">Bu çağrıda hiçbir işlem yapılmadı.</p>
              ) : (
                <div className="mt-2 space-y-2">
                  {invocations.map((inv) => {
                    const { label, detail, tone } = describeToolInvocation(inv)
                    return (
                      <div key={inv.id} className="flex items-start justify-between gap-3 rounded-lg border border-slate-200 p-3 text-sm">
                        <div>
                          <p className="font-medium text-ink">{label}</p>
                          {detail && <p className="mt-0.5 text-xs text-slate-500">{detail}</p>}
                        </div>
                        {TONE_BADGE_STATUS[tone] ? <Badge status={TONE_BADGE_STATUS[tone]} /> : null}
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
