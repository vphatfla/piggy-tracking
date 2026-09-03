# Budgets — design record

**Status: built.** The `Budget` model, `GET`/`PUT`/`DELETE /api/budgets`, and
the budgets section of the dashboard all exist — see the `add_budget_table`
migration, `backend/src/routes/budgets.ts`, and `BudgetRow`/`BudgetEditor` in
`frontend/src/App.tsx`.

This file stays as the **design record**: the reasoning below is what the code
is protecting, and it is not re-derivable from reading the code. The decisions
were not re-litigated during the build, and the model shipped as specified.
What changed in the building is listed at the bottom.

## The three decisions

1. **Budgets are real.** The user sets a limit; the app shows spent-vs-limit
   with an over/under state. "Budget" is a feature, not just framing for a
   monthly view.
2. **Limits are per-category.** $400 groceries, $150 dining — *not* one overall
   monthly cap.
3. **Limits are per-month rows that inherit.** A month without its own row falls
   back to the most recent earlier row for that category, so a past month keeps
   the number it was actually judged against instead of being retroactively
   re-scored when the user changes their mind.

## The model

```prisma
model Budget {
  id         Int      @id @default(autoincrement())
  userId     Int
  categoryId Int
  month      String   @db.VarChar(7)      // "YYYY-MM"
  amount     Decimal  @db.Decimal(10, 2)
  createdAt  DateTime @default(now())

  user     User     @relation(fields: [userId],     references: [id], onDelete: Cascade)
  category Category @relation(fields: [categoryId], references: [id], onDelete: Cascade)

  @@unique([userId, categoryId, month])
  @@index([userId, month])
}
```

## What is load-bearing

- **`categoryId` is NOT NULL and must stay that way.** The tempting extension is
  a nullable `categoryId` meaning "the overall budget". It does not work:
  Postgres treats NULLs as distinct in a unique index, so
  `@@unique([userId, categoryId, month])` would accept two overall budgets for
  the same month without complaint. The constraint would look correct and
  enforce nothing. If an overall cap is ever wanted, add a separate model or a
  partial unique index — never a nullable FK.

- **`month` is `VARCHAR(7)`, not a DATE.** `"2026-09"` sorts lexicographically
  and compares with `<=` exactly as the inheritance lookup needs, carries no
  timezone, and matches how dates already cross this API. A DATE pinned to the
  first of the month would invite a timezone conversion where none is required.

- **Deleting a Category cascades its budgets, but only detaches its
  transactions** (`receiptId`-style `SetNull`). The asymmetry is deliberate and
  mirrors the existing Receipt → Transaction rule: money spent stays true
  without its category, but a limit for a category that no longer exists is
  meaningless.

- **Inheritance is resolved in the application, not in one clever query.** The
  effective limit for category C in month M is the row with the greatest
  `month <= M`. That is a Postgres `DISTINCT ON`, which Prisma's `distinct` is
  not. Either drop to `$queryRaw` or fetch the user's rows with `month <= M` and
  reduce in JS — take the JS reduce, since the row count is one per category per
  change. Revisit only if that stops being tiny.

- **The API must report which month a limit came from.** Returning a bare amount
  loses the difference between "set for September" and "carried over from
  March", and the UI needs it: editing an inherited limit inserts a new row for
  the current month, it does not edit history. Effective-budget shape:

  ```json
  { "categoryId": 3, "amount": "400.00", "month": "2026-03", "inherited": true }
  ```

  `amount` is a fixed-2dp string like every other money value in this API.

- **Transactions can have a NULL `categoryId`,** so a month's per-category
  totals do not necessarily sum to the month's total. Rows predating M3, and
  rows whose category was deleted, sit outside every budget line. Surface that
  remainder rather than letting the numbers quietly fail to add up.

- **There is no overall monthly total.** A direct consequence of decision 2: the
  month header shows spending with nothing to compare it against, and over/under
  is a per-category state only. This is a choice, not an oversight — worth
  re-reading once the month view exists and it can be judged in practice.

## Routes

`GET /api/budgets?month=YYYY-MM` — effective limits, one entry per category that
has one. A category whose first budget starts *after* the month queried is
**absent**, not zero: "no limit set yet" is not "a limit of 0".
`PUT /api/budgets` — upsert one `(categoryId, month)` row.
`DELETE /api/budgets/:categoryId?month=YYYY-MM` — removes the row set for that
exact month. Not "remove the budget": the category then falls back to whatever
earlier row it inherits from, which may well be another number.

All scoped by `authedUserId(req)`, and all with the **explicit ownership check
on `categoryId`** that `receiptId` gets in `src/routes/transactions.ts`: the
foreign key proves the category exists, not whose it is.

## What changed in the building

- **A `DELETE` route was added** — not in the original two-route sketch. Without
  it a limit set for a month could be changed but never taken back, and the
  editor's empty field would have no meaning.
- **`PUT` rejects a negative amount.** `requiredMoney` allows one, which is
  correct for a transaction (a refund) and meaningless for a limit.
- **Spent-vs-limit is computed in the client**, from the month's transactions
  already in memory, rather than waiting on the
  `GET /api/transactions/summary` endpoint on the roadmap. That endpoint is
  still the right answer once a month's rows get paginated — see
  `frontend/CLAUDE.md`.

## Checks that were run when it landed

- `psql`: the unique constraint rejects a duplicate `(userId, categoryId,
  month)` — confirmed by a direct `INSERT`, not by trusting the schema.
- Inheritance returns the right row for a month with no row of its own, returns
  nothing for a category whose first budget starts after the month queried, and
  — the one that matters — **raising September's limit left August still
  scoring against the older March row**. That is the property the whole table
  exists for; re-test it after any change here.
