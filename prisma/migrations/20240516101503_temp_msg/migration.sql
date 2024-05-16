-- CreateTable
CREATE TABLE "TemporaryMessage" (
    "message_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "expires_at" DATETIME NOT NULL,

    PRIMARY KEY ("message_id", "channel_id")
);
