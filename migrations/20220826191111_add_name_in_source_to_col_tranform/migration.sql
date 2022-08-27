/*
  Warnings:

  - Added the required column `nameInSource` to the `ColumnTransformation` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "ColumnTransformation" ADD COLUMN     "nameInSource" TEXT NOT NULL;
