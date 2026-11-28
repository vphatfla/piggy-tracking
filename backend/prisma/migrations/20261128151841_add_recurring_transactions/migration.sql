-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "recurringTransactionId" INTEGER;

-- CreateTable
CREATE TABLE "RecurringTransaction" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "merchantName" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "categoryId" INTEGER,
    "day" SMALLINT NOT NULL,
    "startMonth" VARCHAR(7) NOT NULL,
    "endMonth" VARCHAR(7),
    "generatedThroughMonth" VARCHAR(7) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecurringTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RecurringTransaction_userId_startMonth_idx" ON "RecurringTransaction"("userId", "startMonth");

-- CreateIndex
CREATE UNIQUE INDEX "Transaction_recurringTransactionId_date_key" ON "Transaction"("recurringTransactionId", "date");

-- AddForeignKey
ALTER TABLE "Transaction" ADD CONSTRAINT "Transaction_recurringTransactionId_fkey" FOREIGN KEY ("recurringTransactionId") REFERENCES "RecurringTransaction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecurringTransaction" ADD CONSTRAINT "RecurringTransaction_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE SET NULL ON UPDATE CASCADE;

