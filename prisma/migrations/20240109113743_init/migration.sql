-- CreateTable
CREATE TABLE "Message" (
    "message_id" TEXT NOT NULL PRIMARY KEY,
    "author_id" TEXT NOT NULL,
    "channel_id" TEXT NOT NULL,
    "created_at" DATETIME NOT NULL,
    "sticker_id" TEXT,
    "content" TEXT,
    "reference_id" TEXT,
    "category_id" TEXT,
    "deleted" BOOLEAN NOT NULL DEFAULT false
);
