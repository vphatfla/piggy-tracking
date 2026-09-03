# Piggy Tracking — repo guide

Expense/receipt tracker. Full-stack TypeScript monorepo, npm only (no yarn/pnpm).

Area-specific guides load automatically when you touch those directories:
- `backend/CLAUDE.md` — Express + Prisma + **the database/schema/migrations**
- `frontend/CLAUDE.md` — React + Vite + Tailwind + PWA, and **the Apple-HIG
  design language**: the two themes, the colour tokens, type scale and spacing

## Layout

```
frontend/            React 19 + Vite 8 SPA. Runs NATIVELY — never containerised.
backend/             Express 5 + Prisma 7 API. Containerised.
  prisma/            schema.prisma, migrations/, seed.ts  ← the database lives here
docker-compose.yml   Two services only: db + backend.
docs/                Design records: the reasoning behind a decision, kept
                     whether or not it is built yet.
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

docker compose exec backend npm run seed    # example data (user 1, 7 categories, receipt, 2 txns, 3 budgets)
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

## The product shape

Four decisions that the schema and the UI both depend on. They are settled;
re-deriving them from the code is slower than reading this.

- **The budget period is a calendar month, and the month is the unit of the
  screen.** The dashboard opens on the current month and shows that month's
  transactions and total. Multi-month is the same API call with wider bounds —
  `GET /api/transactions` takes `?from=&to=`, and there is deliberately no
  `?month=` endpoint for the two to drift apart.
- **A transaction carries its own spending date**, `Transaction.date`, which is
  not `createdAt`. Diverging those puts money in the wrong month.
- **Every transaction the app creates is categorised.** `Transaction.categoryId`
  is nullable in the database only so deleting a category cannot delete the
  spending; the API requires one on create. NULL means "its category was
  deleted", never "the user skipped it".
- **Budget limits are per-category and per-month, and they inherit forward.**
  Not one overall cap, and not a single `budget` column on the category — that
  would retroactively re-score past months. The limit in force for a month is
  the most recent row at or before it, so editing an inherited limit inserts a
  row for the month in view and leaves history scoring as it did. Built; the
  reasoning behind every part of it is `docs/budgets.md`, which is still the
  file to read before changing the model.

## Where this is going

Shipped: spending dates, the month view with optional sorting, categories with
an inline-create picker, tap-to-expand editing and deletion, and per-category
monthly budgets with a spent-vs-limit breakdown.

The two roadmap milestones were built in the other order, and that is worth
knowing: **budgets landed first, and the breakdown came with them** — the
dashboard already holds one month of transactions, so grouping them by category
in the client cost nothing and needed no endpoint.

What is left:

1. **Spending by category, on the server** — `GET /api/transactions/summary?from=&to=`
   aggregating in Postgres (`GROUP BY categoryId`, `SUM(amount)`), returning the
   `categoryId` as well as the name because budgets join on it, and **including
   a bucket for `categoryId IS NULL`** or the parts stop summing to the whole.
   Not urgent: it buys nothing while the client already has the rows. It becomes
   necessary the day a month's transactions are paginated, or the day a range
   wider than one month needs a total — which is also when the client-side sort
   has to move. Both are marked in `frontend/CLAUDE.md`.
2. **An overall monthly cap**, if it is ever wanted. Deliberately absent today:
   limits are per-category only, so the month header shows spending with nothing
   to compare it against. If it is added, read the NULL-`categoryId` trap in
   `docs/budgets.md` first — the obvious implementation silently enforces
   nothing.

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
| a settled product decision, or a milestone shipped | this file's Product shape / Where this is going |
| anything about budgets — the model, inheritance, the routes | `docs/budgets.md` |

Record the *why* and the traps — version quirks, non-obvious constraints,
decisions that look wrong but aren't. Do not restate what the code already says;
`README.md` is the human-facing setup doc and does not need duplicating here.
