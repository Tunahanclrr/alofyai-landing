import { createContext, useContext, useEffect, useState, useCallback, useMemo } from 'react'
import { supabase } from '../lib/supabaseClient'
import { useAuth } from './AuthContext'
import { useImpersonation } from './ImpersonationContext'

const BusinessContext = createContext(null)

export function BusinessProvider({ children }) {
  const { user, isSuperAdmin } = useAuth()
  const { activeImpersonation } = useImpersonation()
  const [memberships, setMemberships] = useState([])
  const [activeBusinessId, setActiveBusinessId] = useState(null)
  const [permissionKeys, setPermissionKeys] = useState(new Set())
  const [loading, setLoading] = useState(true)

  const fetchMemberships = useCallback(async (userId) => {
    return supabase
      .from('business_members')
      .select('id, business_id, role_id, status, roles(key, name), businesses(id, name, type, status, timezone)')
      .eq('user_id', userId)
      .eq('status', 'active')
  }, [])

  const loadMemberships = useCallback(
    async (userId) => {
      if (!userId) {
        setMemberships([])
        return
      }
      const { data, error } = await fetchMemberships(userId)
      if (error) {
        console.error('işletme üyelikleri yüklenemedi', error)
        setMemberships([])
        return
      }
      setMemberships(data ?? [])
    },
    [fetchMemberships]
  )

  // Bir işletme yeni oluşturulduğunda kullanılır: taze bir Supabase Auth
  // oturumunun JWT'si (asimetrik imzalı) veritabanı tarafında doğrulanabilir
  // olana kadar birkaç saniyelik bir yayılma gecikmesi olabiliyor — bu durumda
  // (SADECE burada, genel yüklemede DEĞİL) beklenen business_id görünene kadar
  // artan gecikmelerle tekrar denenir.
  const waitForMembership = useCallback(
    async (userId, expectedBusinessId) => {
      const retryDelaysMs = [0, 400, 800, 1500, 2500, 3000]
      for (const delay of retryDelaysMs) {
        if (delay) await new Promise((resolve) => setTimeout(resolve, delay))
        const { data, error } = await fetchMemberships(userId)
        if (error) {
          console.error('işletme üyelikleri yüklenemedi', error)
          continue
        }
        if ((data ?? []).some((m) => m.business_id === expectedBusinessId)) {
          setMemberships(data)
          return true
        }
      }
      return false
    },
    [fetchMemberships]
  )

  useEffect(() => {
    setLoading(true)
    loadMemberships(user?.id).finally(() => setLoading(false))
  }, [user?.id, loadMemberships])

  // İmpersonation aktifse, gerçek üyeliklerin yanına o business için
  // "sanal" (owner-eşdeğeri) bir üyelik ekleriz — RLS tarafında zaten
  // is_impersonating() bunu tam yetki olarak kabul ediyor (migration 0002),
  // burada da aynı davranışı client tarafında yansıtıyoruz.
  const effectiveMemberships = useMemo(() => {
    if (!activeImpersonation) return memberships
    const already = memberships.some((m) => m.business_id === activeImpersonation.business_id)
    if (already) return memberships
    return [
      ...memberships,
      {
        id: `impersonation:${activeImpersonation.id}`,
        business_id: activeImpersonation.business_id,
        role_id: null,
        status: 'active',
        isImpersonation: true,
        roles: { key: 'owner', name: 'İşletme Sahibi (Impersonation)' },
        businesses: activeImpersonation.businesses,
      },
    ]
  }, [memberships, activeImpersonation])

  // Aktif impersonation varsa panel otomatik olarak o işletmeye geçer.
  useEffect(() => {
    if (activeImpersonation) {
      setActiveBusinessId(activeImpersonation.business_id)
    }
  }, [activeImpersonation])

  useEffect(() => {
    setActiveBusinessId((current) => {
      if (current && effectiveMemberships.some((m) => m.business_id === current)) return current
      return effectiveMemberships[0]?.business_id ?? null
    })
  }, [effectiveMemberships])

  const activeMembership = useMemo(
    () => effectiveMemberships.find((m) => m.business_id === activeBusinessId) ?? null,
    [effectiveMemberships, activeBusinessId]
  )

  useEffect(() => {
    let active = true
    async function loadPermissions() {
      if (!activeMembership || activeMembership.isImpersonation) {
        setPermissionKeys(new Set())
        return
      }
      const { data, error } = await supabase
        .from('role_permissions')
        .select('permission_key')
        .eq('role_id', activeMembership.role_id)
      if (!active) return
      if (error) {
        console.error('yetkiler yüklenemedi', error)
        setPermissionKeys(new Set())
        return
      }
      setPermissionKeys(new Set((data ?? []).map((row) => row.permission_key)))
    }
    loadPermissions()
    return () => {
      active = false
    }
  }, [activeMembership])

  const hasPermission = useCallback(
    (key) => Boolean(activeMembership?.isImpersonation) || permissionKeys.has(key),
    [permissionKeys, activeMembership]
  )

  const refresh = useCallback(() => loadMemberships(user?.id), [loadMemberships, user?.id])
  const confirmNewBusiness = useCallback(
    (businessId) => waitForMembership(user?.id, businessId),
    [waitForMembership, user?.id]
  )

  const value = {
    memberships: effectiveMemberships,
    activeMembership,
    activeBusiness: activeMembership?.businesses ?? null,
    activeBusinessId,
    setActiveBusinessId,
    permissionKeys,
    hasPermission,
    isSuperAdmin,
    loading,
    refresh,
    confirmNewBusiness,
  }

  return <BusinessContext.Provider value={value}>{children}</BusinessContext.Provider>
}

export function useBusiness() {
  const ctx = useContext(BusinessContext)
  if (!ctx) throw new Error('useBusiness, BusinessProvider içinde kullanılmalı')
  return ctx
}
