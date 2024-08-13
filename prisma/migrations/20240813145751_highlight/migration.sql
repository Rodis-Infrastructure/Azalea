/*
  Warnings:

  - The primary key for the `Highlight` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `pattern` on the `Highlight` table. All the data in the column will be lost.

*/
-- CreateTable
CREATE TABLE "HighlightPattern" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "guild_id", "pattern"),
    CONSTRAINT "HighlightPattern_user_id_guild_id_fkey" FOREIGN KEY ("user_id", "guild_id") REFERENCES "Highlight" ("user_id", "guild_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "HighlightChannelScoping" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "type" INTEGER NOT NULL,

    PRIMARY KEY ("user_id", "guild_id", "channel_id", "type"),
    CONSTRAINT "HighlightChannelScoping_user_id_guild_id_fkey" FOREIGN KEY ("user_id", "guild_id") REFERENCES "Highlight" ("user_id", "guild_id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Highlight" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "guild_id")
);
INSERT INTO "new_Highlight" ("guild_id", "user_id") SELECT "guild_id", "user_id" FROM "Highlight";
DROP TABLE "Highlight";
ALTER TABLE "new_Highlight" RENAME TO "Highlight";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
