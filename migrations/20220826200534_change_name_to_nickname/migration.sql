/*
  Warnings:

  - You are about to drop the column `name` on the `Destination` table. All the data in the column will be lost.
  - You are about to drop the column `name` on the `Source` table. All the data in the column will be lost.
  - Added the required column `nickname` to the `Destination` table without a default value. This is not possible if the table is not empty.
  - Added the required column `nickname` to the `Source` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "name",
ADD COLUMN     "nickname" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "Source" DROP COLUMN "name",
ADD COLUMN     "nickname" TEXT NOT NULL;
