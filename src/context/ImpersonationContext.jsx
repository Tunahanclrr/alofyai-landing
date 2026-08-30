import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'

const ImpersonationContext = createContext(null)

// Super Admin'in "işletme olarak gir" (impersonation) durumunu izler.
// Gerçek Supabase Auth kullanıcısı hiçbir zaman değişmez — sadece aktif bir
// impersonation_sessions kaydı olup olmadığını takip eder; RLS tarafında
// is_impersonating(business_id) bu kaydı kontrol eder (bkz. migration 0002).
export function ImpersonationProvider({ children }) {
  const { user, isSuperAdmin } = useAuth()
  const [session, setSession] = useState(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    if (!user?.id || !isSuperAdmin) {
      setSession(null)
      return
    }
    const { data, error } = await supabase
      .from('impersonation_sessions')
      .select('id, business_id, reason, started_at, businesses(id, name, type, status)')
      .eq('super_admin_id', user.id)
      .is('ended_at', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) {
      console.error('impersonation durumu yüklenemedi', error)
      setSession(null)
      return
    }
    setSession(data)
  }, [user?.id, isSuperAdmin])

  useEffect(() => {
    setLoading(true)
    refresh().finally(() => setLoading(false))
  }, [refresh])

  const startImpersonation = useCallback(
    async (businessId, reason) => {
      const { error } = await supabase.rpc('start_impersonation', {
        p_business_id: businessId,
        p_reason: reason ?? null,
      })
      if (error) throw error
      await refresh()
    },
    [refresh]
  )

  const endImpersonation = useCallback(async () => {
    if (!session?.id) return
    const { error } = await supabase.rpc('end_impersonation', { p_session_id: session.id })
    if (error) throw error
    await refresh()
  }, [session?.id, refresh])

  const value = {
    activeImpersonation: session,
    loading,
    startImpersonation,
    endImpersonation,
    refresh,
  }

  return <ImpersonationContext.Provider value={value}>{children}</ImpersonationContext.Provider>
}

export function useImpersonation() {
  const ctx = useContext(ImpersonationContext)
  if (!ctx) throw new Error('useImpersonation, ImpersonationProvider içinde kullanılmalı')
  return ctx
}
