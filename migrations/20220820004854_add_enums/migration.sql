/*
  Warnings:

  - You are about to drop the `Logs` table. If the table is not empty, all the data it contains will be lost.
  - Changed the type of `status` on the `Destination` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `destinationType` on the `Destination` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `Source` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `sourceType` on the `Source` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.
  - Changed the type of `status` on the `Transfer` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- CreateEnum
CREATE TYPE "ConnectorStatus" AS ENUM ('REACHABLE', 'UNREACHABLE');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('MYSQL', 'POSTGRES', 'REDSHIFT', 'SNOWFLAKE', 'BIGQUERY');

-- CreateEnum
CREATE TYPE "DestinationType" AS ENUM ('POSTGRES', 'PROVISIONED_S3');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('STARTED', 'PENDING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "LogDomain" AS ENUM ('SOURCE', 'VIEW', 'CONFIGURATION', 'DESTINATION', 'TRANSFER');

-- CreateEnum
CREATE TYPE "LogAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE');

-- AlterTable
ALTER TABLE "Destination" DROP COLUMN "status",
ADD COLUMN     "status" "ConnectorStatus" NOT NULL,
DROP COLUMN "destinationType",
ADD COLUMN     "destinationType" "DestinationType" NOT NULL;

-- AlterTable
ALTER TABLE "Source" DROP COLUMN "status",
ADD COLUMN     "status" "ConnectorStatus" NOT NULL,
DROP COLUMN "sourceType",
ADD COLUMN     "sourceType" "SourceType" NOT NULL;

-- AlterTable
ALTER TABLE "Transfer" DROP COLUMN "status",
ADD COLUMN     "status" "TransferStatus" NOT NULL;

-- DropTable
DROP TABLE "Logs";

-- CreateTable
CREATE TABLE "Log" (
    "id" SERIAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "domain" "LogDomain" NOT NULL,
    "action" "LogAction" NOT NULL,
    "domainId" TEXT NOT NULL,
    "meta" JSONB NOT NULL,

    CONSTRAINT "Log_pkey" PRIMARY KEY ("id")
);
