DROP TABLE IF EXISTS reactions;

ALTER TABLE messages
    DROP COLUMN IF EXISTS media_url,
    DROP COLUMN IF EXISTS deleted_at;
