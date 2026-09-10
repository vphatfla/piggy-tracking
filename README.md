# Piggy Tracking

Full-stack TypeScript monorepo.

```
.
├── frontend/           React + Vite + TypeScript SPA (Tailwind v4, vite-plugin-pwa)
│                       Runs natively — NOT containerised.
├── backend/            Express 5 + TypeScript + Prisma (PostgreSQL)
│                       Containerised (backend/Dockerfile).
├── docker-compose.yml  db (postgres:16-alpine) + backend only
├── .env.example        Template — copy to .env
└── README.md
```

The frontend is deliberately outside Docker so Vite's dev server and HMR stay fast.
That means **two commands** to run the app locally (see below).

## First-time setup

```bash
# 1. Config — the backend + db read this file via docker-compose
cp .env.example .env

# 2. Frontend dependencies (the backend's deps are installed inside its image)
cd frontend && npm install && cd ..

# 3. Frontend config — needed for the Google sign-in button
cp frontend/.env.example frontend/.env.local
```

Then put your Google OAuth client ID in **both** `.env` (`GOOGLE_CLIENT_ID`) and
`frontend/.env.local` (`VITE_GOOGLE_CLIENT_ID`), and replace the two placeholder
JWT secrets in `.env` with `openssl rand -base64 48` output. See [Auth](#auth).

## Running it

Two terminals:

```bash
# Terminal 1 — Postgres + backend API on http://localhost:3000
docker compose up --build     # drop --build after the first run

# Terminal 2 — the UI on http://localhost:5173
cd frontend && npm run dev
```

`docker compose up` runs `prisma migrate deploy` before starting the server, so the
schema is applied automatically on every boot.

Seed the example rows (once the stack is up):

```bash
docker compose exec backend npm run seed
```

## Endpoints

| Method | Path                     | Auth | Notes                                              |
| ------ | ------------------------ | ---- | -------------------------------------------------- |
| GET    | `/api/health`            | —    | Liveness probe, does not touch the DB              |
| POST   | `/api/auth/google`       | —    | `{ idToken }` → `{ accessToken, user }` + sets the refresh cookie |
| POST   | `/api/auth/refresh`      | cookie | Rotates the refresh token → `{ accessToken, user }` |
| POST   | `/api/auth/logout`       | cookie | Revokes this session, clears the cookie          |
| POST   | `/api/auth/logout-all`   | bearer | Revokes every session for the user               |
| GET    | `/api/users/me`          | bearer | The authenticated user                           |
| GET    | `/api/users/:id`         | bearer | Only your own id; `403` otherwise                |
| GET    | `/api/receipts`          | bearer | Your receipts, newest first                      |
| POST   | `/api/receipts`          | bearer | `{ date: "YYYY-MM-DD", totalAmount, receiptFileName? }` |
| GET    | `/api/transactions`      | bearer | Your transactions, newest first; `?from=&to=` filters by date (inclusive) |
| POST   | `/api/transactions`      | bearer | `{ merchantName, amount, categoryId, date: "YYYY-MM-DD", receiptId? }` |
| PATCH  | `/api/transactions/:id`  | bearer | Partial — only the fields present are written    |
| DELETE | `/api/transactions/:id`  | bearer | `204`. Hard delete, no undo                      |
| GET    | `/api/categories`        | bearer | Your categories, A–Z                             |
| POST   | `/api/categories`        | bearer | `{ name }` — find-or-create; `200` if it existed, `201` if made |
| PATCH  | `/api/categories/:id`    | bearer | `{ name }` — rename; `409` if you already have that name |
| DELETE | `/api/categories/:id`    | bearer | `204`. Its transactions survive as uncategorised; its budgets go |
| GET    | `/api/budgets`           | bearer | `?month=YYYY-MM` (required) — the limit *in effect* per category |
| GET    | `/api/budgets/exists`    | bearer | `{ exists: boolean }` — has this user ever set a budget, at all |
| PUT    | `/api/budgets`           | bearer | `{ categoryId, month, amount }` — upserts one month's limit |
| DELETE | `/api/budgets/:categoryId` | bearer | `?month=YYYY-MM`. `204`. Removes that month's row only |

"bearer" means `Authorization: Bearer <access token>`; "cookie" means the
httpOnly `refreshToken` cookie, which browsers only send when the request is made
with `credentials: 'include'`.

**No endpoint takes a `userId`.** It comes from the access token, so a caller can
only ever read and write their own rows. There is no `POST /api/users` either —
users are created solely by `POST /api/auth/google`, from a verified Google ID
token.

Money fields are `DECIMAL(10,2)` and are sent and returned as **strings**
(`"48.75"`), never floats, so cents can't drift through binary rounding.
A transaction carries `categoryId` plus a flattened `category` name; `category`
is `null` only when that category was later deleted, since the API requires one
on create. `Receipt.date` and `Transaction.date` are calendar `DATE`s and
serialise as `YYYY-MM-DD`. `Transaction.date` is **when the money was spent** — not
`createdAt`, which is only when the row was entered. It is required on POST
unless a `receiptId` is given, in which case it defaults to that receipt's date;
the server never substitutes its own "today", which would be a timezone guess
about the user.

Budget limits are **per category, per month, and inherit forward**: the limit in
effect for a month is the most recent row at or before it. `GET` therefore
returns `{ categoryId, amount, month, inherited }`, where `month` is the month
the limit was *set* for — `inherited: true` means it was carried over from
there. A category with no limit at or before the month asked about is **absent**
from the response, which is not the same as a limit of zero. `PUT` for a month
that inherited inserts a new row and leaves the older one scoring the months it
applied to; `DELETE` removes one month's row, after which the category falls
back to inheriting again. See `docs/budgets.md`.

`PATCH` distinguishes an **absent** field from an explicit **null**: omitting
`categoryId` or `receiptId` leaves it alone, while sending `null` clears it.
Present fields are validated exactly as they are on create. A patch with no
recognised field is a `400`. Both `PATCH` and `DELETE` answer `404` for an id
that is not yours — ownership is part of the statement, not a separate check.

Error responses are `{ "error": string }`. Database integrity failures map to
meaningful statuses: `409` for a duplicate `email`/`googleId`, `400` for a
foreign key pointing at a row that does not exist.

```bash
curl localhost:3000/api/health

# Everything else needs a session. Sign in through the UI, then reuse the token:
TOKEN='<accessToken from POST /api/auth/google>'

curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/users/me

curl -X POST localhost:3000/api/transactions \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"merchantName":"Blue Bottle","amount":"6.25","categoryId":3,"date":"2026-09-02"}'

curl -H "Authorization: Bearer $TOKEN" localhost:3000/api/transactions
```

## Auth

Google OAuth, with a short-lived access token and a rotating refresh token.

1. The browser gets a Google **ID token** from Google Identity Services and posts
   it to `POST /api/auth/google`.
2. The backend verifies its signature and audience, finds-or-creates the user on
   the `sub` claim, and returns an **access token** (a JWT whose entire payload is
   `{ userId }`, valid for `ACCESS_TOKEN_EXPIRY`, default 15 minutes).
3. A **refresh token** goes back in an `httpOnly; Secure; SameSite=Strict` cookie
   scoped to `/api/auth`. Only its SHA-256 hash is stored — a database leak
   cannot be replayed as a login.
4. `POST /api/auth/refresh` **rotates**: the presented token is revoked and a new
   one issued, so a stolen cookie works at most once. The frontend calls it on
   page load for silent sign-in.

The frontend keeps the access token in React state, never `localStorage`.

### Getting a client ID

At [console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials):

1. **OAuth consent screen** → User type **External**. While publishing status is
   **Testing**, only accounts listed under **Test users** can sign in — add your
   own there or you will get `access_denied`.
2. **Create credentials → OAuth client ID → Web application**.
3. Add `http://localhost:5173` as an **authorised JavaScript origin**. Leave
   **authorised redirect URIs empty** — Google Identity Services' `renderButton`
   uses a popup, not a redirect. A missing origin shows up as `origin_mismatch`
   in the browser console.

Put that client ID in **both** the root `.env` (`GOOGLE_CLIENT_ID`) and
`frontend/.env.local` (`VITE_GOOGLE_CLIENT_ID`) — the backend rejects tokens
minted for any other audience. The backend checks the value's shape at startup
and refuses to boot on the placeholder, so a forgotten step fails in
`docker compose logs backend` rather than as an unexplained 401 at sign-in.

Signing in with a Google account that has never been seen creates the user
automatically — there is no separate sign-up flow. The seeded demo user cannot
be signed in as; its `googleId` is a made-up string, not a real Google `sub`.

## Data model

Six tables. Three come from the `replace_note_with_core_models` migration:

- **User** — Google OAuth only, so no password column; `email` and `googleId`
  are both unique.
- **Receipt** — belongs to a User. Deleting the user **cascades**, removing
  their receipts.
- **Transaction** — belongs to a User, and *optionally* to a Receipt and a
  Category. Carries its own `date` (the spending date). Deleting the user
  cascades; deleting a receipt sets `receiptId` to **NULL** so the spending
  record survives without its receipt — and keeps its date, which is why the
  date is copied from the receipt rather than read through the relation.
  Deleting a category sets `categoryId` to **NULL** for the same reason.

- **Category** — a user-owned spending label (`add_category_table` migration),
  unique per `(userId, name)`. `Transaction.categoryId` is nullable in the
  database but **required by the API on create**: NULL means "the category was
  deleted", not "the user skipped it". Categories carry no budget column —
  limits are per-month rows in a separate model, see `docs/budgets.md`.

- **Budget** — one spending limit for one `(userId, categoryId, month)`
  (`add_budget_table` migration), unique on that triple. `month` is a
  `VARCHAR(7)` `"YYYY-MM"`, not a DATE — it compares with `<=` exactly as the
  inheritance lookup needs and carries no timezone. Rows are sparse and inherit
  forward, which is why this is a table and not a column on Category: a single
  limit per category would retroactively re-score past months. Deleting a
  category **cascades** its budgets, unlike its transactions.

- **RefreshToken** — one row per issued session token (`add_refresh_tokens`
  migration). Stores `sha256(token)`, never the token. Deleting the user
  cascades, so removing an account ends every session.

Indexed on `Receipt.userId`, `Transaction.userId`, `Transaction.receiptId`,
`Transaction.categoryId`, `Category.userId`, `RefreshToken.userId`,
`Budget.(userId, month)`, and `Transaction.(userId, date)` — the composites are
for month/range queries.

## Backend

Express 5 + Prisma 7. Prisma 7 generates a **TypeScript** client into
`backend/src/generated/prisma` (gitignored, regenerated by `npm run build` and by
the Docker build) and talks to Postgres through the `@prisma/adapter-pg` driver
adapter rather than a bundled query engine.

`prisma` and `tsx` are runtime `dependencies`, not devDependencies, because the
container needs them for `prisma migrate deploy` on startup and `prisma db seed`.

```bash
cd backend
npm install              # only needed to run the backend outside Docker
npm run dev              # tsx watch, expects Postgres on localhost:5432
npm run build            # prisma generate + tsc -> dist/
npm start                # node dist/index.js
npm run migrate:dev      # create a new migration after editing schema.prisma
npm run migrate:deploy   # apply pending migrations (what the container runs)
npm run seed             # prisma db seed -> prisma/seed.ts
```

Editing the schema:

```bash
docker compose up -d db                       # Postgres must be running
cd backend && npm run migrate:dev -- --name your_change
docker compose up --build -d backend          # rebuild so the image picks it up
```

Host-run Prisma commands use the `DATABASE_URL` in the repo-root `.env`
(`@localhost:5432`); the container builds its own from `POSTGRES_*` using the
compose hostname `db`.

## Frontend

React 19 + Vite 8. **Tailwind v4** via `@tailwindcss/vite` — v4 is CSS-first, so
there is no `tailwind.config.js`; configuration lives in `src/index.css` next to
the `@import "tailwindcss"`. `vite-plugin-pwa` generates the manifest and a Workbox
service worker; `public/pwa-*.png` are flat-colour placeholders to replace with
real icons.

```bash
cd frontend
npm run dev              # http://localhost:5173, HMR
npm run build            # tsc -b + vite build -> dist/ (static SPA)
npm run preview          # serve the production build
npm run lint             # oxlint
```

The API base URL defaults to `http://localhost:3000`; override with `VITE_API_URL`
in `frontend/.env.local` (see `frontend/.env.example`).

`src/App.tsx` is a thin end-to-end smoke screen, not real UI: it restores or
starts a session and shows **one month at a time** — a month stepper, that
month's total, and its transactions, which can be sorted by date or amount. The
form posts to `POST /api/transactions` and requires a category, picked from a
dropdown that can also create one inline. Tapping a row expands it in place to
edit its fields or delete it. Above the form, a per-category breakdown shows
spending against that month's budgets, and the sliders icon beside it sets
them. Note the seeded
demo user cannot be signed in as — its `googleId` is a placeholder string, not a
real Google `sub`.

## Database

`postgres:16-alpine`, exposed on `localhost:5432`. Data lives in the named volume
`postgres_data` and survives `docker compose down` — use `docker compose down -v`
to wipe it.

```bash
docker compose exec db psql -U piggy -d piggy
```

## Notes

- `.env` is gitignored; `.env.example` is the committed template.
- CORS is enabled on the backend for `CORS_ORIGIN` (default `http://localhost:5173`),
  since the frontend runs on a different origin. It runs with `credentials: true`
  so the refresh cookie crosses that boundary — which is why `CORS_ORIGIN` must
  name the origin exactly and can never be `*`.
