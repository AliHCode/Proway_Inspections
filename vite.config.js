import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
    plugins: [
        react(),
        VitePWA({
            registerType: 'prompt',
            // Use injectManifest so we can add push + notificationclick handlers
            strategies: 'injectManifest',
            srcDir: 'src',
            filename: 'sw.js',
            // Disable SW in development so stale cache never blocks hot-reloads
            devOptions: { enabled: false },
            injectManifest: {
                globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
                maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10 MiB
            },
            manifest: {
                id: '/',
                start_url: '/',
                scope: '/',
                name: 'ProWay Inspections',
                short_name: 'ProWay',
                description: 'RFI Management System for Construction',
                theme_color: '#111827',
                background_color: '#FAFAFA',
                display: 'standalone',
                display_override: ['standalone', 'minimal-ui', 'browser'],
                icons: [
                    { src: '/favicon.png', sizes: '192x192', type: 'image/png', purpose: 'any maskable' },
                    { src: '/dashboardlogo.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' }
                ]
            }
        })
    ],
});
