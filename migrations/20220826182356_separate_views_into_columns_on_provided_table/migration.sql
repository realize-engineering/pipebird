/*
  Warnings:

  - You are about to drop the column `destinationFormatString` on the `ColumnTransformation` table. All the data in the column will be lost.
  - You are about to drop the column `nameInSource` on the `ColumnTransformation` table. All the data in the column will be lost.
  - You are about to drop the column `transformer` on the `ColumnTransformation` table. All the data in the column will be lost.
  - You are about to drop the column `connectionString` on the `Destination` table. All the data in the column will be lost.
  - You are about to drop the column `lastModifiedColumn` on the `View` table. All the data in the column will be lost.
  - You are about to drop the column `primaryKeyColumn` on the `View` table. All the data in the column will be lost.
  - You are about to drop the column `tableExpression` on the `View` table. All the data in the column will be lost.
  - You are about to drop the column `tenantColumn` on the `View` table. All the data in the column will be lost.
  - Added the required column `dataType` to the `ColumnTransformation` table without a default value. This is not possible if the table is not empty.
  - Added the required column `viewColumnId` to the `ColumnTransformation` table without a default value. This is not possible if the table is not empty.
  - Made the column `configurationId` on table `Destination` required. This step will fail if there are existing NULL values in that column.
  - Added the required column `database` to the `Source` table without a default value. This is not possible if the table is not empty.
  - Added the required column `schema` to the `Source` table without a default value. This is not possible if the table is not empty.
  - Added the required column `tableName` to the `View` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isLastModified` to the `ViewColumn` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isPrimaryKey` to the `ViewColumn` table without a default value. This is not possible if the table is not empty.
  - Added the required column `isTenantColumn` to the `ViewColumn` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "Destination" DROP CONSTRAINT "Destination_configurationId_fkey";

-- AlterTable
ALTER TABLE "ColumnTransformation" DROP COLUMN "destinationFormatString",
DROP COLUMN "nameInSource",
DROP COLUMN "transformer",
ADD COLUMN     "dataType" TEXT NOT NULL,
ADD COLUMN     "viewColumnId" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "connectionString",
ADD COLUMN     "database" TEXT,
ADD COLUMN     "host" TEXT,
ADD COLUMN     "password" TEXT,
ADD COLUMN     "port" INTEGER,
ADD COLUMN     "username" TEXT,
ALTER COLUMN "configurationId" SET NOT NULL;

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "database" TEXT NOT NULL,
ADD COLUMN     "schema" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "View" DROP COLUMN "lastModifiedColumn",
DROP COLUMN "primaryKeyColumn",
DROP COLUMN "tableExpression",
DROP COLUMN "tenantColumn",
ADD COLUMN     "tableName" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "ViewColumn" ADD COLUMN     "isLastModified" BOOLEAN NOT NULL,
ADD COLUMN     "isPrimaryKey" BOOLEAN NOT NULL,
ADD COLUMN     "isTenantColumn" BOOLEAN NOT NULL;

-- AddForeignKey
ALTER TABLE "ColumnTransformation" ADD CONSTRAINT "ColumnTransformation_viewColumnId_fkey" FOREIGN KEY ("viewColumnId") REFERENCES "ViewColumn"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Destination" ADD CONSTRAINT "Destination_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
