-- Add `Transaction.date`: when the money was spent, as opposed to `createdAt`,
-- which is only when the row was entered.
--
-- Written by hand as four statements rather than Prisma's single
-- `ADD COLUMN ... NOT NULL`, which cannot run against a table that already has
-- rows. Add nullable, backfill, then constrain.
ALTER TABLE "Transaction" ADD COLUMN "date" DATE;

-- A receipt carries the real spending date, so prefer it where one exists.
UPDATE "Transaction" t
   SET "date" = r."date"
  FROM "Receipt" r
 WHERE r."id" = t."receiptId";

-- Standalone transactions have nothing better than the day they were entered.
UPDATE "Transaction" SET "date" = "createdAt"::date WHERE "date" IS NULL;

ALTER TABLE "Transaction" ALTER COLUMN "date" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Transaction_userId_date_idx" ON "Transaction"("userId", "date");
