/*
  Warnings:

  - Made the column `reason` on table `Infraction` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Infraction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "guild_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "executor_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "flag" TEXT,
    "request_author_id" TEXT,
    "expires_at" DATETIME,
    "updated_at" DATETIME,
    "updated_by" TEXT,
    "archived_at" DATETIME,
    "archived_by" TEXT
);
INSERT INTO "new_Infraction" ("action", "archived_at", "archived_by", "created_at", "executor_id", "expires_at", "flag", "guild_id", "id", "reason", "request_author_id", "target_id", "updated_at", "updated_by") SELECT "action", "archived_at", "archived_by", "created_at", "executor_id", "expires_at", "flag", "guild_id", "id", "reason", "request_author_id", "target_id", "updated_at", "updated_by" FROM "Infraction";
DROP TABLE "Infraction";
ALTER TABLE "new_Infraction" RENAME TO "Infraction";
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "content" TEXT,
    "sticker_id" TEXT,
    "reference_id" TEXT,
    "category_id" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Message" ("author_id", "category_id", "channel_id", "content", "created_at", "deleted", "guild_id", "id", "reference_id", "sticker_id") SELECT "author_id", "category_id", "channel_id", "content", "created_at", "deleted", "guild_id", "id", "reference_id", "sticker_id" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
