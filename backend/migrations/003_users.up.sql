CREATE TABLE IF NOT EXISTS users (
    id            BIGSERIAL PRIMARY KEY,
    username      TEXT NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'customer' CHECK (role IN ('customer', 'staff')),
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- case-insensitive uniqueness: "Alice" and "alice" can't both register
CREATE UNIQUE INDEX IF NOT EXISTS users_username_lower_idx ON users (lower(username));
