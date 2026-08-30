import { useNavigate } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell'
import Button from '../components/Button'
import { useAuth } from '../context/AuthContext'

const NAV_ITEMS = [
  { to: '/admin/dashboard', label: 'Panel', end: true },
  { to: '/admin/businesses', label: 'İşletmeler' },
  { to: '/admin/users', label: 'Kullanıcılar' },
  { section: 'AI & Telefon' },
  { to: '/admin/agents', label: 'AI Agentlar' },
  { to: '/admin/phone-numbers', label: 'Telefon Numaraları' },
  { to: '/admin/calls', label: 'Çağrılar' },
  { to: '/admin/usage', label: 'AI Kullanımı' },
  { section: 'Faturalandırma' },
  { to: '/admin/subscriptions', label: 'Abonelikler' },
  { to: '/admin/payments', label: 'Ödemeler' },
  { section: 'Sistem' },
  { to: '/admin/logs', label: 'Sistem Logları' },
  { to: '/admin/settings', label: 'Ayarlar' },
]

export default function AdminLayout() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  return (
    <DashboardShell
      brand="Super Admin"
      navItems={NAV_ITEMS}
      headerExtra={
        <>
          <span className="hidden text-sm text-slate-500 sm:inline">{profile?.full_name || 'Yönetici'}</span>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            Çıkış Yap
          </Button>
        </>
      }
    />
  )
}
