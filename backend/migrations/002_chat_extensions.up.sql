ALTER TABLE messages
    ADD COLUMN IF NOT EXISTS media_url  TEXT,
    ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

CREATE TABLE IF NOT EXISTS reactions (
    message_id  BIGINT      NOT NULL,
    nick        TEXT        NOT NULL,
    emoji       TEXT        NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (message_id, nick, emoji)
);
