/*
  Warnings:

  - The values [BIGQUERY] on the enum `SourceType` will be removed. If these variants are still used in the database, this will fail.

*/
-- AlterEnum
BEGIN;
CREATE TYPE "SourceType_new" AS ENUM ('MYSQL', 'MARIADB', 'POSTGRES', 'COCKROACHDB', 'REDSHIFT', 'SNOWFLAKE', 'MSSQL');
ALTER TABLE "Source" ALTER COLUMN "sourceType" TYPE "SourceType_new" USING ("sourceType"::text::"SourceType_new");
ALTER TYPE "SourceType" RENAME TO "SourceType_old";
ALTER TYPE "SourceType_new" RENAME TO "SourceType";
DROP TYPE "SourceType_old";
COMMIT;
