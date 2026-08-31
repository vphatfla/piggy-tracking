# Backend + database guide

Express 5 + TypeScript (ESM) + Prisma 7 against PostgreSQL 16. The database is
owned by this directory: `prisma/schema.prisma` is the single source of truth,
and `docker-compose.yml` at the repo root runs the Postgres container.

## Commands

```bash
npm run dev              # tsx watch; needs Postgres up (docker compose up -d db)
npm run build            # prisma generate && tsc  → dist/
npm start                # node dist/index.js
npm run migrate:dev      # create + apply a migration after editing the schema
npm run migrate:deploy   # apply pending migrations (what the container runs)
npm run seed             # prisma db seed → prisma/seed.ts
npx tsc --noEmit         # typecheck; run this before claiming anything works
```

Run them **inside the container** for anything that touches the containerised DB
in its normal state: `docker compose exec backend npm run seed`.

## Prisma 7 — read this before touching anything Prisma

Prisma 7 is materially different from 5/6. Most StackOverflow/blog answers you
recall are for the old layout and will be wrong here.

- **Versions are pinned deliberately: `prisma` and `@prisma/client` at 7.10.0.**
  `npm i prisma@latest` currently resolves to `8.0.0-rc.x` (an RC) while
  `@prisma/client@latest` is 7.10.0 — installing "latest" silently splits the
  majors and breaks generation. Upgrade both together or not at all.
- **No bundled query engine.** The client talks to Postgres through the
  `@prisma/adapter-pg` driver adapter, wired in `src/prisma.ts`. A `PrismaClient`
  constructed without `{ adapter }` will not work.
- **The generated client is TypeScript, not JS**, emitted to
  `src/generated/prisma/` (gitignored; recreated by `npm run build` and by the
  Docker build). Import from `./generated/prisma/client.ts`.
- Its internal imports carry explicit `.ts` extensions, which is why
  `tsconfig.json` sets `allowImportingTsExtensions` + `rewriteRelativeImportExtensions`.
  **Our own relative imports use `.ts` extensions too** (`import { env } from './env.ts'`)
  — tsc rewrites them to `.js` on emit. Match that; a bare specifier will fail.
- Config lives in **`prisma7.config.ts`**, not in a `prisma` key in `package.json`.
  The seed command is registered there (`migrations.seed`).
- Prisma does **not** auto-load `.env`. `prisma7.config.ts` and `src/env.ts` both
  call `dotenv` with `path: ['.env', '../.env']` so host runs pick up the
  repo-root `.env` while the container's compose-injected vars win untouched.
- `prisma` and `tsx` are **runtime `dependencies`, not devDependencies** — on
  purpose. The container runs `prisma migrate deploy` on startup and
  `prisma db seed` on demand, so they must survive `npm ci --omit=dev`.

## Data model

Three models. See `prisma/schema.prisma` for the authoritative definition.

- **User** — Google OAuth is the only auth method, so there is **no password
  column**; `googleId` holds the Google `sub` claim. `email` and `googleId` are
  both unique.
- **Receipt** — belongs to a User. `date` is a calendar `DATE`, `totalAmount` is
  `DECIMAL(10,2)`.
- **Transaction** — belongs to a User, and *optionally* to a Receipt.

Referential behaviour is intentional and load-bearing:

| Delete | Effect |
|---|---|
| a User | **cascades** — their receipts and transactions are removed |
| a Receipt | its transactions **survive** with `receiptId` set to `NULL` |

The rationale: a transaction is a record of money spent and stays true even if
the receipt image is deleted. Do not "simplify" that to a cascade.

Indexed on `Receipt.userId`, `Transaction.userId`, `Transaction.receiptId`.

A fourth model, **RefreshToken**, backs the session layer — see Auth below.
Deleting a User cascades to it as well, so removing an account also removes
every live session.

## Auth

`POST /api/auth/google` verifies a Google ID token, finds-or-creates the User on
`googleId`, and starts a session. `/refresh`, `/logout`, `/logout-all` manage it.

**The access token is the only source of identity.** `requireAuth`
(`src/middleware/auth.ts`) verifies the `Authorization: Bearer` JWT and hangs
`{ userId }` off the request; `authedUserId(req)` reads it and throws if the
middleware was not mounted, so a route that forgets it fails loudly instead of
quietly serving unscoped rows. Every route under `/api/users`, `/api/receipts`,
and `/api/transactions` mounts it router-wide. **A new user-data route must do
the same and filter by `authedUserId(req)`** — `?userId=` and body `userId` were
removed deliberately; do not bring them back as a convenience.

Ownership the FK cannot enforce needs an explicit check. `POST /api/transactions`
verifies the supplied `receiptId` belongs to the caller, because the foreign key
only proves the receipt exists, not whose it is.

There is **no `POST /api/users`**. Users are created exclusively by the Google
flow, where `googleId` comes from a verified token. A create route taking a
caller-supplied `googleId` would let anyone squat an identity before its real
owner first signs in.

### Refresh tokens

`src/auth/tokens.ts` owns the whole lifecycle. What is load-bearing:

- The cookie value is a JWT signed with `JWT_REFRESH_SECRET` whose only payload
  is 32 random bytes. The signature lets a forged cookie be rejected before it
  reaches the database; the random id is what makes the stored hash unguessable.
  `JWT_ACCESS_SECRET` is separate on purpose — leaking the access secret must not
  also mint refresh tokens.
- **The database stores `sha256(token)`, never the token.** The raw value leaves
  the process only in a `Set-Cookie` header. Do not log it or return it in a body.
- Cookie flags: `httpOnly; Secure; SameSite=Strict; Path=/api/auth`. `Secure` is
  fine in dev — browsers treat `http://localhost` as a trustworthy origin. The
  `Path` keeps the cookie off ordinary API calls, and **set and clear must use
  the same path** or the clear silently does nothing.
- **Rotation.** `consumeRefreshToken` revokes and validates in one atomic
  `updateMany` on `(tokenHash, revokedAt: null, expiresAt > now)`. A read-then-write
  would let a replayed cookie and the real one both win a race; this way the
  loser gets a 401. Callers must issue a replacement immediately.
- Every rejection — missing, forged, expired, revoked, already rotated — returns
  the same `401 Invalid or expired refresh token`, so the endpoint cannot be used
  to probe token state. Keep it that way.

Because rotation invalidates on use, **two concurrent refreshes lose one
session**. The frontend guards its mount effect against React StrictMode's double
invocation for exactly this reason. Multiple real tabs refreshing simultaneously
would hit the same edge; a production system would add reuse detection (revoke
the whole family on replay) rather than loosening the rotation.

Access-token payload is `{ userId }` and must stay that way — a JWT is signed,
not encrypted, so anyone holding one can read it.

## Changing the schema

```bash
docker compose up -d db                              # Postgres must be running
npm run migrate:dev -- --name your_change            # creates + applies migration
docker compose up --build -d backend                 # rebuild so the image has it
```

Two things that will bite you:

- `prisma migrate dev` is **interactive** and aborts with "environment is
  non-interactive" whenever it wants to confirm data loss (e.g. dropping a
  non-empty table). Clear the offending rows first, or use
  `migrate dev --create-only` and then `migrate deploy`.
- Migrations are append-only history. Never edit an applied migration — add a
  new one. `prisma/migrations/20260831013831_init` still creates the old `Note`
  table and `..._replace_note_with_core_models` drops it; that is correct and
  replays fine from an empty database.

Check for drift with `npx prisma migrate status` — expect
"Database schema is up to date!".

## HTTP layer

- `src/app.ts` builds the app: CORS → json → cookies → routes → 404 → error
  middleware. CORS runs with `credentials: true`, which the browser only honours
  against an explicit origin allowlist — `CORS_ORIGIN` must name the frontend
  exactly, never `*`, or the refresh cookie is silently dropped.
- `src/routes/{auth,users,receipts,transactions}.ts` — one router per concern.
- `src/auth/` — `google.ts` (ID-token verification) and `tokens.ts` (access +
  refresh token lifecycle). `src/middleware/auth.ts` — `requireAuth`.
- `src/http.ts` — shared parsing/validation helpers and the response serializers.
  **Use these rather than hand-rolling validation in a route**, so error shapes
  stay consistent. Throw `HttpError(status, message)` for client errors; the
  error middleware turns it into `{ "error": message }`.
- Every handler is `async` and wraps its body in `try/catch (err) { next(err) }`.
  Express 5 does forward rejected promises, but the explicit form is what the
  existing routes do — match it.

### Serialization contract

Never return a raw Prisma row for a model with money or dates on it.

- `Decimal` → a fixed-2dp **string** (`"48.75"`). Floats lose cents.
- `Receipt.date` (a `DATE`) → `"YYYY-MM-DD"`, not a timestamp.

`serializeReceipt` / `serializeTransaction` in `src/http.ts` do this. A new
model with a `Decimal` or `DATE` column needs its own serializer.

### Database errors → HTTP statuses

The error middleware maps Prisma's known-request errors so integrity failures
are not blanket 500s: `P2002` → **409**, `P2003` → **400**, `P2025` → **404**.

Note `conflictingField()` in `src/app.ts`: with the pg driver adapter, `P2002`
reports the constraint index at
`meta.driverAdapterError.cause.constraint.index` (e.g. `"User_email_key"`),
**not** in Prisma's older `meta.target` array. Both shapes are handled. If you
add error mapping, verify the real payload rather than assuming the old shape.

## Docker

`Dockerfile` is 3-stage: `deps` (full `npm ci`) → `build` (`prisma generate` +
`tsc`) → `runtime` (`npm ci --omit=dev` + `dist/`). The runtime stage also copies
`src/` from the build stage, because `prisma db seed` runs `prisma/seed.ts`
through tsx and needs the TS sources including the generated client.

Startup command lives in `docker-compose.yml`:
`sh -c "npx prisma migrate deploy && node dist/index.js"`.

## Seeding

`prisma/seed.ts` is idempotent: it upserts the demo user on `googleId`, then
deletes and recreates that user's receipts and transactions. It seeds 1 user,
1 receipt, and 2 transactions — one attached to the receipt, one with
`receiptId: null`, so both relation paths are covered. Keep that property; the
frontend smoke screen relies on the seeded user being id `1` on a fresh database.
