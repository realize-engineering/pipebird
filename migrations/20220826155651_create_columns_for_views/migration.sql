/*
  Warnings:

  - Added the required column `lastModifiedColumn` to the `View` table without a default value. This is not possible if the table is not empty.
  - Added the required column `primaryKeyColumn` to the `View` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "schema" TEXT;

-- AlterTable
ALTER TABLE "View" ADD COLUMN     "lastModifiedColumn" TEXT NOT NULL,
ADD COLUMN     "primaryKeyColumn" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "ViewColumn" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "name" TEXT NOT NULL,
    "dataType" TEXT NOT NULL,
    "viewId" INTEGER NOT NULL,

    CONSTRAINT "ViewColumn_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "ViewColumn" ADD CONSTRAINT "ViewColumn_viewId_fkey" FOREIGN KEY ("viewId") REFERENCES "View"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
