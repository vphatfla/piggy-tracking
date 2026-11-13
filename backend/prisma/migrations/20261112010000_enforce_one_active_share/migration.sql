-- Enforce "one active share per user" in the database instead of with an
-- advisory lock.
--
-- The lock existed because the invariant spans two columns, so the check had to
-- be a read -- and a read over rows that do not exist yet locks nothing under
-- READ COMMITTED, which is what Prisma opens an interactive transaction with.
-- Two concurrent redemptions both saw "no conflict" and both inserted.
-- `User.activeShareId` moves the invariant onto rows that always exist, so a
-- conditional UPDATE serialises it. The partial index at the bottom is a second
-- line of defence and covers the same-pair case only.

-- AlterTable: nullable, and nothing reads it yet.
ALTER TABLE "User" ADD COLUMN "activeShareId" INTEGER;

-- Backfill from the shares that are live right now, so anybody already sharing
-- is correctly blocked from redeeming a code the moment this ships.
UPDATE "User" u
   SET "activeShareId" = s."id"
  FROM "Share" s
 WHERE s."revokedAt" IS NULL
   AND (s."initiatorId" = u."id" OR s."partnerId" = u."id");

-- CreateIndex
CREATE INDEX "User_activeShareId_idx" ON "User"("activeShareId");

-- AddForeignKey: SET NULL, matching Transaction.receiptId -- ending a share
-- must not delete the people who were in it.
ALTER TABLE "User" ADD CONSTRAINT "User_activeShareId_fkey" FOREIGN KEY ("activeShareId") REFERENCES "Share"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateIndex: at most one *active* share per unordered pair. Partial and
-- expression-based, so schema.prisma cannot declare it -- `prisma migrate dev`
-- will see it as drift and offer to drop it. See backend/CLAUDE.md before
-- running that.
CREATE UNIQUE INDEX "Share_active_pair_key"
    ON "Share" (LEAST("initiatorId", "partnerId"), GREATEST("initiatorId", "partnerId"))
 WHERE "revokedAt" IS NULL;
