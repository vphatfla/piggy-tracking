-- CreateEnum
CREATE TYPE "IncomeType" AS ENUM ('ONE_TIME', 'RECURRING');

-- CreateTable
CREATE TABLE "Income" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "type" "IncomeType" NOT NULL,
    "month" VARCHAR(7) NOT NULL,
    "endMonth" VARCHAR(7),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Income_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Income_userId_month_idx" ON "Income"("userId", "month");

-- AddForeignKey
ALTER TABLE "Income" ADD CONSTRAINT "Income_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
