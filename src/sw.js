import { precacheAndRoute, createHandlerBoundToURL, cleanupOutdatedCaches } from 'workbox-precaching';
import { registerRoute, NavigationRoute } from 'workbox-routing';
import { CacheFirst, StaleWhileRevalidate, NetworkFirst } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';

// Remove outdated precaches from previous SW versions immediately on install
cleanupOutdatedCaches();

// Take control of all clients immediately — no waiting for tabs to close
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// Inject the precache manifest (populated by vite-plugin-pwa at build time)
precacheAndRoute(self.__WB_MANIFEST);

// SPA navigation fallback — all navigation requests serve index.html
registerRoute(new NavigationRoute(createHandlerBoundToURL('/index.html')));

// Supabase storage images — long-lived cache
registerRoute(
    ({ url }) =>
        url.hostname.includes('supabase.co') && url.pathname.startsWith('/storage/v1/'),
    new CacheFirst({
        cacheName: 'supabase-images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 300,
                maxAgeSeconds: 60 * 60 * 24 * 14, // 14 days
            }),
        ],
    })
);

// App images
registerRoute(
    ({ request }) => request.destination === 'image',
    new StaleWhileRevalidate({
        cacheName: 'app-images',
        plugins: [
            new ExpirationPlugin({
                maxEntries: 200,
                maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
            }),
        ],
    })
);

// Styles and scripts — NetworkFirst so updated code is always served fresh
registerRoute(
    ({ request }) =>
        request.destination === 'style' || request.destination === 'script',
    new NetworkFirst({
        cacheName: 'app-assets',
        plugins: [
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 }),
        ],
    })
);

// ─── Push Notification Handler ─────────────────────────────────────────────
// Triggered when a push message is received from a VAPID server.
// Example payload: { "title": "RFI Approved", "body": "...", "rfiId": "...", "url": "/" }
self.addEventListener('push', (event) => {
    if (!event.data) return;

    event.waitUntil((async () => {
        let data;
        try {
            data = event.data.json();
        } catch {
            data = { title: 'ProWay Inspections', body: event.data.text() };
        }

        const openClients = await clients.matchAll({ type: 'window', includeUncontrolled: true });
        const hasFocusedClient = openClients.some((client) => client.focused);
        if (hasFocusedClient) return;

        const title = data.title || 'ProWay Inspections';
        const options = {
            body: data.body || data.message || '',
            icon: '/favicon.png',
            badge: '/favicon.png',
            tag: data.tag || 'proway-notification',
            renotify: true,
            data: { url: data.url || '/', rfiId: data.rfiId || null },
        };

        await self.registration.showNotification(title, options);
    })());
});

// ─── Notification Click Handler ────────────────────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const url = event.notification.data?.url || '/';

    event.waitUntil(
        clients
            .matchAll({ type: 'window', includeUncontrolled: true })
            .then((windowClients) => {
                // Focus existing window if available
                for (const client of windowClients) {
                    if (
                        client.url.includes(self.location.origin) &&
                        'focus' in client
                    ) {
                        return client.focus().then(() => client.navigate(url));
                    }
                }
                // Otherwise open a new window
                return clients.openWindow(url);
            })
    );
});

// ─── Message Handler ───────────────────────────────────────────────────────
// Handles messages posted from the main app thread.
self.addEventListener('message', (event) => {
    if (!event.data) return;

    // Activate new SW immediately (used in autoUpdate flow)
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
        return;
    }

    // Show a notification on behalf of the app (used for background-tab alerts)
    if (event.data.type === 'SHOW_NOTIFICATION') {
        const { title, body, rfiId } = event.data;
        self.registration.showNotification(title, {
            body,
            icon: '/favicon.png',
            badge: '/favicon.png',
            tag: 'proway-notification',
            renotify: true,
            data: { rfiId: rfiId || null, url: '/' },
        });
    }
});
