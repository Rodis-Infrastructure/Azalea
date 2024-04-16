-- CreateTable
CREATE TABLE "MessageReport" (
    "message_id" TEXT NOT NULL PRIMARY KEY,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "flags" INTEGER NOT NULL,
    "content" TEXT
);

-- CreateTable
CREATE TABLE "UserReport" (
    "target_id" TEXT NOT NULL PRIMARY KEY,
    "reporter_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL
);
