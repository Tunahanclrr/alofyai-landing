import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { usePermission } from '../hooks/usePermission'
import { getBusinessHours, saveBusinessHours } from '../services/settings'
import Card from '../components/Card'
import Button from '../components/Button'
import Skeleton from '../components/Skeleton'

const DAY_LABELS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi']
const DEFAULT_DAY = { opens_at: '09:00', closes_at: '18:00', is_closed: false }

function buildInitialDays(existingRows) {
  const byDay = Object.fromEntries((existingRows ?? []).map((r) => [r.day_of_week, r]))
  return Array.from({ length: 7 }, (_, day_of_week) => {
    const existing = byDay[day_of_week]
    return {
      day_of_week,
      opens_at: (existing?.opens_at ?? DEFAULT_DAY.opens_at).slice(0, 5),
      closes_at: (existing?.closes_at ?? DEFAULT_DAY.closes_at).slice(0, 5),
      is_closed: existing?.is_closed ?? DEFAULT_DAY.is_closed,
    }
  })
}

export default function BusinessSettingsPage() {
  const { activeBusiness, activeBusinessId } = useBusiness()
  const { allowed: canManage } = usePermission('settings.manage')
  const [days, setDays] = useState(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!activeBusinessId) return
    let active = true
    setLoading(true)
    getBusinessHours(activeBusinessId).then(({ data, error: err }) => {
      if (!active) return
      if (err) console.error('çalışma saatleri yüklenemedi', err)
      setDays(buildInitialDays(data))
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [activeBusinessId])

  const updateDay = (day_of_week, patch) => {
    setDays((prev) => prev.map((d) => (d.day_of_week === day_of_week ? { ...d, ...patch } : d)))
    setSaved(false)
  }

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setSaved(false)
    const { error: err } = await saveBusinessHours(activeBusinessId, days)
    setSaving(false)
    if (err) {
      setError('Kaydedilemedi. Bilgileri kontrol edin.')
      return
    }
    setSaved(true)
  }

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">İşletme Ayarları</h1>
      <p className="mt-1 text-sm text-slate-500">
        {activeBusiness?.name} için çalışma saatleri — AI asistanı ve randevu/rezervasyon müsaitliği bu saatlere göre çalışır.
      </p>

      <Card className="mt-6 overflow-hidden">
        {loading || !days ? (
          <div className="space-y-3 p-5">
            {[...Array(7)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {days.map((d) => (
              <div key={d.day_of_week} className="flex flex-wrap items-center gap-3 px-5 py-3.5">
                <span className="w-28 shrink-0 text-sm font-medium text-ink">{DAY_LABELS[d.day_of_week]}</span>

                <label className="flex items-center gap-2 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={d.is_closed}
                    disabled={!canManage}
                    onChange={(e) => updateDay(d.day_of_week, { is_closed: e.target.checked })}
                    className="h-4 w-4 rounded border-slate-300 text-teal focus:ring-teal/20"
                  />
                  Kapalı
                </label>

                {!d.is_closed && (
                  <div className="flex items-center gap-2">
                    <input
                      type="time"
                      value={d.opens_at}
                      disabled={!canManage}
                      onChange={(e) => updateDay(d.day_of_week, { opens_at: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:bg-mist disabled:text-slate-400"
                    />
                    <span className="text-sm text-slate-400">—</span>
                    <input
                      type="time"
                      value={d.closes_at}
                      disabled={!canManage}
                      onChange={(e) => updateDay(d.day_of_week, { closes_at: e.target.value })}
                      className="rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 disabled:bg-mist disabled:text-slate-400"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </Card>

      {canManage ? (
        <div className="mt-4 flex items-center gap-3">
          <Button onClick={handleSave} disabled={saving || loading}>
            {saving ? 'Kaydediliyor…' : 'Kaydet'}
          </Button>
          {saved && <span className="text-sm font-medium text-teal-dark">Kaydedildi.</span>}
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>
      ) : (
        <p className="mt-4 text-sm text-slate-500">Çalışma saatlerini değiştirmek için işletme sahibi (Owner) yetkisi gerekir.</p>
      )}
    </div>
  )
}
