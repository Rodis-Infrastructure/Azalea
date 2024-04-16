/*
  Warnings:

  - The primary key for the `UserReport` table will be changed. If it partially fails, the table could be left without primary key constraint.
  - You are about to drop the column `report_id` on the `UserReport` table. All the data in the column will be lost.
  - Added the required column `id` to the `UserReport` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_UserReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "resolved_by" TEXT
);
INSERT INTO "new_UserReport" ("guild_id", "reason", "reporter_id", "resolved_by", "status", "target_id") SELECT "guild_id", "reason", "reporter_id", "resolved_by", "status", "target_id" FROM "UserReport";
DROP TABLE "UserReport";
ALTER TABLE "new_UserReport" RENAME TO "UserReport";
PRAGMA foreign_key_check;
PRAGMA foreign_keys=ON;
