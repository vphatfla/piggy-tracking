# Household sharing: the invite flow

Why the invite code is shaped the way it is. The *mechanics* of sharing — what
pools, what merges, what stays private — are in `backend/CLAUDE.md` and the
`Share` doc-comment. This file is about the part that is a security argument
rather than a product decision, because that part is easy to undo by accident.

## The problem it solves

`POST /api/shares` used to take `{ partnerEmail }` and create a **live share
immediately**. Two things wrong with that:

1. **Nobody was asked.** One user could pool another user's entire financial
   history by typing their email address. The other person found out by
   noticing their dashboard had changed.
2. **It was an email-enumeration oracle.** It returned 404 on an unknown
   address, so anyone with an account could test whether a given email was
   registered.

The frontend's "Invite someone — coming soon" button was a deliberate no-op
precisely because wiring it up would have shipped exactly that.

Now: one user mints a code, passes it over out-of-band, the other redeems it.
**Redeeming is the consent**, and it is the only way a `Share` row is ever
created.

## Why `Invite` is a separate model and not a `status` on `Share`

`visibleUserIds` and `effectiveBudgetOwnerId` in `src/sharing.ts` are the two
functions that decide what every request can see. A `status` column on `Share`
would mean both of them — and the five-odd places that check
`revokedAt: null` — need to remember a third state. Miss one and the app pools
real financial data on an invite nobody accepted. That is the worst available
failure, so the design makes it unrepresentable instead: a `Share` row exists
only after consent, and both resolvers were left **completely unchanged** by
this feature.

## Why 8 digits, and why the rate limiter is not optional

An 8-digit code is 10⁸ = 100,000,000 possibilities (~26.6 bits). That is small
enough that the arithmetic matters.

Probability of a successful blind guess over a period `T` is roughly:

```
(attempts per hour) x (how many codes are live) x T / 10^8
```

Two things fall out of that, and they are the two levers:

- **The limiter bounds the first factor.** `POST /api/shares` is capped at 5
  attempts per user per hour and **30 globally** per hour. The global cap is
  the one doing the security work: a per-user cap is defeated by registering
  more Google accounts, which costs an attacker nothing.
- **Short lifetimes bound the second.** A code lives one hour at most, and is
  **deleted the moment it is redeemed** rather than lingering until expiry. In
  practice a code is live for the few minutes between sending it and the
  recipient typing it.

At the global cap with three codes permanently live, that is ~0.8% per *year*
of continuous attack — and realistic usage is far below that, because `k` is
near zero almost always. Safe.

Three things that would break this, in descending order of likelihood:

1. **Removing or loosening the global cap.** Without it, 8 digits is not safe.
   See `src/middleware/rateLimit.ts`.
2. **Raising `INVITE_EXPIRY_MINUTES` a long way.** It is a security parameter,
   not a convenience knob. An invite valid for a week is ~170× the exposure of
   one valid for an hour.
3. **Shortening the code.** 6 digits is 100× worse — at the same caps it is
   ~54% per year of sustained attack, which is only survivable because real
   usage keeps `k` near zero. That makes the safety rest on a usage
   assumption rather than on the design. 8 digits does not need the assumption.

### Why not TOTP

Considered and rejected. A TOTP code's output space is the same 10⁶–10⁸
however it is derived — deriving it from a secret and a timestamp buys
statelessness and rotation, not guess-resistance. Worse, rotation actively
breaks the use case: a code you text someone has to stay valid while they read
it and type it, and widening the acceptance window to cover that makes *many*
codes valid at once, which is strictly worse than one static code. TOTP also
presumes both parties already share a secret, and here the recipient is
precisely the person who does not have one yet.

MFA gets away with 6 digits because it is a *second* factor behind a password
**and** is aggressively rate-limited — not because of how the digits are
computed.

## How "one active share per user" is actually enforced

This is the subtlest part of the feature, and the first design of it was
wrong, so the reasoning is worth keeping.

The rule spans two columns — a user may be in `initiatorId` *or* `partnerId` —
so no unique index over `Share` expresses it, which makes the obvious
implementation a read: *"is there an active share naming either of us?"*

**That read does not work.** It matches rows that do not exist yet, and a read
matching nothing takes no lock, under READ COMMITTED — which is what Prisma
opens an interactive transaction with. Two concurrent redemptions both see "no
conflict" and both insert.

### The two races

**Mutual redemption.** Ada and Bea each generate a code and send it to the
other, neither realising. Both tap Join at once. Both reads return zero rows;
both insert. Two active shares for the same pair, with *opposite*
`budgetOwnerUserId`. `activeShare()` is a `findFirst` with no `ORDER BY`, so
`effectiveBudgetOwnerId(Ada)` then returns Bea on one request and Ada on the
next, and Ada's categories flip between households on every refresh. No error,
nothing logged.

**Two codes, one redeemer.** Bea and Cal both send codes to Ada; Ada redeems
both at once (two tabs, or a retry on a slow network). Ada ends up in two
shares with two different people, while Bea and Cal cannot see each other.

### The fix: claim the User rows

`User.activeShareId` moves the invariant onto rows that **always exist**.
Redemption creates the Share, then:

```ts
const claimed = await tx.user.updateMany({
  where: { id: { in: [invite.creatorId, userId] }, activeShareId: null },
  data: { activeShareId: created.id },
})
if (claimed.count !== 2) throw alreadyShared()
```

A second concurrent redemption blocks on the row lock, re-evaluates
`activeShareId: null` against the newly committed row, stops matching, comes
back with `count < 2`, and rolls the whole transaction back. This is the same
`updateMany`-with-count idiom `backend/CLAUDE.md` already mandates for scoped
writes, and the same one that makes the invite claim and the refresh-token
claim safe.

Verified under real concurrency, not just by reasoning: firing both mutual
redemptions simultaneously yields one 201 and one 409, with exactly one active
share and both users pointing at it.

Three properties to preserve:

- **`activeShareId` is a write guard only.** `activeShare()` still reads
  `Share`, which remains the single source of truth for what a user's share
  *is*. That asymmetry is deliberate: if the two ever desync, the worst
  outcome is wrongly *refusing* a new share — it fails closed, and can never
  wrongly pool somebody's data.
- **Revoking clears it in the same transaction** as stamping `revokedAt`. A
  stale `activeShareId` locks both members out of sharing again.
- **Redemption stays the only path that creates a Share.** That is a further
  reason the `{ partnerEmail }` endpoint had to go: a second creation path
  that skipped the claim would reopen the hole.

### The pair index, and what it does not do

There is also a partial unique index on the unordered pair:

```sql
CREATE UNIQUE INDEX "Share_active_pair_key"
    ON "Share" (LEAST("initiatorId", "partnerId"), GREATEST("initiatorId", "partnerId"))
 WHERE "revokedAt" IS NULL;
```

`LEAST`/`GREATEST` normalise the pair, so `(Ada,Bea)` and `(Bea,Ada)` collide
as they should. It is a **backstop covering the mutual-redemption race only** —
it does nothing for the second race above, because `(Ada,Bea)` and
`(Ada,Cal)` are different keys. The claim column is the mechanism; this is
belt and braces.

Two things about it:

- **It cannot be declared in `schema.prisma`** — Prisma has no syntax for a
  partial or expression index — so it exists only in the migration SQL, and
  `prisma migrate dev` sees it as drift and offers to drop it. Use
  `--create-only` and keep it. This is the easiest way to lose it silently.
- `POST /api/shares` catches `P2002` and rethrows the 409, so the index firing
  never surfaces as `conflictingField()`'s *"a record with that active_pair
  already exists"*.

The index is partial rather than a true composite primary key for a reason: a
primary key cannot be partial, so it would be permanently occupied by revoked
rows and a pair could never share again after ending a share. It would also
have meant dropping `Share.id`, which `PATCH`/`DELETE /api/shares/:id` depend
on.

### What was rejected

- **`pg_advisory_xact_lock` on both user ids** — the original implementation,
  and correct. Replaced because it was the only raw SQL in the codebase to do
  something the schema can now express natively. If you ever reach for it
  again, note the trap: lock each **user id** separately, never the pair, or
  `(A,B)` and `(A,C)` take different locks and exclude nothing.
- **`isolationLevel: 'Serializable'`** plus a retry loop. Postgres would catch
  the write skew, but a `40001` abort needs a branch in `app.ts`'s error
  middleware that does not exist, so it would surface as a 500.

## Smaller decisions worth not re-litigating

- **The code is stored in plaintext**, unlike `RefreshToken`'s SHA-256 hash,
  because the sender has to reopen the Share screen and reread it; a hash can
  only ever be shown once. The cost is that a database leak exposes live
  codes — bounded by the one-hour expiry, and each code buys one household.
  **Never log one.**
- **Dead invites are hard-deleted, not soft-revoked** — the opposite of `Share`
  and `RefreshToken`, whose `revokedAt` exists to preserve history. There is no
  history worth keeping: the `Share` row a redemption produces already carries
  both user ids and a `createdAt`. Expired rows are collected lazily on the
  next create, which is the entire garbage collector.
- **`creatorId` is unique**, so "one live code per user" *is* a database
  constraint — note the contrast with the one-active-share rule above, which
  cannot be.
- **`POST /api/invites` is idempotent while a code is live.** Asking again
  returns the same code. There is deliberately no refresh: a code already
  passed to someone must not stop working because its sender reopened the
  screen. Removing it is the deliberate act.
- **Error messages are opaque on purpose.** Unknown, expired and
  already-redeemed all return the same 404, so the endpoint cannot be used to
  probe which codes exist. The two specific messages — "that is your own code"
  and "one of you is already sharing" — are about the *caller's* own state and
  leak nothing about anyone else's code. The caller-already-sharing check
  deliberately runs *before* the code lookup for that reason.
- **The invite is refetched when the Share sheet opens**, not once per session
  like every other resource in `useDashboard`. It is the only thing in the app
  that dies on a clock, and `Sheet` stays mounted while closed — so a
  fetch-once would have the user reopen the screen an hour later and read a
  code that no longer works.
- **The expiry is rendered as an absolute wall-clock time**, never a countdown.
  A countdown needs a timer inside a sheet that stays mounted, and would still
  be read stale.
