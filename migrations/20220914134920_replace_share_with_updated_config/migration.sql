/*
  Warnings:

  - You are about to drop the column `shareId` on the `Transfer` table. All the data in the column will be lost.
  - You are about to drop the `Share` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `destinationId` to the `Configuration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tenantId` to the `Configuration` table without a default value. This is not possible if the table is not empty.
  - Added the required column `configurationId` to the `Transfer` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Share" DROP CONSTRAINT "Share_configurationId_fkey";

-- DropForeignKey
ALTER TABLE "Share" DROP CONSTRAINT "Share_destinationId_fkey";

-- DropForeignKey
ALTER TABLE "Transfer" DROP CONSTRAINT "Transfer_shareId_fkey";

-- AlterTable
ALTER TABLE "Configuration" ADD COLUMN     "destinationId" INTEGER NOT NULL,
ADD COLUMN     "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00',
ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "tenantId" TEXT NOT NULL,
ADD COLUMN     "warehouseId" TEXT;

-- AlterTable
ALTER TABLE "Transfer" DROP COLUMN "shareId",
ADD COLUMN     "configurationId" INTEGER NOT NULL;

-- DropTable
DROP TABLE "Share";

-- AddForeignKey
ALTER TABLE "Configuration" ADD CONSTRAINT "Configuration_destinationId_fkey" FOREIGN KEY ("destinationId") REFERENCES "Destination"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
