import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { listAgents } from '../services/vapi'
import Card from '../components/Card'
import Badge from '../components/Badge'
import Button from '../components/Button'
import Skeleton from '../components/Skeleton'
import EmptyState from '../components/EmptyState'
import Modal from '../components/Modal'

const TYPE_LABELS = { beauty_receptionist: 'Güzellik / Kuaför', restaurant_receptionist: 'Restoran' }

export default function AgentsPage() {
  const [agents, setAgents] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedAgent, setSelectedAgent] = useState(null)

  useEffect(() => {
    let active = true
    listAgents().then(({ data, error }) => {
      if (!active) return
      if (error) console.error('agentlar yüklenemedi', error)
      setAgents(data ?? [])
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return (
    <div>
      <h1 className="text-2xl font-semibold text-ink">AI Agentlar</h1>
      <p className="mt-1 text-sm text-slate-500">
        Her işletme için Vapi üzerinde kurulmuş telefon resepsiyonisti. Yeni agent oluşturmak için ilgili işletmenin detay sayfasındaki
        &quot;AI&apos;ı Aktifleştir&quot; butonunu kullanın.
      </p>

      <Card className="mt-6 overflow-hidden">
        {loading ? (
          <div className="space-y-3 p-5">
            {[...Array(4)].map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : agents.length === 0 ? (
          <div className="p-5">
            <EmptyState
              title="Henüz agent yok"
              description="Bir işletmenin detay sayfasından AI'ı aktifleştirdiğinizde burada listelenecek."
            />
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-xs uppercase tracking-wide text-slate-400">
                  <th className="px-5 py-3 font-medium">İşletme</th>
                  <th className="px-5 py-3 font-medium">Tür</th>
                  <th className="px-5 py-3 font-medium">Vapi Assistant ID</th>
                  <th className="px-5 py-3 font-medium">Durum</th>
                  <th className="px-5 py-3 font-medium">Oluşturulma</th>
                  <th className="px-5 py-3 font-medium"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-mist">
                    <td className="px-5 py-3">
                      <Link to={`/admin/businesses/${agent.business_id}`} className="font-medium text-ink hover:text-teal-dark">
                        {agent.businesses?.name ?? '—'}
                      </Link>
                    </td>
                    <td className="px-5 py-3 text-slate-600">{TYPE_LABELS[agent.agent_type] ?? agent.agent_type}</td>
                    <td className="px-5 py-3 font-mono text-xs text-slate-500">{agent.vapi_assistant_id}</td>
                    <td className="px-5 py-3">{agent.is_active ? <Badge status="active" /> : <Badge>Pasif</Badge>}</td>
                    <td className="px-5 py-3 text-slate-500">{new Date(agent.created_at).toLocaleDateString('tr-TR')}</td>
                    <td className="px-5 py-3 text-right">
                      <Button variant="ghost" size="sm" onClick={() => setSelectedAgent(agent)}>
                        Promptu Gör
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal
        open={Boolean(selectedAgent)}
        title={`${selectedAgent?.businesses?.name ?? ''} — Sistem Promptu`}
        onClose={() => setSelectedAgent(null)}
        width="max-w-3xl"
      >
        {selectedAgent && (
          <div className="space-y-3">
            <div>
              <p className="text-xs text-slate-400">Karşılama Mesajı</p>
              <p className="text-sm text-ink">{selectedAgent.greeting_message}</p>
            </div>
            <div>
              <p className="text-xs text-slate-400">Sistem Promptu</p>
              {selectedAgent.config?.systemPrompt ? (
                <pre className="mt-1.5 max-h-[65vh] overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-mist p-3 text-xs leading-relaxed text-ink">
                  {selectedAgent.config.systemPrompt}
                </pre>
              ) : (
                <p className="mt-1.5 text-sm text-slate-500">
                  Bu agent, prompt kaydı eklenmeden önce oluşturulmuş. Değiştirmek/görmek için işletme detayından &quot;Assistant
                  Ayarlarını Güncelle&quot;ye bir kez basmanız yeterli.
                </p>
              )}
            </div>
            <div>
              <p className="text-xs text-slate-400">Tanımlı Fonksiyon Sayısı</p>
              <p className="text-sm text-ink">{selectedAgent.config?.toolIds?.length ?? 0}</p>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}
