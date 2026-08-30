import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'

const STAT_CARDS = [
  { key: 'totalBusinesses', label: 'Toplam İşletme' },
  { key: 'activeBusinesses', label: 'Aktif İşletme' },
  { key: 'totalUsers', label: 'Toplam Kullanıcı' },
]

const COMING_SOON_CARDS = [
  { label: 'Bu Ay AI Çağrısı', phase: 'Faz 4' },
  { label: 'AI Dakika Kullanımı', phase: 'Faz 4' },
  { label: 'Bu Ay Gelir', phase: 'Faz 7' },
]

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null)
  const [recentBusinesses, setRecentBusinesses] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    async function load() {
      const [totalBusinesses, activeBusinesses, totalUsers, recent] = await Promise.all([
        supabase.from('businesses').select('*', { count: 'exact', head: true }),
        supabase.from('businesses').select('*', { count: 'exact', head: true }).eq('status', 'active'),
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('businesses').select('id, name, type, status, created_at').order('created_at', { ascending: false }).limit(5),
      ])
      if (!active) return
      setStats({
        totalBusinesses: totalBusinesses.count ?? 0,
        activeBusinesses: activeBusinesses.count ?? 0,
        totalUsers: totalUsers.count ?? 0,
      })
      setRecentBusinesses(recent.data ?? [])
      setLoading(false)
    }
    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Super Admin Panel</h1>
      <p className="mt-1 text-sm text-slate-500">Tüm işletmelere genel bakış.</p>

      <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {STAT_CARDS.map((card) => (
          <Card key={card.key} className="p-5">
            <p className="text-sm text-slate-500">{card.label}</p>
            {loading ? (
              <Skeleton className="mt-2 h-8 w-16" />
            ) : (
              <p className="mt-1 text-3xl font-bold text-ink">{stats?.[card.key] ?? 0}</p>
            )}
          </Card>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {COMING_SOON_CARDS.map((card) => (
          <Card key={card.label} className="p-5 opacity-60">
            <div className="flex items-center justify-between">
              <p className="text-sm text-slate-500">{card.label}</p>
              <Badge>{card.phase}</Badge>
            </div>
            <p className="mt-1 text-3xl font-bold text-slate-300">—</p>
          </Card>
        ))}
      </div>

      <Card className="mt-6 p-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Son Kayıt Olan İşletmeler</h2>
          <Link to="/admin/businesses" className="text-sm font-medium text-teal hover:text-teal-dark">
            Tümünü gör
          </Link>
        </div>

        <div className="mt-4 divide-y divide-slate-100">
          {loading && [...Array(3)].map((_, i) => <Skeleton key={i} className="my-2 h-10 w-full" />)}
          {!loading && recentBusinesses.length === 0 && <p className="py-6 text-center text-sm text-slate-500">Henüz işletme yok.</p>}
          {!loading &&
            recentBusinesses.map((business) => (
              <Link
                key={business.id}
                to={`/admin/businesses/${business.id}`}
                className="flex items-center justify-between gap-3 py-3 hover:bg-mist"
              >
                <div>
                  <p className="text-sm font-medium text-ink">{business.name}</p>
                  <p className="text-xs text-slate-500">{business.type === 'beauty' ? 'Güzellik / Kuaför' : 'Restoran'}</p>
                </div>
                <Badge status={business.status} />
              </Link>
            ))}
        </div>
      </Card>
    </div>
  )
}
