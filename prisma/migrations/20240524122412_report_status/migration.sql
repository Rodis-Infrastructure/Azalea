-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 1,
    "flags" INTEGER NOT NULL,
    "message_deleted" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" TEXT,
    "content" TEXT
);
INSERT INTO "new_MessageReport" ("author_id", "channel_id", "content", "created_at", "flags", "id", "message_deleted", "message_id", "reported_by", "resolved_by", "status") SELECT "author_id", "channel_id", "content", "created_at", "flags", "id", "message_deleted", "message_id", "reported_by", "resolved_by",
CASE "status"
    WHEN 'quick_mute_30' THEN 1
    WHEN 'quick_mute_60' THEN 2
    WHEN 'resolved' THEN 3
    WHEN 'unresolved' THEN 4
    WHEN 'expired' THEN 5
END AS "status" FROM "MessageReport";
DROP TABLE "MessageReport";
ALTER TABLE "new_MessageReport" RENAME TO "MessageReport";
CREATE UNIQUE INDEX "MessageReport_message_id_key" ON "MessageReport"("message_id");
CREATE TABLE "new_UserReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "resolved_by" TEXT
);
INSERT INTO "new_UserReport" ("created_at", "guild_id", "id", "reason", "reported_by", "resolved_by", "target_id", "status") SELECT "created_at", "guild_id", "id", "reason", "reported_by", "resolved_by", "target_id",
CASE "status"
    WHEN 'resolved' THEN 1
    WHEN 'unresolved' THEN 2
    WHEN 'expired' THEN 3
END AS "status" FROM "UserReport";
DROP TABLE "UserReport";
ALTER TABLE "new_UserReport" RENAME TO "UserReport";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;