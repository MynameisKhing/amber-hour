ALTER TABLE messages
    DROP COLUMN IF EXISTS reply_to,
    DROP COLUMN IF EXISTS edited_at;
