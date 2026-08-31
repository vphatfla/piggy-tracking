# Frontend guide

React 19 + Vite 8 + TypeScript, built as a **static SPA**. No SSR, no Next.js —
`npm run build` must keep producing a plain `dist/` that any static host serves.

**This app is not containerised and must stay that way.** It has no Dockerfile
and is absent from `docker-compose.yml`; it runs natively so HMR stays fast. The
backend is a separate origin (`:3000` vs `:5173`), which is why CORS exists.

## Commands

```bash
npm run dev        # http://localhost:5173 with HMR
npm run build      # tsc -b && vite build → dist/
npm run preview    # serve the production build
npm run lint       # oxlint (NOT eslint — see below)
```

`npm run dev` needs the backend up (`docker compose up` at the repo root) or
every request fails and the UI shows an error banner.

## Tailwind v4 — there is no config file

Tailwind is v4 via the `@tailwindcss/vite` plugin. **v4 is CSS-first: there is no
`tailwind.config.js`, and creating one will not do anything.** Configuration —
theme tokens, custom utilities — goes in `src/index.css` next to
`@import "tailwindcss"`, using `@theme`/`@utility`. The plugin scans sources
itself; there is no `content` array to maintain.

If you find yourself reaching for `tailwind.config.js`, you are following v3
instructions and they do not apply.

Styling is utility classes inline in JSX. No CSS modules, no styled-components,
and `src/App.css` was deliberately deleted — don't reintroduce per-component
stylesheets.

## PWA

`vite-plugin-pwa` is configured in `vite.config.ts` with `registerType: 'autoUpdate'`
and `devOptions.enabled` (so the service worker is live in dev too). It is
scaffolding for later work — the install prompt is not built out yet.

- `public/pwa-192x192.png` and `pwa-512x512.png` are **flat-colour placeholders**.
  Replace them with real icons before shipping; the manifest already references them.
- Dev builds emit `dev-dist/`. It is ignored by the **root** `.gitignore`, not
  this directory's — don't be surprised when it appears.
- A stale service worker is the usual reason a change "doesn't show up" in dev.
  Hard-reload or unregister it before debugging further.

## Backend calls

All HTTP goes through `src/api.ts`. **Add a typed function there rather than
calling `fetch` from a component.** Base URL is `import.meta.env.VITE_API_URL`,
defaulting to `http://localhost:3000`; override in `frontend/.env.local`.

Types in `src/api.ts` mirror the backend's serialization contract, so:

- **Money is a `string`, not a `number`** (`amount: "48.75"`). It is
  `DECIMAL(10,2)` in Postgres and stays a string end to end so cents can't drift
  through float rounding. Convert with `Number(...)` only for display arithmetic,
  and send strings back on POST.
- `Receipt.date` is `"YYYY-MM-DD"`, not an ISO timestamp.

Error bodies are `{ error: string }`; `request()` already unwraps them into the
thrown `ApiError`, which carries `.status` — the mount effect uses it to tell a
routine "no session" 401 from a real failure.

**Every data call takes the access token as its first argument.** None of them
take a `userId` any more: the backend derives it from the token, so there is no
id to pass and no way to ask for someone else's rows.

`ApiError` declares `status` as a field and assigns it in the constructor rather
than using a parameter property — `tsconfig.app.json` sets `erasableSyntaxOnly`,
which rejects the shorthand.

## Auth

`src/App.tsx` owns the session as a three-state machine: `restoring` →
`authenticated` | `anonymous`.

- On mount it calls `refreshSession()` (`POST /api/auth/refresh` with
  `credentials: 'include'`). A 401 is the normal "nothing to restore" answer, not
  an error — it just renders `<SignIn />`.
- **`credentials: 'include'` is mandatory on every `/api/auth` call.** Without it
  the browser neither sends nor stores the httpOnly refresh cookie, and sessions
  silently stop surviving a reload.
- **The access token lives in React state only.** Never `localStorage` or
  `sessionStorage` — anything an XSS can read, it can exfiltrate, and the token
  would outlive the tab.
- The mount effect is guarded by a `useRef` flag. This is not cosmetic:
  refreshing **rotates** the token, so StrictMode's double-invoked effect would
  present an already-revoked cookie on the second call and log the user out. Do
  not remove the guard.
- `src/google.ts` injects Google Identity Services from its CDN on demand and
  memoises the promise. `VITE_GOOGLE_CLIENT_ID` must equal the backend's
  `GOOGLE_CLIENT_ID`; when it is unset, `<SignIn />` says so rather than
  rendering a button that cannot work.
- Sign-out calls `google.accounts.id.disableAutoSelect()` before clearing state,
  or One Tap signs the user straight back in.

## App.tsx is a smoke screen, not the product

`src/App.tsx` exists to prove the frontend → backend → database path works end to
end — sign in, list your own transactions, add one, sign out. The `Dashboard`
half is placeholder UI and is meant to be replaced; the session machinery around
it is not. The seeded demo user cannot be logged into, because its `googleId` is
a made-up string rather than a real Google `sub`.

## Toolchain notes

- The linter is **oxlint**, not ESLint (`.oxlintrc.json`). It lints only; there
  is no formatter, so match surrounding style by hand — single quotes, no
  semicolons, 2-space indent.
- `npm run lint` exits 0 but has **one known standing warning**:
  `react(set-state-in-effect)` on `Dashboard`'s mount-time fetch in `App.tsx`. It is
  expected — you did not introduce it. Any *other* diagnostic is yours to fix.
- `tsconfig.json` is a solution file with project references to
  `tsconfig.app.json` (browser code) and `tsconfig.node.json` (Vite config).
  Compiler options go in the referenced file, not the root one. `npm run build`
  runs `tsc -b`, so a type error fails the build.
- TypeScript is on the `~6.0.x` line and React on 19 — check the version before
  trusting older API guidance.
