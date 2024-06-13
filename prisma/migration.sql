-- CreateTable
CREATE TABLE 'BanRequest' (
    'id' TEXT NOT NULL PRIMARY KEY,
    'author_id' TEXT NOT NULL,
    'target_id' TEXT NOT NULL,
    'guild_id' TEXT NOT NULL,
    'reason' TEXT NOT NULL,
    'created_at' DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    'status' INTEGER NOT NULL DEFAULT 1,
    'mute_id' INTEGER
);

-- CreateTable
CREATE TABLE 'MuteRequest' (
    'id' TEXT NOT NULL PRIMARY KEY,
    'author_id' TEXT NOT NULL,
    'target_id' TEXT NOT NULL,
    'guild_id' TEXT NOT NULL,
    'reason' TEXT NOT NULL,
    'created_at' DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    'status' INTEGER NOT NULL DEFAULT 1,
    'duration' INTEGER NOT NULL
);

INSERT INTO 'MuteRequest'
SELECT id, author_id, target_id, guild_id, reason, created_at, CASE
    WHEN status = 'pending' THEN 1
    WHEN status = 'approved' THEN 2
    WHEN status = 'denied' THEN 3
    WHEN status = 'deleted' THEN 4
    WHEN status = 'unknown' THEN 5
    ELSE 5
END AS status, duration
FROM 'ModerationRequest'
WHERE type = 'mute';

INSERT INTO 'BanRequest'
SELECT id, author_id, target_id, guild_id, reason, created_at, CASE
    WHEN status = 'pending' THEN 1
    WHEN status = 'approved' THEN 2
    WHEN status = 'denied' THEN 3
    WHEN status = 'deleted' THEN 4
    WHEN status = 'unknown' THEN 5
    ELSE 5
END AS status, mute_id
FROM 'ModerationRequest'
WHERE type = 'ban';

DROP TABLE 'ModerationRequest';