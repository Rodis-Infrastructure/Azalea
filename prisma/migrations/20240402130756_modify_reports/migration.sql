/*
  Warnings:

  - Added the required column `report_id` to the `MessageReport` table without a default value. This is not possible if the table is not empty.
  - Added the required column `report_id` to the `UserReport` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageReport" (
    "message_id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "flags" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "report_id" TEXT NOT NULL,
    "resolved_by" TEXT,
    "content" TEXT
);
INSERT INTO "new_MessageReport" ("author_id", "channel_id", "content", "flags", "guild_id", "message_id", "reporter_id", "resolved_by", "status") SELECT "author_id", "channel_id", "content", "flags", "guild_id", "message_id", "reporter_id", "resolved_by", "status" FROM "MessageReport";
DROP TABLE "MessageReport";
ALTER TABLE "new_MessageReport" RENAME TO "MessageReport";
CREATE TABLE "new_UserReport" (
    "target_id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "report_id" TEXT NOT NULL,
    "resolved_by" TEXT
);
INSERT INTO "new_UserReport" ("guild_id", "reason", "reporter_id", "resolved_by", "status", "target_id") SELECT "guild_id", "reason", "reporter_id", "resolved_by", "status", "target_id" FROM "UserReport";
DROP TABLE "UserReport";
ALTER TABLE "new_UserReport" RENAME TO "UserReport";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
