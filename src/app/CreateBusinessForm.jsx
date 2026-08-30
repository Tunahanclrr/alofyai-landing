import { useState } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useBusiness } from '../context/BusinessContext'
import { slugify } from '../utils/slug'
import AuthShell from '../auth/AuthShell'
import Input from '../components/Input'
import Button from '../components/Button'

const TYPES = [
  { value: 'beauty', label: 'Güzellik / Kuaför', description: 'Randevu, personel, hizmet ve paket yönetimi' },
  { value: 'restaurant', label: 'Restoran', description: 'Masa, rezervasyon ve menü yönetimi' },
]

export default function CreateBusinessForm() {
  const { confirmNewBusiness } = useBusiness()
  const [name, setName] = useState('')
  const [type, setType] = useState('beauty')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (event) => {
    event.preventDefault()
    setError('')
    setSubmitting(true)

    const baseSlug = slugify(name) || 'isletme'
    const slug = `${baseSlug}-${Math.random().toString(36).slice(2, 6)}`

    const { data: business, error: rpcError } = await supabase.rpc('create_business', {
      p_name: name,
      p_type: type,
      p_slug: slug,
    })

    if (rpcError) {
      setError('İşletme oluşturulamadı. Lütfen tekrar deneyin.')
      setSubmitting(false)
      return
    }

    // Taze oturumun JWT'si veritabanı tarafında doğrulanana kadar birkaç
    // saniye sürebilir (bkz. BusinessContext.confirmNewBusiness) — bu yüzden
    // burada beklenen business_id görünene kadar tekrar tekrar sorgulanır.
    const found = await confirmNewBusiness(business.id)
    if (!found) {
      setError('İşletme oluşturuldu ama panel yüklenemedi — sayfayı yenileyin.')
    }
    setSubmitting(false)
  }

  return (
    <AuthShell eyebrow="Son adım" title="İşletmenizi Oluşturun" subtitle="Devam etmek için bir işletme kaydı gerekiyor.">
      <form onSubmit={handleSubmit} className="space-y-5">
        <Input id="business-name" label="İşletme Adı" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Örn. Uğurcan Hair" />

        <div>
          <span className="mb-1.5 block text-sm font-medium text-ink">İşletme Türü</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {TYPES.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setType(option.value)}
                className={`rounded-xl border px-4 py-3 text-left transition-colors ${
                  type === option.value ? 'border-teal bg-teal/5 ring-1 ring-teal' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <span className="block text-sm font-semibold text-ink">{option.label}</span>
                <span className="mt-0.5 block text-xs text-slate-500">{option.description}</span>
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <Button type="submit" disabled={submitting} className="w-full">
          {submitting ? 'Oluşturuluyor…' : 'İşletmeyi Oluştur'}
        </Button>
      </form>
    </AuthShell>
  )
}
