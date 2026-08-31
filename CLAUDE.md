# Piggy Tracking — repo guide

Expense/receipt tracker. Full-stack TypeScript monorepo, npm only (no yarn/pnpm).

Area-specific guides load automatically when you touch those directories:
- `backend/CLAUDE.md` — Express + Prisma + **the database/schema/migrations**
- `frontend/CLAUDE.md` — React + Vite + Tailwind + PWA

## Layout

```
frontend/            React 19 + Vite 8 SPA. Runs NATIVELY — never containerised.
backend/             Express 5 + Prisma 7 API. Containerised.
  prisma/            schema.prisma, migrations/, seed.ts  ← the database lives here
docker-compose.yml   Two services only: db + backend.
.env                 Gitignored. Copy from .env.example.
```

**The central asymmetry: the frontend is deliberately outside Docker.** It is not
in `docker-compose.yml` and has no Dockerfile, so Vite's HMR stays fast. This
means two processes and two terminals, and it is why the backend needs CORS.
Do not "helpfully" containerise the frontend.

## Running it

```bash
cp .env.example .env                  # first time only
cd frontend && npm install            # first time only; backend deps live in its image

docker compose up --build             # terminal 1 → db :5432, API :3000
cd frontend && npm run dev            # terminal 2 → UI :5173

docker compose exec backend npm run seed    # example data (user 1 + receipt + 2 txns)
```

`docker compose up` runs `prisma migrate deploy` before the server starts, so the
schema is applied on every boot.

Docker on this machine is **Colima**. If `docker` reports it cannot reach the
daemon, run `colima start` (it takes ~1 min) — Docker Desktop is not installed.

## Config

All config is in the **repo-root `.env`**, read by both docker-compose and by
host-run commands. There is no `backend/.env`. Keys: `POSTGRES_USER`,
`POSTGRES_PASSWORD`, `POSTGRES_DB`, `POSTGRES_PORT`, `BACKEND_PORT`,
`CORS_ORIGIN`, `DATABASE_URL`, plus the auth block: `GOOGLE_CLIENT_ID`,
`JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ACCESS_TOKEN_EXPIRY`,
`REFRESH_TOKEN_EXPIRY_DAYS`.

The frontend has its own `frontend/.env.local` (template: `frontend/.env.example`)
for `VITE_API_URL` and `VITE_GOOGLE_CLIENT_ID`. **`VITE_GOOGLE_CLIENT_ID` and the
backend's `GOOGLE_CLIENT_ID` must be the same value** — the backend rejects any
ID token whose `aud` is not its own client ID, so a mismatch fails every login.

`DATABASE_URL` in `.env` points at `localhost:5432` and is only for commands you
run on the host. The backend **container** builds its own URL from the
`POSTGRES_*` vars using the compose hostname `db` — see `docker-compose.yml`.
Changing the database name/user means updating both places.

Never commit `.env`. When you add a key, add it to `.env.example` too.

## Auth

Google OAuth with rotating refresh tokens. The shape, in one paragraph so nobody
reinvents it: the frontend gets a Google **ID token**, posts it to
`POST /api/auth/google`, and receives a short-lived **access token** (JWT, payload
is `{ userId }` and nothing else) in the JSON body plus a **refresh token** in an
httpOnly cookie. The access token is held in React state — never `localStorage`.
`POST /api/auth/refresh` rotates: it revokes the presented token and issues a
replacement, and is also the silent-login call on page load.

Two rules that are easy to break:

- **Routes take their `userId` from the access token, never from the request.**
  `?userId=` and body `userId` are gone; `authedUserId(req)` is the only source.
  A new route touching user data mounts `requireAuth` and scopes by it.
- **Raw refresh tokens exist only in the `Set-Cookie` header.** The database
  stores a SHA-256 hash. Never log one, never put one in a response body.

Details — rotation, the cookie flags, reuse detection — live in `backend/CLAUDE.md`.

## Conventions

- TypeScript everywhere, `strict` on. No `any` — prefer a narrow type or `unknown`.
- There is **no Prettier or ESLint config**; match the surrounding style by hand:
  single quotes, no semicolons, 2-space indent, trailing commas in multiline.
  (`frontend/` has oxlint, which is a linter only — it does not format.)
- Comment the non-obvious *why*, not the *what*. Existing comments explain
  version quirks and cross-cutting decisions; keep that bar.
- Money is `DECIMAL(10,2)` in the DB and crosses the API as a **string**
  (`"48.75"`), never a float. See `backend/CLAUDE.md`.

## Definition of done

This repo is verified by actually running things, not by assuming. Before
claiming a change works:

1. `cd backend && npx tsc --noEmit`
2. `docker compose up --build -d backend` and check `docker compose logs backend`
3. `curl` the affected endpoints and confirm status codes and bodies
4. `cd frontend && npm run build` if you touched the frontend
5. For schema changes, also run the migration + seed and check the data in `psql`

A full clean-slate check is `docker compose down -v && docker compose up --build`,
which replays every migration from an empty database.

## Keeping these files current

These three files are the project's memory — agents read them before planning,
so a stale line here becomes a wrong decision later. Update them **in the same
change** that makes them stale, not afterwards:

| You changed | Update |
|---|---|
| a dependency major, or a pinned version | the relevant guide's version notes |
| `schema.prisma`, or relation/delete behaviour | `backend/CLAUDE.md` → Data model |
| routes, status codes, request/response shapes | `backend/CLAUDE.md` + `README.md` |
| `.env` keys, ports, compose services | this file + `.env.example` + `README.md` |
| auth: token lifetimes, cookie flags, what a route trusts | this file's Auth section + `backend/CLAUDE.md` |

Record the *why* and the traps — version quirks, non-obvious constraints,
decisions that look wrong but aren't. Do not restate what the code already says;
`README.md` is the human-facing setup doc and does not need duplicating here.
