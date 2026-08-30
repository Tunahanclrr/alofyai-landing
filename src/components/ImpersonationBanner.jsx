import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useImpersonation } from '../context/ImpersonationContext'

export default function ImpersonationBanner() {
  const { activeImpersonation, endImpersonation } = useImpersonation()
  const navigate = useNavigate()
  const [ending, setEnding] = useState(false)

  if (!activeImpersonation) return null

  const handleExit = async () => {
    setEnding(true)
    try {
      await endImpersonation()
      navigate('/admin/businesses')
    } finally {
      setEnding(false)
    }
  }

  return (
    <div className="flex items-center justify-center gap-3 bg-amber-400 px-4 py-2 text-sm font-semibold text-amber-950">
      <span>
        ⚠️ Impersonating: {activeImpersonation.businesses?.name ?? 'İşletme'}
      </span>
      <button
        type="button"
        onClick={handleExit}
        disabled={ending}
        className="rounded-full bg-amber-950/10 px-3 py-1 text-xs font-semibold hover:bg-amber-950/20 disabled:opacity-60"
      >
        {ending ? 'Çıkılıyor…' : "İşletmeden Çık"}
      </button>
    </div>
  )
}
