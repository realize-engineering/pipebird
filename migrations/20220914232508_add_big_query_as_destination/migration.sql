-- AlterEnum
ALTER TYPE "DestinationType" ADD VALUE 'BIGQUERY';

-- AlterTable
ALTER TABLE "Destination" ADD COLUMN     "serviceAccountJson" TEXT;
