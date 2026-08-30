import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import { useImpersonation } from '../context/ImpersonationContext'
import {
  getAgentForBusiness,
  getPhoneNumberForBusiness,
  createAssistant,
  updateAgentPrompt,
  linkPhoneNumber,
  setMonthlyMinuteLimit,
  getMonthlyMinutesUsed,
} from '../services/vapi'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Input from '../components/Input'
import Skeleton from '../components/Skeleton'
import ConfirmDialog from '../components/ConfirmDialog'

const TYPE_LABELS = { beauty: 'Güzellik / Kuaför', restaurant: 'Restoran' }
const STATUS_OPTIONS = [
  { value: 'trial', label: 'Deneme' },
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Askıya Al' },
  { value: 'cancelled', label: 'İptal Et' },
]

export default function BusinessDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { startImpersonation } = useImpersonation()

  const [business, setBusiness] = useState(null)
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [pendingStatus, setPendingStatus] = useState(null)
  const [statusSubmitting, setStatusSubmitting] = useState(false)
  const [impersonating, setImpersonating] = useState(false)

  const [agent, setAgent] = useState(null)
  const [showPrompt, setShowPrompt] = useState(false)
  const [promptDraft, setPromptDraft] = useState('')
  const [promptSaving, setPromptSaving] = useState(false)
  const [promptError, setPromptError] = useState('')
  const [phoneNumber, setPhoneNumber] = useState(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')
  const [vapiIdInput, setVapiIdInput] = useState('')
  const [phoneSubmitting, setPhoneSubmitting] = useState(false)
  const [phoneError, setPhoneError] = useState('')
  const [minutesUsed, setMinutesUsed] = useState(null)
  const [minuteLimitInput, setMinuteLimitInput] = useState('')
  const [minuteLimitSaving, setMinuteLimitSaving] = useState(false)
  const [minuteLimitError, setMinuteLimitError] = useState('')

  const load = useCallback(async () => {
    const [
      { data: businessData, error: businessError },
      { data: memberData, error: memberError },
      { data: agentData, error: agentError },
      { data: phoneData, error: phoneErr },
    ] = await Promise.all([
      supabase.from('businesses').select('*').eq('id', id).maybeSingle(),
      // business_members -> profiles arasında doğrudan bir foreign key YOK
      // (ikisi de ayrı ayrı auth.users'a bağlı) — PostgREST bu yüzden otomatik
      // embed edemiyor (PGRST200). profiles ayrı sorgulanıp user_id ile elle eşlenir.
      supabase
        .from('business_members')
        .select('id, user_id, status, created_at, roles(name)')
        .eq('business_id', id),
      getAgentForBusiness(id),
      getPhoneNumberForBusiness(id),
    ])
    if (businessError) console.error('işletme yüklenemedi', businessError)
    if (memberError) console.error('üyeler yüklenemedi', memberError)
    if (agentError) console.error('AI agent yüklenemedi', agentError)
    if (phoneErr) console.error('telefon numarası yüklenemedi', phoneErr)

    let membersWithProfiles = memberData ?? []
    if (membersWithProfiles.length > 0) {
      const userIds = membersWithProfiles.map((m) => m.user_id)
      const { data: profilesData, error: profilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
      if (profilesError) console.error('üye profilleri yüklenemedi', profilesError)
      const profilesById = Object.fromEntries((profilesData ?? []).map((p) => [p.id, p]))
      membersWithProfiles = membersWithProfiles.map((m) => ({ ...m, profiles: profilesById[m.user_id] ?? null }))
    }

    setBusiness(businessData ?? null)
    setMembers(membersWithProfiles)
    setAgent(agentData ?? null)
    setMinuteLimitInput(agentData?.monthly_minute_limit != null ? String(agentData.monthly_minute_limit) : '')
    setPhoneNumber(phoneData ?? null)
    setLoading(false)

    if (agentData) {
      const { data: minutes, error: minutesError } = await getMonthlyMinutesUsed(id)
      if (minutesError) console.error('kullanım yüklenemedi', minutesError)
      setMinutesUsed(minutes)
    }
  }, [id])

  const handleSaveMinuteLimit = async () => {
    setMinuteLimitSaving(true)
    setMinuteLimitError('')
    const trimmed = minuteLimitInput.trim()
    const parsed = trimmed === '' ? null : Number(trimmed)
    if (parsed !== null && (!Number.isFinite(parsed) || parsed < 0)) {
      setMinuteLimitError('Geçerli bir sayı girin (boş bırakırsanız sınırsız olur).')
      setMinuteLimitSaving(false)
      return
    }
    const { data, error } = await setMonthlyMinuteLimit(agent.id, parsed)
    setMinuteLimitSaving(false)
    if (error) {
      setMinuteLimitError(error.message || 'Kaydedilemedi.')
      return
    }
    setAgent(data)
  }

  const handleActivateAi = async () => {
    setAiLoading(true)
    setAiError('')
    const { data, error } = await createAssistant(id)
    setAiLoading(false)
    if (error) {
      setAiError(error.message || 'AI kurulumu başarısız oldu.')
      return
    }
    setAgent(data.agent)
  }

  const togglePrompt = () => {
    if (!showPrompt) setPromptDraft(agent?.config?.systemPrompt ?? '')
    setPromptError('')
    setShowPrompt((v) => !v)
  }

  const handleSavePrompt = async () => {
    setPromptSaving(true)
    setPromptError('')
    const { data, error } = await updateAgentPrompt(id, promptDraft)
    setPromptSaving(false)
    if (error) {
      setPromptError(error.message || 'Prompt kaydedilemedi.')
      return
    }
    setAgent(data.agent)
  }

  const handleResetPrompt = async () => {
    setPromptSaving(true)
    setPromptError('')
    const { data, error } = await createAssistant(id, { regeneratePrompt: true })
    setPromptSaving(false)
    if (error) {
      setPromptError(error.message || 'Varsayılana sıfırlanamadı.')
      return
    }
    setAgent(data.agent)
    setPromptDraft(data.agent?.config?.systemPrompt ?? '')
  }

  const handleLinkPhone = async (e) => {
    e.preventDefault()
    setPhoneSubmitting(true)
    setPhoneError('')
    const { data, error } = await linkPhoneNumber(id, { vapiPhoneNumberId: vapiIdInput.trim() })
    setPhoneSubmitting(false)
    if (error) {
      setPhoneError(error.message || 'Numara bağlanamadı.')
      return
    }
    setPhoneNumber(data.phone_number)
  }

  useEffect(() => {
    load()
  }, [load])

  const handleStatusConfirm = async () => {
    if (!pendingStatus) return
    setStatusSubmitting(true)
    const { error } = await supabase.rpc('set_business_status', { p_business_id: id, p_status: pendingStatus })
    setStatusSubmitting(false)
    setPendingStatus(null)
    if (error) {
      console.error('durum güncellenemedi', error)
      return
    }
    load()
  }

  const handleImpersonate = async () => {
    setImpersonating(true)
    try {
      await startImpersonation(id, 'Super Admin destek erişimi')
      navigate('/app/dashboard')
    } catch (err) {
      console.error('impersonation başlatılamadı', err)
    } finally {
      setImpersonating(false)
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (!business) {
    return <p className="text-sm text-slate-500">İşletme bulunamadı.</p>
  }

  return (
    <div>
      <Link to="/admin/businesses" className="text-sm font-medium text-slate-500 hover:text-ink">
        ← İşletmeler
      </Link>

      <div className="mt-2 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{business.name}</h1>
            <Badge status={business.status} />
          </div>
          <p className="mt-1 text-sm text-slate-500">
            {TYPE_LABELS[business.type]} · {business.slug} · {business.timezone}
          </p>
        </div>
        <Button onClick={handleImpersonate} disabled={impersonating} variant="secondary">
          {impersonating ? 'Giriş yapılıyor…' : 'İşletme Olarak Gir'}
        </Button>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="p-5 lg:col-span-2">
          <h2 className="text-sm font-semibold text-ink">Ekip Üyeleri</h2>
          {members.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">Henüz üye yok.</p>
          ) : (
            <div className="mt-3 divide-y divide-slate-100">
              {members.map((m) => (
                <div key={m.id} className="flex items-center justify-between py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{m.profiles?.full_name || m.profiles?.email || 'İsimsiz'}</p>
                    <p className="text-xs text-slate-500">{m.roles?.name}</p>
                  </div>
                  <Badge status={m.status} />
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="text-sm font-semibold text-ink">Durum Yönetimi</h2>
          <p className="mt-1 text-xs text-slate-500">Platform seviyesinde işletme durumunu değiştirin.</p>
          <div className="mt-3 space-y-2">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                disabled={business.status === opt.value}
                onClick={() => setPendingStatus(opt.value)}
                className="flex w-full items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-ink transition-colors hover:bg-mist disabled:cursor-not-allowed disabled:opacity-40"
              >
                {opt.label}
              </button>
            ))}
          </div>
        </Card>
      </div>

      <Card className="mt-4 p-5">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-ink">AI Resepsiyonist</h2>
            <p className="mt-1 text-xs text-slate-500">Bu işletme için Vapi üzerinde otomatik telefon asistanı kurulumu.</p>
          </div>
          {agent && (agent.is_active ? <Badge status="active" /> : <Badge>Pasif</Badge>)}
        </div>

        {!agent ? (
          <div className="mt-4">
            <Button onClick={handleActivateAi} disabled={aiLoading}>
              {aiLoading ? 'Kuruluyor…' : "AI'ı Aktifleştir"}
            </Button>
            {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <p className="text-xs text-slate-400">Vapi Assistant ID</p>
                <p className="font-mono text-xs text-ink">{agent.vapi_assistant_id}</p>
              </div>
              <div>
                <p className="text-xs text-slate-400">Karşılama Mesajı</p>
                <p className="text-ink">{agent.greeting_message}</p>
              </div>
            </div>

            <div>
              <button type="button" onClick={togglePrompt} className="text-xs font-medium text-teal-dark hover:underline">
                {showPrompt ? 'Sistem promptunu gizle ▲' : 'Sistem promptunu göster / düzenle ▼'}
              </button>
              {showPrompt &&
                (agent.config?.systemPrompt ? (
                  <div className="mt-2 space-y-2">
                    <textarea
                      value={promptDraft}
                      onChange={(e) => setPromptDraft(e.target.value)}
                      rows={36}
                      className="w-full resize-y rounded-lg border border-slate-300 p-3 font-mono text-xs leading-relaxed text-ink focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Button size="sm" onClick={handleSavePrompt} disabled={promptSaving || promptDraft === agent.config.systemPrompt}>
                        {promptSaving ? 'Kaydediliyor…' : "Kaydet ve Vapi'ye Gönder"}
                      </Button>
                      <Button variant="secondary" size="sm" onClick={handleResetPrompt} disabled={promptSaving}>
                        Varsayılana Sıfırla
                      </Button>
                    </div>
                    {promptError && <p className="text-sm text-red-600">{promptError}</p>}
                  </div>
                ) : (
                  <p className="mt-2 text-sm text-slate-500">
                    Bu agent prompt kaydı eklenmeden önce oluşturulmuş — &quot;Assistant Ayarlarını Güncelle&quot;ye basınca kaydedilecek.
                  </p>
                ))}
            </div>

            <div>
              <Button variant="secondary" size="sm" onClick={handleActivateAi} disabled={aiLoading}>
                {aiLoading ? 'Güncelleniyor…' : 'Assistant Ayarlarını Güncelle'}
              </Button>
              {aiError && <p className="mt-2 text-sm text-red-600">{aiError}</p>}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-ink">Aylık Dakika Kotası</h3>
              <p className="mt-1 text-xs text-slate-500">
                Bu ay kullanılan: <span className="font-medium text-ink">{minutesUsed != null ? minutesUsed.toFixed(1) : '—'} dk</span>
                {agent.monthly_minute_limit != null && <span> / {agent.monthly_minute_limit} dk</span>}
                {agent.monthly_minute_limit != null && minutesUsed != null && (
                  <span>
                    {' '}
                    · Kalan:{' '}
                    <span className={minutesUsed >= agent.monthly_minute_limit ? 'font-medium text-red-600' : 'font-medium text-ink'}>
                      {Math.max(0, agent.monthly_minute_limit - minutesUsed).toFixed(1)} dk
                    </span>
                  </span>
                )}
              </p>
              {agent.monthly_minute_limit != null && minutesUsed != null && (
                <div className="mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-slate-100">
                  <div
                    className={`h-full rounded-full ${minutesUsed >= agent.monthly_minute_limit ? 'bg-red-500' : 'bg-teal'}`}
                    style={{ width: `${Math.min(100, (minutesUsed / agent.monthly_minute_limit) * 100)}%` }}
                  />
                </div>
              )}
              <div className="mt-3 flex flex-wrap items-end gap-2">
                <Input
                  label="Aylık Limit (dakika)"
                  value={minuteLimitInput}
                  onChange={(e) => setMinuteLimitInput(e.target.value)}
                  placeholder="Boş = sınırsız"
                  className="w-40"
                />
                <Button size="sm" onClick={handleSaveMinuteLimit} disabled={minuteLimitSaving}>
                  {minuteLimitSaving ? 'Kaydediliyor…' : 'Kaydet'}
                </Button>
              </div>
              {minuteLimitError && <p className="mt-1.5 text-sm text-red-600">{minuteLimitError}</p>}
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-semibold text-ink">Telefon Numarası</h3>
              {phoneNumber ? (
                <p className="mt-2 flex items-center gap-2 text-sm text-ink">
                  <span className="font-mono">{phoneNumber.e164_number}</span>
                  {phoneNumber.is_active ? <Badge status="active" /> : <Badge>Pasif</Badge>}
                </p>
              ) : (
                <form onSubmit={handleLinkPhone} className="mt-3 space-y-3">
                  <p className="text-xs text-slate-500">
                    Numarayı ve SIP trunk&apos;ı (Verimor, Netgsm vb.) önce{' '}
                    <a
                      href="https://dashboard.vapi.ai"
                      target="_blank"
                      rel="noreferrer"
                      className="font-medium text-teal-dark hover:underline"
                    >
                      Vapi dashboard&apos;ında
                    </a>{' '}
                    (Integrations → SIP Trunk, sonra Phone Numbers → BYO SIP Trunk Number) oluşturun, sonra oradaki Phone Number ID&apos;yi
                    buraya yapıştırın.
                  </p>
                  <Input
                    label="Vapi Phone Number ID"
                    value={vapiIdInput}
                    onChange={(e) => setVapiIdInput(e.target.value)}
                    placeholder="Vapi panelinden kopyaladığınız ID"
                    required
                  />
                  <Button type="submit" size="sm" disabled={phoneSubmitting}>
                    {phoneSubmitting ? 'Bağlanıyor…' : 'Numarayı Bağla'}
                  </Button>
                  {phoneError && <p className="text-sm text-red-600">{phoneError}</p>}
                </form>
              )}
            </div>
          </div>
        )}
      </Card>

      <ConfirmDialog
        open={Boolean(pendingStatus)}
        title="İşletme durumunu değiştir"
        description={`"${business.name}" işletmesinin durumu "${STATUS_OPTIONS.find((o) => o.value === pendingStatus)?.label}" olarak değiştirilecek.`}
        confirmLabel="Değiştir"
        danger={pendingStatus === 'suspended' || pendingStatus === 'cancelled'}
        loading={statusSubmitting}
        onConfirm={handleStatusConfirm}
        onCancel={() => setPendingStatus(null)}
      />
    </div>
  )
}
