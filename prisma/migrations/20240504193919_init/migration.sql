-- CreateTable
CREATE TABLE "ModerationRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "mute_id" INTEGER,
    "duration" INTEGER
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "deleted" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT,
    "sticker_id" TEXT,
    "reference_id" TEXT
);

-- CreateTable
CREATE TABLE "Infraction" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "action" INTEGER NOT NULL,
    "flag" INTEGER NOT NULL DEFAULT 0,
    "guild_id" TEXT NOT NULL,
    "executor_id" TEXT NOT NULL,
    "target_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "request_author_id" TEXT,
    "expires_at" DATETIME,
    "updated_at" DATETIME,
    "updated_by" TEXT,
    "archived_at" DATETIME,
    "archived_by" TEXT
);

-- CreateTable
CREATE TABLE "MessageReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "author_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "flags" INTEGER NOT NULL,
    "resolved_by" TEXT,
    "content" TEXT
);

-- CreateTable
CREATE TABLE "UserReport" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "target_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "reported_by" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "status" TEXT NOT NULL DEFAULT 'unresolved',
    "reason" TEXT NOT NULL,
    "resolved_by" TEXT
);

-- CreateTable
CREATE TABLE "TemporaryRole" (
    "member_id" TEXT NOT NULL,
    "role_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,

    PRIMARY KEY ("member_id", "role_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MessageReport_message_id_key" ON "MessageReport"("message_id");
