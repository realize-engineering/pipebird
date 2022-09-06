/*
  Warnings:

  - You are about to drop the column `configurationId` on the `Destination` table. All the data in the column will be lost.
  - You are about to drop the column `tenantId` on the `Destination` table. All the data in the column will be lost.
  - You are about to drop the column `destinationId` on the `Transfer` table. All the data in the column will be lost.
  - Added the required column `shareId` to the `Transfer` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Destination" DROP CONSTRAINT "Destination_configurationId_fkey";

-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_destinationId_fkey";

-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "configurationId",
DROP COLUMN "tenantId";

-- AlterTable
ALTER TABLE "Transfer" DROP COLUMN "destinationId",
ADD COLUMN     "shareId" INTEGER NOT NULL;

-- CreateTable
CREATE TABLE "Share" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT NOT NULL,
    "destinationId" INTEGER NOT NULL,
    "configurationId" INTEGER NOT NULL,

    CONSTRAINT "Share_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Share" ADD CONSTRAINT "Share_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_shareId_fkey" FOREIGN KEY ("shareId") REFERENCES "Share"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
