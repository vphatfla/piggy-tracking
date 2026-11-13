-- Enforce "one share per user" in the database, and normalize Share's member
-- pair so a pair can only share once.
--
-- Two problems, one migration.
--
-- 1. The one-share-per-user rule was an application check wrapped in an
--    advisory lock. It had to be: a user may sit in either member column, so no
--    unique index expresses the rule, and checking it with a read does not work
--    because the read matches rows that do not exist yet -- and a read matching
--    nothing takes no lock under READ COMMITTED, which is what Prisma opens an
--    interactive transaction with. Two concurrent redemptions both passed it.
--    `User.activeShareId` moves the invariant onto rows that always exist, so a
--    conditional UPDATE serialises it.
--
-- 2. `initiatorId`/`partnerId` become `userLoId`/`userHiId`, lesser id first, so
--    (A,B) and (B,A) are the same row and a plain unique constraint means what
--    it should. Nothing needed the initiator/partner distinction:
--    `budgetOwnerUserId` is set from the invite's creator rather than from a
--    Share column, and the `isInitiator` field it fed was never read.
--
-- `revokedAt` goes with it. Every use of it was a `revokedAt IS NULL` filter --
-- nothing ever read a revoked row -- and keeping dead rows would have forced the
-- pair constraint to be a *partial* index, which Prisma cannot declare. Ending a
-- share now deletes the row, which also releases both members for free: the
-- `User.activeShareId` foreign key below is ON DELETE SET NULL.

-- AlterTable: add the claim column, nullable, with nothing reading it yet.
ALTER TABLE "User" ADD COLUMN "activeShareId" INTEGER;

-- AlterTable: add the normalized pair while the old columns are still readable.
ALTER TABLE "Share" ADD COLUMN "userLoId" INTEGER;
ALTER TABLE "Share" ADD COLUMN "userHiId" INTEGER;

-- Backfill 1/3 -- normalize every existing pair.
UPDATE "Share"
   SET "userLoId" = LEAST("initiatorId", "partnerId"),
       "userHiId" = GREATEST("initiatorId", "partnerId");

-- Backfill 2/3 -- revoked rows are what the new model has no place for, and a
-- pair that shared more than once would break the unique constraint below.
DELETE FROM "Share" WHERE "revokedAt" IS NOT NULL;

-- Backfill 3/3 -- claim both members of every share that survived, so anybody
-- already sharing is correctly blocked from redeeming a code.
UPDATE "User" u
   SET "activeShareId" = s."id"
  FROM "Share" s
 WHERE s."userLoId" = u."id" OR s."userHiId" = u."id";

ALTER TABLE "Share" ALTER COLUMN "userLoId" SET NOT NULL;
ALTER TABLE "Share" ALTER COLUMN "userHiId" SET NOT NULL;

-- AlterTable: the old shape has served its purpose. Dropping a column drops its
-- foreign key and indexes along with it.
ALTER TABLE "Share" DROP COLUMN "initiatorId";
ALTER TABLE "Share" DROP COLUMN "partnerId";
ALTER TABLE "Share" DROP COLUMN "revokedAt";

-- CreateIndex: a pair shares at most once. A plain unique over two real
-- columns, which is the whole point of storing them normalized.
CREATE UNIQUE INDEX "Share_userLoId_userHiId_key" ON "Share"("userLoId", "userHiId");

-- CreateIndex: the unique above already covers userLoId as its prefix; this is
-- for the other half of `userLoId = ? OR userHiId = ?`.
CREATE INDEX "Share_userHiId_idx" ON "Share"("userHiId");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_userLoId_fkey" FOREIGN KEY ("userLoId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_userHiId_fkey" FOREIGN KEY ("userHiId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateIndex
CREATE INDEX "User_activeShareId_idx" ON "User"("activeShareId");

-- AddForeignKey: SET NULL, so deleting a share clears both members' claims
-- without the revoke handler having to do it by hand. Not CASCADE -- ending a
-- share must not delete the people who were in it.
ALTER TABLE "User" ADD CONSTRAINT "User_activeShareId_fkey" FOREIGN KEY ("activeShareId") REFERENCES "Share"("id") ON DELETE SET NULL ON UPDATE CASCADE;
