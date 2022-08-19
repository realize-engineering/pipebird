/*
  Warnings:

  - Added the required column `connectionString` to the `Source` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Source" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'REACHABLE',
    "sourceType" TEXT NOT NULL,
    "connectionString" TEXT NOT NULL
);
INSERT INTO "new_Source" ("createdAt", "id", "name", "sourceType", "status", "updatedAt") SELECT "createdAt", "id", "name", "sourceType", "status", "updatedAt" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
