import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

const TYPE_LABELS = { beauty: 'Güzellik / Kuaför', restaurant: 'Restoran' }
const STATUS_FILTERS = [
  { value: 'all', label: 'Tümü' },
  { value: 'trial', label: 'Deneme' },
  { value: 'active', label: 'Aktif' },
  { value: 'suspended', label: 'Askıda' },
  { value: 'cancelled', label: 'İptal' },
]

export default function BusinessesListPage() {
  const [businesses, setBusinesses] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')

  useEffect(() => {
    let active = true
    supabase
      .from('businesses')
      .select('id, name, type, status, slug, timezone, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('işletmeler yüklenemedi', error)
        setBusinesses(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const filtered = useMemo(() => {
    return businesses.filter((b) => {
      const matchesSearch = b.name.toLowerCase().includes(search.trim().toLowerCase())
      const matchesStatus = statusFilter === 'all' || b.status === statusFilter
      return matchesSearch && matchesStatus
    })
  }, [businesses, search, statusFilter])

  return (
    <div>
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div>
          <h1 className="text-2xl font-semibold text-ink">İşletmeler</h1>
          <p className="mt-1 text-sm text-slate-500">Platformdaki tüm işletmeler.</p>
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="İşletme ara…"
          className="w-full rounded-lg border border-slate-300 px-3.5 py-2 text-sm focus:border-teal focus:outline-none focus:ring-2 focus:ring-teal/20 sm:w-64"
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setStatusFilter(f.value)}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === f.value ? 'bg-ink text-white' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-mist'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <Card className="mt-4 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-5">
            <EmptyState title="İşletme bulunamadı" description="Arama veya filtre kriterlerinizi değiştirmeyi deneyin." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Tür</th>
                  <th className="px-5 py-3 font-medium">Saat Dilimi</th>
                  <th className="px-5 py-3 font-medium">Kayıt Tarihi</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((business) => (
                  <tr key={business.id} className="cursor-pointer hover:bg-mist">
                    <td className="px-5 py-3">
                      <Link to={`/admin/businesses/${business.id}`} className="font-medium text-ink hover:text-teal-dark">
                        {business.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{TYPE_LABELS[business.type]}</td>
                    <td className="px-5 py-3 text-slate-600">{business.timezone}</td>
                    <td className="px-5 py-3 text-slate-600">{new Date(business.created_at).toLocaleDateString('tr-TR')}</td>
                    <td className="px-5 py-3">
                      <Badge status={business.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  )
}
