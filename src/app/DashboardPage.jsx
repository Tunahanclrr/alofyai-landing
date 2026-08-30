import { useEffect, useState } from 'react'
import { useBusiness } from '../context/BusinessContext'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/Card'
import EmptyState from '../components/EmptyState'
import Skeleton from '../components/Skeleton'

function startOfDay(date) {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export default function DashboardPage() {
  const { activeBusiness, activeBusinessId, activeMembership } = useBusiness()
  const isRestaurant = activeBusiness?.type === 'restaurant'
  const [stats, setStats] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!activeBusinessId) return
    setLoading(true)
    const dayStart = startOfDay(new Date())
    const dayEnd = new Date(dayStart)
    dayEnd.setDate(dayEnd.getDate() + 1)

    if (isRestaurant) {
      Promise.all([
        supabase
          .from('reservations')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', activeBusinessId)
          .gte('starts_at', dayStart.toISOString())
          .lt('starts_at', dayEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('restaurant_tables').select('*', { count: 'exact', head: true }).eq('business_id', activeBusinessId).eq('status', 'occupied'),
        supabase.from('restaurant_tables').select('*', { count: 'exact', head: true }).eq('business_id', activeBusinessId).eq('is_active', true),
      ]).then(([todayRes, occupied, totalTables]) => {
        setStats({
          primary: { label: 'Bugünkü Rezervasyon', value: todayRes.count ?? 0 },
          secondary: { label: 'Dolu Masa', value: `${occupied.count ?? 0} / ${totalTables.count ?? 0}` },
        })
        setLoading(false)
      })
    } else {
      Promise.all([
        supabase
          .from('appointments')
          .select('*', { count: 'exact', head: true })
          .eq('business_id', activeBusinessId)
          .gte('starts_at', dayStart.toISOString())
          .lt('starts_at', dayEnd.toISOString())
          .neq('status', 'cancelled'),
        supabase.from('customers').select('*', { count: 'exact', head: true }).eq('business_id', activeBusinessId),
      ]).then(([todayAppts, customers]) => {
        setStats({
          primary: { label: 'Bugünkü Randevu', value: todayAppts.count ?? 0 },
          secondary: { label: 'Toplam Müşteri', value: customers.count ?? 0 },
        })
        setLoading(false)
      })
    }
  }, [activeBusinessId, isRestaurant])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Panel</h1>
      <p className="mt-1 text-sm text-slate-500">
        {activeBusiness?.name} · {activeMembership?.roles?.name}
      </p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-sm text-slate-500">{stats?.primary.label ?? '…'}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-3xl font-bold text-ink">{stats.primary.value}</p>}
        </Card>
        <Card className="p-5">
          <p className="text-sm text-slate-500">{stats?.secondary.label ?? '…'}</p>
          {loading ? <Skeleton className="mt-2 h-8 w-14" /> : <p className="mt-1 text-3xl font-bold text-ink">{stats.secondary.value}</p>}
        </Card>
        <Card className="p-5 opacity-60">
          <p className="text-sm text-slate-500">AI Çağrıları</p>
          <p className="mt-1 text-3xl font-bold text-slate-300">—</p>
        </Card>
        <Card className="p-5 opacity-60">
          <p className="text-sm text-slate-500">AI Dakikası</p>
          <p className="mt-1 text-3xl font-bold text-slate-300">—</p>
        </Card>
      </div>

      <div className="mt-6">
        <EmptyState badge="Faz 4" title="AI çağrı özetleri yakında burada" description="Vapi entegrasyonu tamamlandığında bu bölüm gerçek verilerle dolacak." />
      </div>
    </div>
  )
}
