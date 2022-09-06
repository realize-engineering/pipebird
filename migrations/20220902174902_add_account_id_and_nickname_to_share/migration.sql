/*
  Warnings:

  - Added the required column `warehouseAccountId` to the `Share` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Share" ADD COLUMN     "nickname" TEXT,
ADD COLUMN     "warehouseAccountId" TEXT NOT NULL;
