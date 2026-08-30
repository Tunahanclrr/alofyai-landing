import { useEffect, useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'

const SOURCE_LABELS = { app: 'Panel', admin: 'Super Admin', vapi: 'AI (Vapi)' }
const ACTED_AS_LABELS = { self: 'Kendi işlemi', impersonation: 'Impersonation', vapi: 'AI' }

export default function AuditLogsPage() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    supabase
      .from('audit_logs')
      .select('id, action, acted_as, source, target_type, created_at, businesses(name)')
      .order('created_at', { ascending: false })
      .limit(100)
      .then(({ data, error }) => {
        if (!active) return
        if (error) console.error('sistem logları yüklenemedi', error)
        setLogs(data ?? [])
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">Sistem Logları</h1>
      <p className="mt-1 text-sm text-slate-500">Platform genelindeki son 100 işlem.</p>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(5)].map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <div className="p-5">
            <EmptyState title="Henüz log kaydı yok" />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">İşlem</th>
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Bağlam</th>
                  <th className="px-5 py-3 font-medium">Kaynak</th>
                  <th className="px-5 py-3 font-medium">Tarih</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-mist">
                    <td className="px-5 py-3 font-medium text-ink">{log.action}</td>
                    <td className="px-5 py-3 text-slate-600">{log.businesses?.name ?? '—'}</td>
                    <td className="px-5 py-3 text-slate-600">{ACTED_AS_LABELS[log.acted_as] ?? log.acted_as}</td>
                    <td className="px-5 py-3">
                      <Badge>{SOURCE_LABELS[log.source] ?? log.source}</Badge>
                    </td>
                    <td className="px-5 py-3 text-slate-500">{new Date(log.created_at).toLocaleString('tr-TR')}</td>
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
