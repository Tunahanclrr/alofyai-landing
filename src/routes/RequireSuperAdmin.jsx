import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import FullscreenLoader from '../components/FullscreenLoader'

export default function RequireSuperAdmin() {
  const { user, isSuperAdmin, loading: authLoading } = useAuth()

  if (authLoading) return <FullscreenLoader />

  if (!user) return <Navigate to="/login" replace />
  if (!isSuperAdmin) return <Navigate to="/app" replace />

  return <Outlet />
}
