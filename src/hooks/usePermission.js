import { useBusiness } from '../context/BusinessContext'

// Aktif işletme bağlamında yetki kontrolü. BusinessContext, has_permission()
// RPC'sinin arkasındaki aynı role_permissions verisini login'de bir kez
// çeker; bu hook onu sarmalar — UI gating ile backend enforcement (RLS/RPC
// içindeki has_permission()) her zaman aynı veriye dayanır.
export function usePermission(key) {
  const { hasPermission, loading } = useBusiness()
  return { allowed: hasPermission(key), loading }
}
