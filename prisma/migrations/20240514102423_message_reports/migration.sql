-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "flags" INTEGER NOT NULL,
    "message_deleted" BOOLEAN NOT NULL DEFAULT false,
    "resolved_by" TEXT,
    "content" TEXT
);
INSERT INTO "new_MessageReport" ("author_id", "channel_id", "content", "created_at", "flags", "id", "message_id", "reported_by", "resolved_by", "status") SELECT "author_id", "channel_id", "content", "created_at", "flags", "id", "message_id", "reported_by", "resolved_by", "status" FROM "MessageReport";
DROP TABLE "MessageReport";
ALTER TABLE "new_MessageReport" RENAME TO "MessageReport";
CREATE UNIQUE INDEX "MessageReport_message_id_key" ON "MessageReport"("message_id");
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
