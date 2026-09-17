-- CreateTable
CREATE TABLE "Share" (
    "id" SERIAL NOT NULL,
    "initiatorId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "budgetOwnerUserId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Share_initiatorId_idx" ON "Share"("initiatorId");

-- CreateIndex
CREATE INDEX "Share_partnerId_idx" ON "Share"("partnerId");

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_initiatorId_fkey" FOREIGN KEY ("initiatorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_budgetOwnerUserId_fkey" FOREIGN KEY ("budgetOwnerUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
