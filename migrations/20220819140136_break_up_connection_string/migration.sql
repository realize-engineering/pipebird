/*
  Warnings:

  - You are about to drop the column `connectionString` on the `Source` table. All the data in the column will be lost.
  - Added the required column `host` to the `Source` table without a default value. This is not possible if the table is not empty.
  - Added the required column `password` to the `Source` table without a default value. This is not possible if the table is not empty.
  - Added the required column `port` to the `Source` table without a default value. This is not possible if the table is not empty.
  - Added the required column `username` to the `Source` table without a default value. This is not possible if the table is not empty.

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
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL
);
INSERT INTO "new_Source" ("createdAt", "id", "name", "sourceType", "status", "updatedAt") SELECT "createdAt", "id", "name", "sourceType", "status", "updatedAt" FROM "Source";
DROP TABLE "Source";
ALTER TABLE "new_Source" RENAME TO "Source";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
