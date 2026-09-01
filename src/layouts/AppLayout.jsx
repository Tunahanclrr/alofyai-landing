import { Navigate, useNavigate } from 'react-router-dom'
import DashboardShell from '../components/DashboardShell'
import Button from '../components/Button'
import ImpersonationBanner from '../components/ImpersonationBanner'
import FullscreenLoader from '../components/FullscreenLoader'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import CreateBusinessForm from '../app/CreateBusinessForm'

const BEAUTY_NAV = [
  { to: '/app/dashboard', label: 'Panel', end: true },
  { to: '/app/appointments', label: 'Randevular' },
  { to: '/app/customers', label: 'Müşteriler' },
  { to: '/app/staff', label: 'Personeller' },
  { to: '/app/services', label: 'Hizmetler' },
  { to: '/app/packages', label: 'Paketler' },
  { to: '/app/payments', label: 'Ödemeler' },
  { to: '/app/calls', label: 'Çağrılar' },
  { to: '/app/notifications', label: 'Bildirimler' },
  { to: '/app/reports', label: 'Raporlar' },
  { section: 'Ayarlar' },
  { to: '/app/settings/business', label: 'İşletme Ayarları' },
]

const RESTAURANT_NAV = [
  { to: '/app/dashboard', label: 'Panel', end: true },
  { to: '/app/restaurant/reservations', label: 'Rezervasyonlar' },
  { to: '/app/restaurant/tables', label: 'Masalar' },
  { to: '/app/customers', label: 'Müşteriler' },
  { to: '/app/restaurant/menu', label: 'Menü' },
  { to: '/app/calls', label: 'Çağrılar' },
  { to: '/app/notifications', label: 'Bildirimler' },
  { to: '/app/reports', label: 'Raporlar' },
  { section: 'Ayarlar' },
  { to: '/app/settings/business', label: 'İşletme Ayarları' },
]

export default function AppLayout() {
  const navigate = useNavigate()
  const { profile, signOut } = useAuth()
  const { activeBusiness, memberships, isSuperAdmin, loading } = useBusiness()

  const handleSignOut = async () => {
    await signOut()
    navigate('/login', { replace: true })
  }

  if (loading) {
    return <FullscreenLoader />
  }

  if (!activeBusiness && memberships.length === 0) {
    if (isSuperAdmin) return <Navigate to="/admin/dashboard" replace />
    return <CreateBusinessForm />
  }

  if (!activeBusiness) {
    return <FullscreenLoader />
  }

  const navItems = activeBusiness.type === 'restaurant' ? RESTAURANT_NAV : BEAUTY_NAV

  return (
    <DashboardShell
      brand={activeBusiness.name}
      navItems={navItems}
      banner={<ImpersonationBanner />}
      headerExtra={
        <>
          <span className="hidden text-sm text-slate-500 sm:inline">{profile?.full_name || 'Kullanıcı'}</span>
          <Button variant="secondary" size="sm" onClick={handleSignOut}>
            Çıkış Yap
          </Button>
        </>
      }
    />
  )
}
