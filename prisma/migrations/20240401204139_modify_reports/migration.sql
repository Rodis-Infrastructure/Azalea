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
    "content" TEXT
);
INSERT INTO "new_MessageReport" ("author_id", "channel_id", "content", "flags", "guild_id", "message_id", "reporter_id") SELECT "author_id", "channel_id", "content", "flags", "guild_id", "message_id", "reporter_id" FROM "MessageReport";
DROP TABLE "MessageReport";
ALTER TABLE "new_MessageReport" RENAME TO "MessageReport";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
