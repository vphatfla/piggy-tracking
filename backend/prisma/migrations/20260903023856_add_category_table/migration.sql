-- Categories become a real table, and Transaction.category (free text) becomes
-- Transaction.categoryId (a foreign key).
--
-- Hand-ordered: Prisma's generated diff dropped the old column in the same
-- statement that added the new one, which would have discarded every existing
-- category before it could be migrated. The steps below add, backfill, then
-- drop.

-- CreateTable
CREATE TABLE "Category" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Category_userId_idx" ON "Category"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Category_userId_name_key" ON "Category"("userId", "name");

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable: add the FK column while the old text column is still readable.
ALTER TABLE "Transaction" ADD COLUMN "categoryId" INTEGER;

-- Backfill 1/3 — promote each user's distinct category strings to rows.
-- 'Uncategorised' is deliberately excluded: it is the absence of a category,
-- not a category, and promoting it would hand it a budget line later on.
INSERT INTO "Category" ("userId", "name")
SELECT DISTINCT "userId", btrim("category")
FROM "Transaction"
WHERE btrim("category") <> ''
  AND lower(btrim("category")) <> 'uncategorised';

-- Backfill 2/3 — point every transaction at its new row. Rows whose category
-- was 'Uncategorised' or blank match nothing and correctly stay NULL.
UPDATE "Transaction" t
SET "categoryId" = c."id"
FROM "Category" c
WHERE c."userId" = t."userId"
  AND c."name" = btrim(t."category");

-- Backfill 3/3 — give every existing user the starter set, so the new dropdown
-- is never empty on an account that predates it. ON CONFLICT keeps a name the
-- user already had (from step 1) rather than duplicating it.
--
-- This list is duplicated from DEFAULT_CATEGORIES in src/categories.ts, which
-- is what new users get at sign-up; a migration cannot import TypeScript. Keep
-- the two in step.
INSERT INTO "Category" ("userId", "name")
SELECT u."id", d."name"
FROM "User" u
CROSS JOIN (VALUES
    ('Groceries'), ('Dining'), ('Transport'), ('Bills'),
    ('Shopping'), ('Entertainment'), ('Health')
) AS d("name")
ON CONFLICT ("userId", "name") DO NOTHING;

-- AlterTable: the text column has served its purpose.
ALTER TABLE "Transaction" DROP COLUMN "category";

-- CreateIndex
CREATE INDEX "Transaction_categoryId_idx" ON "Transaction"("categoryId");

-- AddForeignKey: SET NULL, matching receiptId. Deleting a category must not
-- delete the money that was spent — the record stays true without its label.
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;
