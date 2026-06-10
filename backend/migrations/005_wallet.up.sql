-- Wallet / economy: every patron carries a ฿ balance.
-- New and existing users start with ฿300.
ALTER TABLE users ADD COLUMN IF NOT EXISTS balance NUMERIC(10,2) NOT NULL DEFAULT 300;

CREATE INDEX IF NOT EXISTS users_balance_idx ON users (balance DESC);
