import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    // Tailwind v4 is CSS-first: no tailwind.config.js needed, the plugin picks up
    // the `@import "tailwindcss"` in src/index.css and scans source files itself.
    tailwindcss(),
    VitePWA({
      // Regenerate the service worker on every rebuild and let it take over
      // existing clients without a manual "reload to update" step.
      registerType: 'autoUpdate',
      // Makes the SW active during `npm run dev` too, so PWA work can be tested
      // without doing a production build first.
      devOptions: { enabled: true },
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'Piggy Tracking',
        short_name: 'Piggy',
        description: 'Piggy Tracking — full-stack TypeScript starter',
        theme_color: '#0f172a',
        background_color: '#0f172a',
        display: 'standalone',
        start_url: '/',
        // Placeholder icons — swap these for real 192/512 PNGs before shipping.
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
  },
})
