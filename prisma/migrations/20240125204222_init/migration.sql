/*
  Warnings:

  - Made the column `content` on table `Message` required. This step will fail if there are existing NULL values in that column.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "content" TEXT NOT NULL,
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
