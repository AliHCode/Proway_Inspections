import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'autoUpdate',
            workbox: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB limit
                navigateFallback: '/index.html',
                runtimeCaching: [
                    {
                        urlPattern: /^https:\/\/.*supabase\.co\/storage\/v1\/.*/i,
                        handler: 'CacheFirst',
                        options: {
                            cacheName: 'supabase-images',
                            expiration: {
                                maxEntries: 300,
                                maxAgeSeconds: 60 * 60 * 24 * 14,
                            },
                        },
                    },
                    {
                        urlPattern: ({ request }) => request.destination === 'image',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'app-images',
                            expiration: {
                                maxEntries: 200,
                                maxAgeSeconds: 60 * 60 * 24 * 7,
                            },
                        },
                    },
                    {
                        urlPattern: ({ request }) => request.destination === 'style' || request.destination === 'script',
                        handler: 'StaleWhileRevalidate',
                        options: {
                            cacheName: 'app-assets',
                        },
                    },
                ],
            },
            manifest: {
                name: 'ProWay Inspections',
                short_name: 'ProWay',
                description: 'RFI Management System for Construction',
                theme_color: '#111827',
                background_color: '#FAFAFA',
                display: 'standalone',
                icons: [
                    { src: '/favicon.png', sizes: '192x192', type: 'image/png' },
                    { src: '/dashboardlogo.png', sizes: '512x512', type: 'image/png' }
                ]
            }
        })
    ],
});
