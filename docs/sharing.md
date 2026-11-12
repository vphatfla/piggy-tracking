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

## Why redemption takes an advisory lock

The rule "a user may be in at most one active share" spans two columns
(`initiatorId`, `partnerId`), so no unique index can express it. It has to be
a read — and **a read over rows that do not exist proves nothing** under READ
COMMITTED, which is what Prisma opens an interactive transaction with. Two
concurrent redemptions naming the same person would both see no conflict and
both insert, leaving one user in two active shares, at which point
`activeShare()`'s `findFirst` returns an arbitrary one of them and the user's
categories flicker between two households.

So `POST /api/shares` takes `pg_advisory_xact_lock` on **each of the two user
ids**, ascending. Two details that are easy to get wrong:

- **One lock per user id, not one keyed on the pair.** A+B and A+C are
  different pairs and would not exclude each other, yet both insert a share
  naming A.
- **Ascending order**, so there is no cycle for a deadlock to exploit.

The alternative was `isolationLevel: 'Serializable'` plus a retry loop, which
needs a `40001` branch in `app.ts`'s error middleware that does not exist —
without it a serialization failure surfaces as a 500. The advisory lock is
less machinery and fails closed. It is the first raw SQL in this codebase,
which is a real cost and the reason it is written down here.

This hole exists in `Share` creation generally, which is a further reason the
email endpoint had to go: once redemption is the **only** path that creates a
`Share`, locking it closes the invariant completely.

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
