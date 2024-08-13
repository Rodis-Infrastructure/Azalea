-- CreateTable
CREATE TABLE "Highlight" (
    "user_id" TEXT NOT NULL,
    "guild_id" TEXT NOT NULL,
    "pattern" TEXT NOT NULL,

    PRIMARY KEY ("user_id", "guild_id", "pattern")
);
