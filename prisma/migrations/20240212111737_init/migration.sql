/*
  Warnings:

  - You are about to drop the column `guild_id` on the `Message` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "Request" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "punishment_type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "duration" INTEGER
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "content" TEXT,
    "sticker_id" TEXT,
    "reference_id" TEXT,
    "category_id" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);
INSERT INTO "new_Message" ("author_id", "category_id", "channel_id", "content", "created_at", "deleted", "id", "reference_id", "sticker_id") SELECT "author_id", "category_id", "channel_id", "content", "created_at", "deleted", "id", "reference_id", "sticker_id" FROM "Message";
DROP TABLE "Message";
ALTER TABLE "new_Message" RENAME TO "Message";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
