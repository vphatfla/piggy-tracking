# Recurring transactions — design record

**Status: built.** The `RecurringTransaction` model, `GET`/`POST`/`PATCH`/
`DELETE /api/recurring-transactions`, the generation sweep in
`backend/src/recurring.ts`, and the frontend's add-form toggle and
edit-scope prompt all exist — see the `add_recurring_transactions`
migration, `backend/src/routes/recurringTransactions.ts`, and
`AddTransactionSheet`/`EditPanel` in `frontend/src/components/`.

This file stays as the **design record**: the reasoning below is what the
code is protecting, and it is not re-derivable from reading the code.

## The one decision that shapes everything else

Income already has a recurring shape, and it was tempting to copy it
wholesale. It doesn't fit: `GET /api/incomes` sums matching rows **live**,
with no per-month row ever created, because an income row is never
individually edited, deleted, or receipt-attached. A recurring
*transaction* has to stay all of those things per occurrence — budgets'
spent calculation, receipts, sharing, and Money Flow all read concrete
`Transaction` rows scanned by date, and none of them know how to read a
template.

So the model splits in two:

- `RecurringTransaction` — the **template/series**. Merchant, amount,
  category, day-of-month, and Income's exact closed-range,
  forward-only-edit shape (`startMonth`/`endMonth`) for the series itself.
- Each month's occurrence is a **real `Transaction` row**, tagged
  `recurringTransactionId`, generated lazily — never ahead of the real
  calendar month, so a lease's March rent does not exist as a transaction
  in January.

That materialization is also what makes "just this one month" need **no
new code**: an edit to a generated `Transaction` row is the exact same
`PATCH /api/transactions/:id` every other edit already uses, and the
generation sweep never overwrites a row that already exists.

## The model

```prisma
model RecurringTransaction {
  id                    Int      @id @default(autoincrement())
  userId                Int
  merchantName          String
  amount                Decimal  @db.Decimal(10, 2)
  categoryId            Int?
  day                   Int      @db.SmallInt
  startMonth            String   @db.VarChar(7)
  endMonth              String?  @db.VarChar(7)
  generatedThroughMonth String   @db.VarChar(7)
  createdAt             DateTime @default(now())
}
```

Plus `Transaction.recurringTransactionId Int?`, `onDelete: SetNull`, and
`@@unique([recurringTransactionId, date])`.

## What is load-bearing

- **No cron.** This repo deliberately has no background-job infrastructure
  (see root `CLAUDE.md` § Production). Generation instead happens inside
  `GET /api/transactions`, for every id in the caller's `visibleUserIds` —
  not just themself, so a share partner's rent shows up the moment *either*
  member opens the app, without making a partner's series writable by the
  caller.

- **`generatedThroughMonth` only ever advances**, and is the reason the
  sweep is cheap on every call instead of rescanning a series' whole
  history: `ensureGenerated` only loops the gap between it and
  `min(endMonth ?? now, now)`, which is almost always zero or one month.

- **`day` clamps to a shorter month's last day.** A `day: 31` series posts
  on the 28th/29th in February — the same clamp any billing system uses.
  Tested by hand: a January-start, day-31 series generated through November
  landed exactly on `02-28`, `04-30`, `06-30`, `09-30`, `11-30`, and the
  31st everywhere else.

- **`endMonth` MAY be set at `POST` time**, unlike Income's, which forbids
  it on create. A lease or a financed purchase usually has a known end date
  up front; an income source usually doesn't. This is the one place the two
  models' otherwise-identical shape deliberately diverges.

- **A forward edit (`PATCH` with `effectiveMonth`) reassigns, not just
  creates.** The old row is closed at the month before `effectiveMonth`;
  a new row opens from `effectiveMonth`. The subtlety: if the old row had
  *already generated* one or more months at or after `effectiveMonth`
  (normal — the user is often editing a transaction from a month that
  isn't the newest one), those `Transaction` rows are **reassigned** to the
  new series and rewritten with the new values, not left behind under the
  old one and not regenerated. `generatedThroughMonth` on both rows is
  adjusted to match: the old row's drops to the closing month if it had
  generated further than that, and the new row's inherits however far the
  old one had already gone. Verified by hand: raising a rent amount
  effective two months before "now" moved both of those already-generated
  months to the new amount, and the month before that kept the old one.

- **Ending a series (`PATCH` with `endMonth` alone) deletes nothing.**
  Future months were never pre-materialized, so there's nothing to clean
  up — the sweep just stops advancing past `endMonth`. Deleting the whole
  series (`DELETE`) also deletes nothing beyond the template: generated
  `Transaction` rows survive with `recurringTransactionId` set to `NULL`,
  the same rule category deletion already follows.

- **A plain `{ merchantName }` correction does not retroactively touch
  already-generated rows.** Each occurrence holds its own copy of every
  field, copied at generation time — a template rename only changes what
  *future*, not-yet-generated months will say. Fixing an occurrence that's
  already on the books is what editing it directly is for.

## Routes

`GET /api/recurring-transactions` — the caller's own series, independent
of month in view. Backs the frontend's edit-scope prompt, which needs a
series' current state without guessing from one occurrence.

`POST /api/recurring-transactions` `{ merchantName, amount, categoryId,
date, endMonth? }` — creates the series and its first occurrence as a real
`Transaction` row, atomically, so the current month's spending doesn't wait
on the next `GET`'s sweep. Returns `{ series, transaction }` — the frontend
needs the occurrence's own id (to scroll to / highlight it), not the
series'.

`PATCH /api/recurring-transactions/:id` — three shapes, mirroring
`incomes.ts`: `{ merchantName }` in place; `{ merchantName?, amount?,
categoryId?, effectiveMonth }` the forward-reassigning edit above; `{
endMonth }` alone to stop recurring with no replacement.

`DELETE /api/recurring-transactions/:id` — the series only, as above.

## The frontend's edit-scope choice

`AddTransactionSheet` gains a One-time/Recurring toggle — defaulting to
**One-time**, the opposite emphasis from `AddIncomeSheet` (most logged
transactions are one-off; recurring is the opt-in case for a transaction,
where for a household's income it usually isn't).

`EditPanel`, when the transaction being edited has a `recurringTransactionId`,
intercepts Save: a merchant/amount/category change (not a date-only one —
editing one occurrence's date is inherently "just this one") shows an
inline two-button choice, "Just this month" vs. "This and future months",
rather than writing immediately. "Just this month" is the pre-existing,
unchanged single-row `PATCH` — this is the half that needed no new frontend
code either. A separate "Stop recurring" action, deliberately not folded
into Delete, calls the `{ endMonth }` shape.

## Checks run when it landed

- `curl`: created a `day: 31` series starting in January; the sweep
  generated through November with the February clamp landing on the 28th.
- `curl`: forward-edited the amount effective two months back from "now";
  confirmed both already-generated months moved to the new amount and the
  month before them kept the old one, and that the old row's
  `generatedThroughMonth` and the new row's both ended up consistent with
  the reassignment.
- `curl`: a bad `effectiveMonth` (at or before the series' own start)
  400s.
- `curl`: ending a series stops the sweep from generating past `endMonth`.
- `curl`: deleting a series 204s and its generated `Transaction` rows
  survive with `recurringTransactionId: null`.
- `cd backend && npx tsc --noEmit` and `cd frontend && npm run build` both
  clean; the recharts chunk from the Money Flow view still code-splits
  separately, confirming this feature didn't regress that boundary.
