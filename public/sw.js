/* Push-only service worker. No offline cache, no intercepted orders or account responses. */
self.addEventListener('install', event => event.waitUntil(self.skipWaiting()));
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));
self.addEventListener('push', event => {
    let data = {};
    try { data = event.data ? event.data.json() : {}; } catch { /* Generic visible fallback. */ }
    if (!data || typeof data !== 'object') data = {};
    const fresh = typeof data.expiresAt === 'number' && data.expiresAt > Date.now();
    // Always show a visible notification, even when an expired/malformed message arrives.
    // Stale messages must not instruct someone to collect a meal that is no longer available.
    const title = fresh && typeof data.title === 'string' ? data.title.slice(0, 80) : 'BreakBite update';
    const body = fresh && typeof data.body === 'string' ? data.body.slice(0, 200) : 'Open your inbox to check the latest order status.';
    const tag = typeof data.tag === 'string' && /^bb-[a-f0-9]{32}$/.test(data.tag) ? data.tag : 'bb-update';
    event.waitUntil(self.registration.showNotification(title, {
        body, tag, icon: '/icon-192.png', badge: '/icon-192.png',
        data: { url: '/?view=inbox' }, renotify: false
    }));
});
self.addEventListener('notificationclick', event => {
    event.notification.close();
    event.waitUntil((async () => {
        // Never trust arbitrary notification URLs; opening Inbox does not mutate an order.
        const url = new URL('/?view=inbox', self.location.origin).href;
        const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        const current = windows.find(client => new URL(client.url).origin === self.location.origin);
        if (current) { await current.focus(); current.postMessage({ type: 'OPEN_INBOX' }); }
        else await self.clients.openWindow(url);
    })());
});
