/*
  Warnings:

  - The primary key for the `HighlightChannelScoping` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HighlightChannelScoping" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "guild_id", "channel_id"),
    CONSTRAINT "HighlightChannelScoping_user_id_guild_id_fkey" FOREIGN KEY ("user_id", "guild_id") REFERENCES "Highlight" ("user_id", "guild_id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_HighlightChannelScoping" ("channel_id", "guild_id", "type", "user_id") SELECT "channel_id", "guild_id", "type", "user_id" FROM "HighlightChannelScoping";
DROP TABLE "HighlightChannelScoping";
ALTER TABLE "new_HighlightChannelScoping" RENAME TO "HighlightChannelScoping";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
