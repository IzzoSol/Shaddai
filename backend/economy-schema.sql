-- ============================================================================
-- SHADDAI Economy Service — Postgres DDL
-- Soft-currency ("Sparks") ledger. Append-only transactions, idempotent,
-- server-authoritative. Closed-loop: there is NO cash-out / withdraw path.
-- ============================================================================
--
-- Design notes:
--   * spark_transactions is the append-only source of truth. economy_accounts
--     holds a materialized balance updated inside the SAME transaction as the
--     ledger insert (SELECT ... FOR UPDATE row lock), so a crash can never
--     leave the balance out of sync with the ledger.
--   * idempotency_key is UNIQUE — a replayed grant/spend can never double-apply.
--   * amount is BIGINT (integer Sparks, no floats). Signed: grants > 0, spends < 0.
--   * No table or column here can be used to move value OUT of the system to
--     fiat/crypto. Sparks are one-directional soft currency only.
-- ============================================================================

BEGIN;

-- --------------------------------------------------------------------------
-- Accounts: materialized Sparks balance per user.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS economy_accounts (
    user_id        TEXT        PRIMARY KEY,
    sparks_balance BIGINT      NOT NULL DEFAULT 0 CHECK (sparks_balance >= 0),
    updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- --------------------------------------------------------------------------
-- Ledger: append-only, signed transactions. The source of truth.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS spark_transactions (
    id              BIGSERIAL   PRIMARY KEY,
    user_id         TEXT        NOT NULL,
    amount          BIGINT      NOT NULL,          -- signed: grant > 0, spend < 0
    reason          TEXT        NOT NULL,
    ref_id          TEXT,                          -- optional external reference
    idempotency_key TEXT        NOT NULL UNIQUE,   -- replay protection
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_spark_tx_user     ON spark_transactions (user_id);
CREATE INDEX IF NOT EXISTS idx_spark_tx_created  ON spark_transactions (created_at);

-- --------------------------------------------------------------------------
-- Inventory: items a user owns (purchased/granted). Append-on-acquire.
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS inventory_items (
    id           BIGSERIAL   PRIMARY KEY,
    user_id      TEXT        NOT NULL,
    catalog_id   TEXT        NOT NULL,
    qty          BIGINT      NOT NULL DEFAULT 1 CHECK (qty > 0),
    placed_where TEXT,                              -- e.g. room/slot, NULL = unplaced
    acquired_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_inventory_user ON inventory_items (user_id);

-- Idempotency for grantItem: guard is enforced in the ledger too, but a
-- dedicated unique key on the acquire event keeps inventory grants replay-safe.
-- We store the acquire idempotency key alongside the item.
ALTER TABLE inventory_items
    ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inventory_idem
    ON inventory_items (idempotency_key)
    WHERE idempotency_key IS NOT NULL;

-- --------------------------------------------------------------------------
-- Catalog: purchasable items. sparks_price for soft-currency buys,
-- usd_price_cents for real-money buys (handled by Stripe layer, not here).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS catalog_items (
    id             TEXT        PRIMARY KEY,
    name           TEXT        NOT NULL,
    kind           TEXT        NOT NULL,            -- e.g. 'wearable','room','boost'
    sparks_price   BIGINT      NOT NULL DEFAULT 0 CHECK (sparks_price >= 0),
    usd_price_cents INTEGER    NOT NULL DEFAULT 0 CHECK (usd_price_cents >= 0),
    rarity         TEXT,
    active         BOOLEAN     NOT NULL DEFAULT TRUE
);

-- --------------------------------------------------------------------------
-- Subscriptions: Stripe tier state (read/written by billing layer).
-- --------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscriptions (
    user_id            TEXT        PRIMARY KEY,
    stripe_customer_id TEXT,
    stripe_sub_id      TEXT,
    tier               TEXT,
    status             TEXT,
    current_period_end TIMESTAMPTZ
);

COMMIT;
