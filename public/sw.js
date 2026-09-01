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

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const targetUrl = event.notification.data?.url || '/app/notifications'
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if (client.url.includes(targetUrl) && 'focus' in client) return client.focus()
      }
      if (clients.length > 0 && 'focus' in clients[0]) {
        clients[0].navigate(targetUrl)
        return clients[0].focus()
      }
      return self.clients.openWindow(targetUrl)
    })
  )
})
