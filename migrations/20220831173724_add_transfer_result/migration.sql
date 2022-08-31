/*
  Warnings:

  - You are about to drop the column `finalizedAt` on the `Transfer` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Transfer" DROP COLUMN "finalizedAt";

-- CreateTable
CREATE TABLE "TransferResult" (
    "finalizedAt" TIMESTAMP(3) NOT NULL,
    "objectUrl" TEXT,
    "transferId" INTEGER NOT NULL,

    CONSTRAINT "TransferResult_pkey" PRIMARY KEY ("transferId","finalizedAt")
);

-- CreateIndex
CREATE UNIQUE INDEX "TransferResult_transferId_key" ON "TransferResult"("transferId");

-- AddForeignKey
ALTER TABLE "TransferResult" ADD CONSTRAINT "TransferResult_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
