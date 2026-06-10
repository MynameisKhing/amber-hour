CREATE TABLE access_codes (
    code        TEXT PRIMARY KEY,
    is_active   BOOLEAN NOT NULL DEFAULT TRUE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id          BIGSERIAL PRIMARY KEY,
    nickname    TEXT NOT NULL,
    role        TEXT NOT NULL CHECK (role IN ('customer', 'staff')),
    joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE menu_items (
    id           BIGSERIAL PRIMARY KEY,
    category     TEXT NOT NULL,
    name         TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    price        NUMERIC(10,2) NOT NULL,
    is_available BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE messages (
    id           BIGSERIAL PRIMARY KEY,
    sender_nick  TEXT NOT NULL,
    role         TEXT NOT NULL,
    content      TEXT NOT NULL,
    type         TEXT NOT NULL DEFAULT 'chat' CHECK (type IN ('chat', 'whisper', 'system')),
    target_nick  TEXT,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX messages_created_at_idx ON messages (created_at DESC);

CREATE TABLE orders (
    id             BIGSERIAL PRIMARY KEY,
    customer_nick  TEXT NOT NULL,
    status         TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'served', 'cancelled')),
    created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX orders_customer_nick_idx ON orders (customer_nick);

CREATE TABLE order_items (
    id           BIGSERIAL PRIMARY KEY,
    order_id     BIGINT NOT NULL REFERENCES orders (id) ON DELETE CASCADE,
    menu_item_id BIGINT NOT NULL REFERENCES menu_items (id),
    qty          INT NOT NULL DEFAULT 1
);

CREATE TABLE guestbook (
    id         BIGSERIAL PRIMARY KEY,
    nick       TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE song_history (
    id         BIGSERIAL PRIMARY KEY,
    video_id   TEXT NOT NULL,
    added_by   TEXT NOT NULL,
    played_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed data
INSERT INTO access_codes (code) VALUES ('amber2024'), ('staff-secret');

INSERT INTO menu_items (category, name, description, price) VALUES
    ('cocktail',  'Amber Sour',      'Whiskey, lemon, honey, bitters',        280),
    ('cocktail',  'Midnight Bloom',  'Gin, elderflower, lavender, tonic',      260),
    ('cocktail',  'Golden Hour',     'Rum, mango, lime, chili salt rim',       270),
    ('light',     'Yuzu Soda',       'Fresh yuzu juice, sparkling water',      120),
    ('light',     'Butterfly Pea',   'Blue pea flower tea, lemon, honey',       90),
    ('snack',     'Truffle Fries',   'Double-fried with truffle oil, parmesan', 180),
    ('snack',     'Bruschetta',      'Tomato, basil, aged balsamic',           160);
