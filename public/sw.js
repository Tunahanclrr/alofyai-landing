// AlofyAI push bildirim service worker'ı. Sekme/uygulama kapalıyken bile
// bildirimin görünebilmesi için tarayıcı bunu arka planda çalıştırır — sayfa
// JS'inden bağımsızdır, bu yüzden ayrı bir dosya (public/sw.js) olarak kalır.

self.addEventListener('push', (event) => {
  let data = { title: 'AlofyAI', body: 'Yeni bir bildiriminiz var.' }
  try {
    if (event.data) data = { ...data, ...event.data.json() }
  } catch {
    // JSON değilse varsayılan metinle devam
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/Adsiz_tasarim.png',
      badge: '/Adsiz_tasarim.png',
      data: { url: data.url || '/app/notifications' },
    })
  )
})

// targetUrl her zaman kendi kaydına (örn. ?reservation=<id>) işaret eder —
// açık bir sekme varsa onu DOĞRUDAN o kayda yönlendiririz (genel listeye
// değil), yoksa yeni bir pencere o adresle açılır.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/app/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clients) => {
      const client = clients.find((c) => 'focus' in c)
      if (client) {
        await client.focus()
        if ('navigate' in client) return client.navigate(targetUrl)
        return
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
