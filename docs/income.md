# Income — design record

**Status: built.** The `Income` model, `GET`/`POST`/`PATCH`/`DELETE
/api/incomes`, and the income section of the dashboard header all exist —
see the `add_income_table` migration, `backend/src/routes/incomes.ts`, and
`IncomeRow`/`AddIncomeSheet` in `frontend/src/components/`.

This file stays as the **design record**: the reasoning below is what the
code is protecting, and it is not re-derivable from reading the code. The
decisions were not re-litigated during the build, and the model shipped as
specified. What changed in the building is listed at the bottom.

## The three decisions

1. **Income is the counterpart to spending.** A user logs what came in, so a
   month can be judged against income, not just against a budget limit —
   the "overall monthly cap" gap `docs/budgets.md` leaves open on purpose.
2. **Income is one-time or recurring**, chosen at creation. Two shapes on one
   model, not two models — a household's income is usually one or two
   recurring sources plus the occasional one-off, and they need to be
   compared against the same month total.
3. **Income does not merge under a Share, unlike Category/Budget.** Both
   partners' income stays separate and attributed — visible together (a
   household total needs both), never combined into one canonical row. This
   is the opposite call from `effectiveBudgetOwnerId`, and it is deliberate:
   there is no single "whose income is canonical" the way there is a single
   canonical category list.

## The model

```prisma
enum IncomeType {
  ONE_TIME
  RECURRING
}

model Income {
  id        Int        @id @default(autoincrement())
  userId    Int
  source    String
  amount    Decimal    @db.Decimal(10, 2)
  type      IncomeType
  month     String     @db.VarChar(7)   // "YYYY-MM"
  endMonth  String?    @db.VarChar(7)   // RECURRING only
  createdAt DateTime   @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId, month])
}
```

## What is load-bearing

- **No `@@unique`, unlike Budget's `(userId, categoryId, month)`.** More than
  one income source can be in effect for the same user in the same month —
  a salary and a side gig are both real at once — so this is never resolved
  to "one row per key" the way `Budget.upsert` is. `GET` sums across every
  matching row rather than picking a winner.

- **`month`/`endMonth` are `VARCHAR(7)`, not a DATE** — same reasoning as
  `Budget.month`: lexicographic `<=`/`>=` comparison, no timezone to get
  wrong, consistent with how every other month-scoped field in this API
  works.

- **A `RECURRING` amount edit is forward-only**, the same shape as Budget's
  inheritance but a different mechanism: Budget picks "the latest row at or
  before," Income closes a range. Editing the amount sets `endMonth` on the
  current row to the month before the change and inserts a new row starting
  at the effective month. A past month keeps scoring against the amount that
  was actually true then — a raise in September must not retroactively
  change what August's income-vs-spending comparison showed. `endMonth`
  is otherwise always NULL, meaning "still ongoing."

- **Sharing widens visibility only, never ownership.** `GET /api/incomes`
  scopes by `visibleUserIds` (both members under a share), the same helper
  `Transaction`'s `GET` uses. But `PATCH`/`DELETE` check
  `userId === authedUserId(req)` directly — **not** `visibleUserIds`, which
  is what `Transaction`'s write routes use to let a partner edit each
  other's rows. Income deliberately does not extend that trust: a partner
  can see the row (for the household total) but never edit or delete it.
  This is a third sharing behavior, distinct from both existing ones in
  `sharing.ts`:
  - `effectiveBudgetOwnerId` — fully merged (Category/Budget)
  - `visibleUserIds` on both read and write — visible **and** jointly
    editable (Transaction)
  - Income — `visibleUserIds` on read only, `authedUserId` on write: visible
    but not editable by a partner.

- **`ownerName` is always present**, same convention as
  `serializeTransaction` — the caller's own name unshared, whichever member
  actually entered the row when shared. No separate shared/unshared code
  path on the client.

## Routes

`GET /api/incomes?month=YYYY-MM` — income *effective* in that month: every
`ONE_TIME` row set for exactly that month, plus every `RECURRING` row whose
`month <= requested <= (endMonth ?? infinity)`, for every user in
`visibleUserIds(authedUserId(req))`.

`POST /api/incomes` `{ source, amount, type, month }` — `userId` is always
the caller. `endMonth` cannot be set on create; it only exists as the result
of a later forward-edit.

`PATCH /api/incomes/:id` — two shapes on one route:
- `{ source? }` and/or `{ amount }` on a `ONE_TIME` row: a plain in-place
  update, since neither has a "past month" to protect.
- `{ amount, effectiveMonth }` on a `RECURRING` row: closes the existing row
  at `effectiveMonth`'s previous month and creates a new one from
  `effectiveMonth`, atomically (`prisma.$transaction`). Rejects
  `effectiveMonth <= existing.month`.

`DELETE /api/incomes/:id` — hard delete, scoped to `authedUserId(req)` only.

All ownership checks use `updateMany`/`deleteMany` with the id **and**
`userId` in the `WHERE`, the same rule every other write route in this
codebase follows — never a bare `findUnique` + `update`.

## What changed in the building

- The two-shape `PATCH` (plain field update vs. forward-dated amount change)
  was the one design point that needed a concrete branch: everything else in
  the plan shipped as specified. The branch is on which fields are present
  in the body (`effectiveMonth` present → forward-dated path), not on a
  separate route, so the client has one call site for both.

## Checks that were run when it landed

- `curl`: created a `ONE_TIME` and a `RECURRING` row, confirmed the
  recurring one appears in every month from its start month onward and the
  one-time one only in its own month.
- Edited the recurring row's amount with `effectiveMonth` set to the current
  month — confirmed the month *before* still returned the old amount
  (`endMonth` closed correctly) and the month *at and after* returned the
  new one. This is the property the forward-only edit exists for.
- Created a second user, shared with the first, had the second log income —
  confirmed the first user's `GET` returned both rows with correct
  `ownerName`s, and that the first user's `PATCH`/`DELETE` against the
  second user's row **404s**, not 403 — matching this repo's existing
  ownership-check convention (`transactions.ts`, `budgets.ts`).
- Deleted the share — confirmed the cascade removed the second user cleanly
  with no orphaned rows, and re-ran `docker compose down -v && up --build`
  to confirm the migration replays cleanly from empty.
