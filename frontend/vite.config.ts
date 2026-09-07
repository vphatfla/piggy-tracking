import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// Production serves from vphatfla.me/app/piggy-tracking/ (see terraform/ —
// piggy-tracking rides on oppy-marser's existing CloudFront distribution,
// path-routed rather than its own domain/subdomain). Dev stays at `/`: only
// `vite build` (npm run build) needs the prefix, so `npm run dev` is
// unaffected — asset URLs, the PWA scope, and start_url all derive from this
// one constant rather than each hardcoding the path separately and risking
// drift. Keyed on `command`, not `mode`, since this repo has no
// build --mode staging variant to distinguish — "is this a build" is the
// actual question.
export default defineConfig(({ command }) => {
  const base = command === 'build' ? '/app/piggy-tracking/' : '/'

  return {
    base,
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
          // A manifest cannot be media-responsive, so these hold the bright
          // theme's base; index.html's <meta name="theme-color"> pair is what
          // actually follows the OS appearance at runtime.
          theme_color: '#FFFFFF',
          background_color: '#FFFFFF',
          display: 'standalone',
          // Tied to `base`, not hardcoded: the installed PWA's home and the
          // service worker's own scope both need to match wherever this build
          // actually serves from.
          start_url: base,
          scope: base,
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
  }
})
