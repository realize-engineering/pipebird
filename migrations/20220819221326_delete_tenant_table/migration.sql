/*
  Warnings:

  - You are about to drop the `Tenant` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropTable
PRAGMA foreign_keys=off;
DROP TABLE "Tenant";
PRAGMA foreign_keys=on;

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Destination" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REACHABLE',
    "destinationType" TEXT NOT NULL DEFAULT 'PROVISIONED_S3',
    "connectionString" TEXT,
    "configurationId" INTEGER,
    "tenantId" TEXT NOT NULL,
    CONSTRAINT "Destination_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Destination" ("configurationId", "connectionString", "createdAt", "destinationType", "id", "name", "status", "tenantId", "updatedAt") SELECT "configurationId", "connectionString", "createdAt", "destinationType", "id", "name", "status", "tenantId", "updatedAt" FROM "Destination";
DROP TABLE "Destination";
ALTER TABLE "new_Destination" RENAME TO "Destination";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
