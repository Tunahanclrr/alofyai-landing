import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

export default function UsersPage() {
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true

    async function load() {
      // business_members -> profiles arasında doğrudan bir foreign key YOK
      // (ikisi de ayrı ayrı auth.users'a bağlı) — PostgREST bu yüzden otomatik
      // embed edemiyor (PGRST200). profiles ayrı sorgulanıp user_id ile elle eşlenir.
      const { data, error } = await supabase
        .from('business_members')
        .select('id, user_id, status, created_at, roles(name), businesses(id, name)')
        .order('created_at', { ascending: false })
      if (!active) return
      if (error) {
        console.error('kullanıcılar yüklenemedi', error)
        setMembers([])
        setLoading(false)
        return
      }

      let membersWithProfiles = data ?? []
      if (membersWithProfiles.length > 0) {
        const userIds = membersWithProfiles.map((m) => m.user_id)
        const { data: profilesData, error: profilesError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone')
          .in('id', userIds)
        if (profilesError) console.error('üye profilleri yüklenemedi', profilesError)
        const profilesById = Object.fromEntries((profilesData ?? []).map((p) => [p.id, p]))
        membersWithProfiles = membersWithProfiles.map((m) => ({ ...m, profiles: profilesById[m.user_id] ?? null }))
      }

      if (!active) return
      setMembers(membersWithProfiles)
      setLoading(false)
    }

    load()
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Kullanıcılar</h1>
      <p className="mt-1 text-sm text-slate-500">Tüm işletmelerdeki ekip üyeleri.</p>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : members.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz kullanıcı yok" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">Kullanıcı</th>
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Rol</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {members.map((m) => (
                  <tr key={m.id} className="hover:bg-mist">
                    <td className="px-5 py-3">
                      <p className="font-medium text-ink">{m.profiles?.full_name || 'İsimsiz'}</p>
                      <p className="text-xs text-slate-500">{m.profiles?.email}</p>
                    </td>
                    <td className="px-5 py-3">
                      <Link to={`/admin/businesses/${m.businesses?.id}`} className="text-slate-600 hover:text-teal-dark">
                        {m.businesses?.name}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{m.roles?.name}</td>
                    <td className="px-5 py-3">
                      <Badge status={m.status} />
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
