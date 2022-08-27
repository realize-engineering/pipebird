/*
  Warnings:

  - You are about to drop the column `isLastModified` on the `ColumnTransformation` table. All the data in the column will be lost.
  - You are about to drop the column `isPrimaryKey` on the `ColumnTransformation` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE "ColumnTransformation" DROP COLUMN "isLastModified",
DROP COLUMN "isPrimaryKey";
