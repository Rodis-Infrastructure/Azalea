-- AlterTable
ALTER TABLE "MessageReport" ADD COLUMN "resolved_by" TEXT;

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserReport" (
    "target_id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "resolved_by" TEXT
);
INSERT INTO "new_UserReport" ("guild_id", "reason", "reporter_id", "target_id") SELECT "guild_id", "reason", "reporter_id", "target_id" FROM "UserReport";
DROP TABLE "UserReport";
ALTER TABLE "new_UserReport" RENAME TO "UserReport";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
