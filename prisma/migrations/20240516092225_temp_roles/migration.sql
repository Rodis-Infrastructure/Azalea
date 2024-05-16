/*
  Warnings:

  - The primary key for the `TemporaryRole` table will be changed. If it partially fails, the table could be left without primary key constraint.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_TemporaryRole" (
    "member_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,

    PRIMARY KEY ("member_id", "role_id", "guild_id")
);
INSERT INTO "new_TemporaryRole" ("expires_at", "guild_id", "member_id", "role_id") SELECT "expires_at", "guild_id", "member_id", "role_id" FROM "TemporaryRole";
DROP TABLE "TemporaryRole";
ALTER TABLE "new_TemporaryRole" RENAME TO "TemporaryRole";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
