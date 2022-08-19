-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ColumnTransformation" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "nameInSource" TEXT NOT NULL,
    "nameInDestination" TEXT NOT NULL,
    "destinationFormatString" TEXT NOT NULL,
    "transformer" TEXT NOT NULL,
    "isPrimaryKey" BOOLEAN NOT NULL,
    "isLastModified" BOOLEAN NOT NULL,
    "configurationId" INTEGER NOT NULL,
    CONSTRAINT "ColumnTransformation_configurationId_fkey" FOREIGN KEY ("configurationId") REFERENCES "Configuration" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_ColumnTransformation" ("configurationId", "createdAt", "destinationFormatString", "id", "isLastModified", "isPrimaryKey", "nameInDestination", "nameInSource", "transformer", "updatedAt") SELECT "configurationId", "createdAt", "destinationFormatString", "id", "isLastModified", "isPrimaryKey", "nameInDestination", "nameInSource", "transformer", "updatedAt" FROM "ColumnTransformation";
DROP TABLE "ColumnTransformation";
ALTER TABLE "new_ColumnTransformation" RENAME TO "ColumnTransformation";
CREATE UNIQUE INDEX "ColumnTransformation_configurationId_nameInDestination_key" ON "ColumnTransformation"("configurationId", "nameInDestination");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
