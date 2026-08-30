import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listPhoneNumbers } from '../services/vapi'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

export default function PhoneNumbersPage() {
  const [numbers, setNumbers] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    listPhoneNumbers().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('telefon numaraları yüklenemedi', error)
      setNumbers(data ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Telefon Numaraları</h1>
      <p className="mt-1 text-sm text-slate-500">
        İşletmelerin AI hattına bağlı telefon numaraları. Bağlamak için ilgili işletmenin detay sayfasını kullanın.
      </p>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : numbers.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz numara bağlanmadı" description="Bir işletmenin AI'ını aktifleştirip telefon numarası bağladığınızda burada listelenecek." />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Numara</th>
                  <th className="px-5 py-3 font-medium">Bağlı Agent</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {numbers.map((n) => (
                  <tr key={n.id} className="hover:bg-mist">
                    <td className="px-5 py-3">
                      <Link to={`/admin/businesses/${n.business_id}`} className="font-medium text-ink hover:text-teal-dark">
                        {n.businesses?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-600">{n.e164_number}</td>
                    <td className="px-5 py-3 text-slate-600">{n.ai_agents?.name ?? '—'}</td>
                    <td className="px-5 py-3">{n.is_active ? <Badge status="active" /> : <Badge>Pasif</Badge>}</td>
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
