import { useCallback, useEffect, useState } from 'react'
import { useAuth } from '../context/AuthContext'
import { useBusiness } from '../context/BusinessContext'
import { saveSubscription, deleteSubscription } from '../services/notifications'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

// Push servislerinin beklediği applicationServerKey biçimi (base64url ->
// Uint8Array) — tarayıcı API'sinin kendisi bunu string olarak kabul etmiyor.
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = window.atob(base64)
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
}

export const PUSH_SUPPORTED =
  typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window

// Bu cihazda/tarayıcıda bildirim aboneliğini yönetir — abone olma, iptal
// etme, mevcut durumu yükleme. Her cihaz kendi aboneliğini kendi tutar
// (push_subscriptions.endpoint tarayıcıya özeldir), bu yüzden bu hook
// "bu cihazda bildirimler açık mı" sorusuna cevap verir.
export function usePushSubscription() {
  const { user } = useAuth()
  const { activeBusinessId } = useBusiness()
  const [subscription, setSubscription] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    if (!PUSH_SUPPORTED) {
      setLoading(false)
      return
    }
    let active = true
    navigator.serviceWorker
      .register('/sw.js')
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => {
        if (active) setSubscription(sub)
      })
      .catch(() => {})
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [])

  const subscribe = useCallback(async () => {
    if (!PUSH_SUPPORTED || !activeBusinessId || !user?.id) return
    setError('')
    if (!VAPID_PUBLIC_KEY) {
      setError('Bildirim sistemi henüz yapılandırılmadı (VAPID anahtarı eksik).')
      return
    }
    try {
      const permission = await Notification.requestPermission()
      if (permission !== 'granted') {
        setError('Bildirim izni verilmedi. Tarayıcı ayarlarından izin vermeniz gerekiyor.')
        return
      }
      const registration = await navigator.serviceWorker.register('/sw.js')
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      })
      const { error: saveError } = await saveSubscription(activeBusinessId, user.id, sub.toJSON())
      if (saveError) throw saveError
      setSubscription(sub)
    } catch (err) {
      console.error('push aboneliği başarısız', err)
      setError('Bildirimler açılamadı, lütfen tekrar deneyin.')
    }
  }, [activeBusinessId, user?.id])

  const unsubscribe = useCallback(async () => {
    if (!subscription) return
    setError('')
    try {
      const endpoint = subscription.endpoint
      await subscription.unsubscribe()
      await deleteSubscription(endpoint)
      setSubscription(null)
    } catch (err) {
      console.error('push aboneliği iptal edilemedi', err)
      setError('Bildirimler kapatılamadı, lütfen tekrar deneyin.')
    }
  }, [subscription])

  return { supported: PUSH_SUPPORTED, enabled: Boolean(subscription), loading, error, subscribe, unsubscribe }
}
