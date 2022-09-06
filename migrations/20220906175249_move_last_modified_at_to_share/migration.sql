/*
  Warnings:

  - You are about to drop the column `lastModifiedAt` on the `Destination` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "lastModifiedAt";

-- AlterTable
ALTER TABLE "Share" ADD COLUMN     "lastModifiedAt" TIMESTAMP(3) NOT NULL DEFAULT '1970-01-01 00:00:00 +00:00';
