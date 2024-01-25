-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Infraction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guild_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "executor_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flag" TEXT,
    "request_author_id" TEXT,
    "reason" TEXT,
    "expires_at" DATETIME,
    "updated_at" DATETIME,
    "updated_by" TEXT,
    "archived_at" DATETIME,
    "archived_by" TEXT
);
INSERT INTO "new_Infraction" ("action", "archived_at", "archived_by", "created_at", "executor_id", "expires_at", "flag", "guild_id", "id", "reason", "request_author_id", "target_id", "updated_at", "updated_by") SELECT "action", "archived_at", "archived_by", "created_at", "executor_id", "expires_at", "flag", "guild_id", "id", "reason", "request_author_id", "target_id", "updated_at", "updated_by" FROM "Infraction";
DROP TABLE "Infraction";
ALTER TABLE "new_Infraction" RENAME TO "Infraction";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
