-- DropIndex: Remove redundant Infraction index (covered by the broader 5-column index)
DROP INDEX "Infraction_target_id_guild_id_archived_at_archived_by_idx";

-- RedefineTable: Remove dead `mute_id` field from BanRequest
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_BanRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 1,
    "reviewer_id" TEXT
);
INSERT INTO "new_BanRequest" ("author_id", "created_at", "guild_id", "id", "reason", "reviewer_id", "status", "target_id")
SELECT "author_id", "created_at", "guild_id", "id", "reason", "reviewer_id", "status", "target_id" FROM "BanRequest";
DROP TABLE "BanRequest";
ALTER TABLE "new_BanRequest" RENAME TO "BanRequest";
CREATE INDEX "BanRequest_status_guild_id_idx" ON "BanRequest"("status", "guild_id");
CREATE INDEX "BanRequest_target_id_guild_id_status_idx" ON "BanRequest"("target_id", "guild_id", "status");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- RedefineTable: Add `guild_id` to MessageReport with backfill from Message table
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

-- Create the new table with guild_id (NOT NULL, no default)
CREATE TABLE "new_MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" INTEGER NOT NULL DEFAULT 4,
    "flags" INTEGER NOT NULL,
    "message_deleted" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" TEXT,
    "content" TEXT
);

-- Backfill guild_id from Message table by joining on channel_id
-- Reports whose channel_id has no matching Message row are assigned an empty guild_id
-- (these are stale/orphaned reports that will be cleaned up by TTL)
INSERT INTO "new_MessageReport" ("id", "message_id", "channel_id", "guild_id", "author_id", "reported_by", "created_at", "status", "flags", "message_deleted", "resolved_by", "content")
SELECT
    mr."id",
    mr."message_id",
    mr."channel_id",
    COALESCE(
        (SELECT m."guild_id" FROM "Message" m WHERE m."channel_id" = mr."channel_id" LIMIT 1),
        ''
    ),
    mr."author_id",
    mr."reported_by",
    mr."created_at",
    mr."status",
    mr."flags",
    mr."message_deleted",
    mr."resolved_by",
    mr."content"
FROM "MessageReport" mr;

-- Drop old table and rename
DROP TABLE "MessageReport";
ALTER TABLE "new_MessageReport" RENAME TO "MessageReport";

-- Recreate unique constraint and indexes
CREATE UNIQUE INDEX "MessageReport_message_id_key" ON "MessageReport"("message_id");
CREATE INDEX "MessageReport_status_guild_id_idx" ON "MessageReport"("status", "guild_id");
CREATE INDEX "MessageReport_author_id_status_guild_id_idx" ON "MessageReport"("author_id", "status", "guild_id");
CREATE INDEX "MessageReport_author_id_status_message_deleted_guild_id_idx" ON "MessageReport"("author_id", "status", "message_deleted", "guild_id");
CREATE INDEX "MessageReport_created_at_status_guild_id_idx" ON "MessageReport"("created_at", "status", "guild_id");

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex: Highlight guild_id index for hot-path guild-scoped queries
CREATE INDEX "Highlight_guild_id_idx" ON "Highlight"("guild_id");
