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

Five models. See `prisma/schema.prisma` for the authoritative definition.

- **User** — Google OAuth is the only auth method, so there is **no password
  column**; `googleId` holds the Google `sub` claim. `email` and `googleId` are
  both unique.
- **Receipt** — belongs to a User. `date` is a calendar `DATE`, `totalAmount` is
  `DECIMAL(10,2)`.
- **Transaction** — belongs to a User, and *optionally* to a Receipt. `date` is
  a calendar `DATE`: **when the money was spent**, which is not `createdAt` (when
  the row was entered). A budget period is a calendar month, so those diverging
  puts spending in the wrong month. `DATE` and not a timestamp because a calendar
  date has no timezone — "which month is this in" then has exactly one answer.
  Required on POST unless a `receiptId` supplies it; the server never falls back
  to its own "today", which would be a timezone guess about the user.
  The `add_transaction_date` migration is hand-written for this reason: Prisma's
  generated `ADD COLUMN ... NOT NULL` cannot run against a populated table, so it
  adds nullable, backfills from `receipt.date` where there is one and
  `createdAt::date` otherwise, then sets `NOT NULL`.
- **Category** — a user-owned spending label, `@@unique([userId, name])`. Scoped
  per user, so two people naming the same thing differently never have to be
  reconciled; nothing in this app reads across users, and a global taxonomy
  would be machinery serving no feature.

  **`Transaction.categoryId` is nullable in the database but required by the
  API.** Those are not in conflict: "every transaction is categorised" is a
  creation-time rule, while NULL is reserved for a row whose category was later
  deleted. Do not "fix" the column to `NOT NULL` — it would make deleting a
  category impossible without deleting the spending.

  **Category deliberately has no `budget` column.** A single limit per category
  is retroactive: raising the groceries cap in June would silently re-score
  January as under budget. Limits are per-month rows in `Budget` — below, and in
  `docs/budgets.md`.

  `add_category_table` is hand-ordered for the same class of reason as
  `add_transaction_date`: Prisma's diff dropped `Transaction.category` in the
  same statement that added `categoryId`, which would have discarded every
  existing value. The written migration adds, backfills (promoting distinct
  strings to rows, then giving every existing user the starter set), and only
  then drops. The literal `'Uncategorised'` is *excluded* from the promotion —
  it is the absence of a category, and a row for it would collect a budget
  line in M5.

- **Budget** — one spending limit for one `(categoryId, month)`. Rows are
  sparse and **inherit forward**: the limit in force for month M is the row with
  the greatest `month <= M`. That is the entire reason this is a table rather
  than a column on Category — a past month keeps the number it was actually
  judged against instead of being re-scored when the user changes their mind.
  Editing an inherited limit **inserts a row for the viewed month**; it never
  rewrites the older one.

  Two things here must not be "simplified":

  - **`categoryId` is `NOT NULL`.** A nullable one meaning "the overall budget"
    looks like a free extension and is not: Postgres treats NULLs as distinct in
    a unique index, so `@@unique([userId, categoryId, month])` would accept two
    overall budgets for the same month and enforce nothing. An overall cap needs
    a separate model or a partial index.
  - **`month` is `VARCHAR(7)`** (`"2026-09"`), not a `DATE`. It sorts
    lexicographically and compares with `<=` exactly as the inheritance lookup
    needs, and carries no timezone to convert wrongly.

  Inheritance is resolved **in JS, not in one clever query**: greatest-per-group
  is a Postgres `DISTINCT ON`, which Prisma's `distinct` is not, and the row
  count is one per category per time the user changed their mind. Revisit only
  if that stops being tiny. The full design record, including what was
  considered and rejected, is `docs/budgets.md`.

Referential behaviour is intentional and load-bearing:

| Delete | Effect |
|---|---|
| a User | **cascades** — their receipts and transactions are removed |
| a Receipt | its transactions **survive** with `receiptId` set to `NULL` |
| a Category | its transactions **survive** with `categoryId` set to `NULL`, but its budgets **cascade** |

The rationale: a transaction is a record of money spent and stays true even if
the receipt image, or the label someone filed it under, is deleted. Do not
"simplify" either to a cascade. The asymmetry on the last row is deliberate —
money spent stays true without its label, but a limit for a category that no
longer exists is meaningless.

Indexed on `Receipt.userId`, `Transaction.userId`, `Transaction.receiptId`,
`Transaction.categoryId`, `Category.userId`, and `Transaction.(userId, date)` —
the composite is what month and range queries hit. `Budget` has
`@@index([userId, month])` for the same reason, plus the unique triple.

A sixth model, **RefreshToken**, backs the session layer — see Auth below.
Deleting a User cascades to it as well, so removing an account also removes
every live session.

## Auth

`POST /api/auth/google` verifies a Google ID token, finds-or-creates the User on
`googleId`, and starts a session. `/refresh`, `/logout`, `/logout-all` manage it.

`GOOGLE_CLIENT_ID` is **format-validated at boot** (`src/env.ts`): the container
refuses to start unless it ends in `.apps.googleusercontent.com` and is not the
`.env.example` placeholder. Without that check a misconfigured client ID is
indistinguishable from a bad token — both come back as the same opaque 401 from
`verifyGoogleIdToken` — so the failure is moved to startup where the log says why.

**The access token is the only source of identity.** `requireAuth`
(`src/middleware/auth.ts`) verifies the `Authorization: Bearer` JWT and hangs
`{ userId }` off the request; `authedUserId(req)` reads it and throws if the
middleware was not mounted, so a route that forgets it fails loudly instead of
quietly serving unscoped rows. Every route under `/api/users`, `/api/receipts`,
and `/api/transactions` mounts it router-wide. **A new user-data route must do
the same and filter by `authedUserId(req)`** — `?userId=` and body `userId` were
removed deliberately; do not bring them back as a convenience.

`GET /api/transactions` takes optional `?from=` and `?to=`, **inclusive at both
ends**, and applies neither when both are absent so a bare GET still means
"everything". There is deliberately no `?month=` endpoint: the month view is a
preset over this one filter and a multi-month range is the same call with wider
bounds, whereas two endpoints computing the same window would drift.
`optionalDate` is reused against `req.query` — it only indexes a field off an
object, so query params validate through the same path as bodies, and a repeated
`?from=a&from=b` arrives as an array and fails its `typeof` check.

Ownership the FK cannot enforce needs an explicit check. `POST /api/transactions`
verifies that both the supplied `receiptId` **and** `categoryId` belong to the
caller, because a foreign key only proves the row exists, not whose it is.
Every future route taking a caller-supplied id of a user-owned row needs the
same two lines — the happy path works fine without them, which is exactly why
they get forgotten.

**Scope a write by putting `userId` in the WHERE clause, not in a check before
it.** `PATCH` and `DELETE /api/transactions/:id` use `updateMany` / `deleteMany`
with `where: { id, userId }` and treat `count === 0` as a 404. The obvious
`prisma.transaction.delete({ where: { id } })` would delete **any** user's row
by id — the id alone is the primary key, and nothing else constrains it. A
find-then-write pair would be correct but leaves a window between the two
statements; this leaves none.

**A PATCH body distinguishes an absent field from an explicit null.** The
`optional*` helpers cannot: `optionalInt(body, 'receiptId')` returns `null` both
when the field is missing and when it is `null`. On POST those mean the same
thing, so the helpers are fine there. On PATCH they mean "leave it alone" and
"detach the receipt", so every field is guarded by `'field' in body` and then
parsed with the **required*** validator — an edited amount gets exactly the
validation a created one does. An empty patch is a 400 rather than a no-op.

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
- `src/routes/{auth,users,receipts,transactions,categories,budgets}.ts` — one
  router per concern.
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
- `Receipt.date` and `Transaction.date` (both `DATE`) → `"YYYY-MM-DD"`, not a
  timestamp.
- An included relation is **flattened**, not nested: `serializeTransaction`
  turns `category: { name }` into `category: string | null` alongside the raw
  `categoryId`. Every other field on this contract is flat, and a client that
  wants to group by category has the id without parsing an object. `null` means
  the category was deleted — never "the user didn't pick one".

`serializeReceipt` / `serializeTransaction` in `src/http.ts` do this. A new
model with a `Decimal` or `DATE` column needs its own serializer.

`Budget` is the exception that proves the rule: it has no serializer because a
`GET /api/budgets` row is never a Prisma row. It is an *effective* limit —
`{ categoryId, amount, month, inherited }` — where `month` is the month the
limit was **set for**, which is not the month asked about when `inherited` is
true. Returning a bare amount would lose the difference between "set for
September" and "carried over from March", and the UI needs it: editing an
inherited limit writes a new row rather than editing history.

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
