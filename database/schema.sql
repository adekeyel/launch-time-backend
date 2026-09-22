-- LAUNCH TIME - Local Food Ordering System
-- PostgreSQL schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- =========================================================
-- USERS  (customer | vendor | admin)
-- =========================================================
CREATE TABLE IF NOT EXISTS users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    fullname        VARCHAR(150) NOT NULL,
    email           VARCHAR(255) NOT NULL UNIQUE,
    password        VARCHAR(255) NOT NULL,
    phone           VARCHAR(30),
    role            VARCHAR(20) NOT NULL DEFAULT 'customer'
                    CHECK (role IN ('customer', 'vendor', 'admin', 'staff')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Upgrade path: widen the role check constraint on databases created before
-- the 'staff' role (Enterprise branch/staff accounts) existed.
DO $$
BEGIN
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
    ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('customer', 'vendor', 'admin', 'staff'));
END $$;

-- =========================================================
-- VENDORS  (1-1 with users where role = vendor)
-- =========================================================
CREATE TABLE IF NOT EXISTS vendors (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    business_name   VARCHAR(150) NOT NULL,
    description     TEXT,
    tagline         VARCHAR(200),
    categories      TEXT[] NOT NULL DEFAULT '{}',
    eta             VARCHAR(50),
    address         VARCHAR(255),
    latitude        DOUBLE PRECISION,
    longitude       DOUBLE PRECISION,
    phone           VARCHAR(30),
    logo_url        TEXT,
    logo_public_id  VARCHAR(255),
    banner_url      TEXT,
    banner_public_id VARCHAR(255),
    banner_media_type VARCHAR(10) NOT NULL DEFAULT 'image' CHECK (banner_media_type IN ('image', 'video')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'suspended', 'rejected')),
    tier            SMALLINT NOT NULL DEFAULT 0 CHECK (tier IN (0, 1, 2, 3)),
    -- Tiers: 0=Registered, 1=Verified (OffPay), 2=Pro (subscription), 3=Enterprise (reserved, admin-gated)
    offpay_merchant_ref VARCHAR(150),
    payment_verified_at TIMESTAMPTZ,
    pro_since       TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tier SMALLINT NOT NULL DEFAULT 0;

DO $$
BEGIN
    ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_tier_check;
    ALTER TABLE vendors ADD CONSTRAINT vendors_tier_check CHECK (tier IN (0, 1, 2, 3));
END $$;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS offpay_merchant_ref VARCHAR(150);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS payment_verified_at TIMESTAMPTZ;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS pro_since TIMESTAMPTZ;

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS logo_public_id VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_public_id VARCHAR(255);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS banner_media_type VARCHAR(10) NOT NULL DEFAULT 'image';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS tagline VARCHAR(200);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS eta VARCHAR(50);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;

CREATE INDEX IF NOT EXISTS idx_vendors_status ON vendors(status);

-- =========================================================
-- FOODS
-- =========================================================
CREATE TABLE IF NOT EXISTS foods (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    description     TEXT,
    price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    category        VARCHAR(80),
    image           TEXT,
    image_public_id VARCHAR(255),
    media_type      VARCHAR(10) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    rating          NUMERIC(2, 1) CHECK (rating >= 0 AND rating <= 5),
    popular         BOOLEAN NOT NULL DEFAULT FALSE,
    is_available    BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent upgrade path for databases created before media support existed
ALTER TABLE foods ADD COLUMN IF NOT EXISTS image_public_id VARCHAR(255);
ALTER TABLE foods ADD COLUMN IF NOT EXISTS media_type VARCHAR(10) NOT NULL DEFAULT 'image';
ALTER TABLE foods ADD COLUMN IF NOT EXISTS rating NUMERIC(2, 1);
ALTER TABLE foods ADD COLUMN IF NOT EXISTS popular BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_foods_vendor ON foods(vendor_id);
CREATE INDEX IF NOT EXISTS idx_foods_name ON foods USING gin (to_tsvector('english', name));

-- =========================================================
-- CART  (persisted server-side per customer)
-- =========================================================
CREATE TABLE IF NOT EXISTS cart_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    food_id         UUID NOT NULL REFERENCES foods(id) ON DELETE CASCADE,
    quantity        INTEGER NOT NULL DEFAULT 1 CHECK (quantity > 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (customer_id, food_id)
);

-- =========================================================
-- ORDERS
-- =========================================================
CREATE TABLE IF NOT EXISTS orders (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    customer_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    total           NUMERIC(10, 2) NOT NULL CHECK (total >= 0),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'preparing', 'ready', 'delivered', 'cancelled')),
    delivery_address VARCHAR(255),
    phone           VARCHAR(30),
    notes           TEXT,
    payment_method  VARCHAR(20) CHECK (payment_method IN ('card', 'transfer', 'cash')),
    payment_ref     VARCHAR(100),
    receipt_url     TEXT,
    receipt_public_id VARCHAR(255),
    paid_at         TIMESTAMPTZ,
    commission_rate NUMERIC(4, 3) NOT NULL DEFAULT 0.050,
    commission_amount NUMERIC(10, 2) NOT NULL DEFAULT 0,
    payout_amount   NUMERIC(10, 2) NOT NULL DEFAULT 0,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_method VARCHAR(20);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payment_ref VARCHAR(100);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_url TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS receipt_public_id VARCHAR(255);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_rate NUMERIC(4, 3) NOT NULL DEFAULT 0.050;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS commission_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS payout_amount NUMERIC(10, 2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_orders_customer ON orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_orders_vendor ON orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);

-- =========================================================
-- ORDER ITEMS
-- =========================================================
CREATE TABLE IF NOT EXISTS order_items (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id        UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    food_id         UUID NOT NULL REFERENCES foods(id) ON DELETE RESTRICT,
    food_name       VARCHAR(150) NOT NULL,
    quantity        INTEGER NOT NULL CHECK (quantity > 0),
    price           NUMERIC(10, 2) NOT NULL CHECK (price >= 0)
);

CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);

-- =========================================================
-- PASSWORD RESET TOKENS
-- =========================================================
CREATE TABLE IF NOT EXISTS password_reset_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    expires_at      TIMESTAMPTZ NOT NULL,
    used            BOOLEAN NOT NULL DEFAULT FALSE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_prt_user ON password_reset_tokens(user_id);

-- =========================================================
-- REFRESH TOKENS  (rotation + revocation support)
-- =========================================================
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash      VARCHAR(255) NOT NULL,
    revoked         BOOLEAN NOT NULL DEFAULT FALSE,
    expires_at      TIMESTAMPTZ NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rt_user ON refresh_tokens(user_id);

-- =========================================================
-- SETTLEMENTS  (vendor payout requests, reviewed by admin)
-- =========================================================
CREATE TABLE IF NOT EXISTS settlements (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    amount          NUMERIC(10, 2) NOT NULL CHECK (amount >= 0),
    payment_ref     VARCHAR(100) NOT NULL,
    receipt_url     TEXT NOT NULL,
    receipt_public_id VARCHAR(255),
    note            TEXT,
    status          VARCHAR(20) NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending', 'approved', 'rejected')),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    settled_at      TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_settlements_vendor ON settlements(vendor_id);
CREATE INDEX IF NOT EXISTS idx_settlements_status ON settlements(status);

-- =========================================================
-- ADS  (admin-managed ad slots: top / middle / bottom of pages)
-- =========================================================
CREATE TABLE IF NOT EXISTS ads (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title           VARCHAR(150) NOT NULL,
    media_url       TEXT NOT NULL,
    media_public_id VARCHAR(255),
    media_type      VARCHAR(10) NOT NULL DEFAULT 'image' CHECK (media_type IN ('image', 'video')),
    link_url        TEXT,
    placement       VARCHAR(10) NOT NULL CHECK (placement IN ('top', 'middle', 'bottom', 'hero', 'tile')),
    page            VARCHAR(50) NOT NULL DEFAULT 'all',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    display_order   INTEGER NOT NULL DEFAULT 0,
    starts_at       TIMESTAMPTZ,
    ends_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads(placement);
CREATE INDEX IF NOT EXISTS idx_ads_page ON ads(page);
CREATE INDEX IF NOT EXISTS idx_ads_active ON ads(is_active);

-- =========================================================
-- SETTINGS  (editable platform config, e.g. the OffPay
-- merchant-registration link, commission rate)
-- =========================================================
CREATE TABLE IF NOT EXISTS settings (
    key             VARCHAR(100) PRIMARY KEY,
    value           TEXT NOT NULL,
    is_public       BOOLEAN NOT NULL DEFAULT FALSE,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed defaults if they don't already exist (safe to re-run).
INSERT INTO settings (key, value, is_public)
VALUES
    ('offpay_registration_url', 'https://offpay-gamma.vercel.app/auth/register', TRUE),
    ('offpay_payment_note', 'Pay the amount shown to the LAUNCH TIME OffPay account, then enter your payment reference below.', TRUE),
    ('commission_rate', '0.05', FALSE),

    -- Tier 2 Pro subscription pricing (NGN)
    ('pro_price_monthly', '5000', TRUE),
    ('pro_price_quarterly', '13500', TRUE),
    ('pro_price_yearly', '50000', TRUE),

    -- Vendor self-service ad campaign pricing (NGN, fixed-duration)
    ('campaign_price_hero_1day', '5000', TRUE),
    ('campaign_price_hero_3day', '12000', TRUE),
    ('campaign_price_hero_7day', '25000', TRUE),
    ('campaign_price_hero_30day', '80000', TRUE),
    ('campaign_price_tile_1day', '3000', TRUE),
    ('campaign_price_tile_3day', '7500', TRUE),
    ('campaign_price_tile_7day', '15000', TRUE),
    ('campaign_price_tile_30day', '50000', TRUE),
    ('campaign_price_top_1day', '2000', TRUE),
    ('campaign_price_top_3day', '5000', TRUE),
    ('campaign_price_top_7day', '10000', TRUE),
    ('campaign_price_top_30day', '35000', TRUE),
    ('campaign_price_middle_1day', '1500', TRUE),
    ('campaign_price_middle_3day', '4000', TRUE),
    ('campaign_price_middle_7day', '8000', TRUE),
    ('campaign_price_middle_30day', '28000', TRUE),
    ('campaign_price_bottom_1day', '1000', TRUE),
    ('campaign_price_bottom_3day', '2500', TRUE),
    ('campaign_price_bottom_7day', '5000', TRUE),
    ('campaign_price_bottom_30day', '18000', TRUE),

    -- Ranking algorithm weights (must sum to 1.0) — admin-configurable
    ('ranking_weight_rating', '0.30', FALSE),
    ('ranking_weight_orders', '0.20', FALSE),
    ('ranking_weight_acceptance', '0.15', FALSE),
    ('ranking_weight_delivery', '0.15', FALSE),
    ('ranking_weight_distance', '0.10', FALSE),
    ('ranking_weight_activity', '0.10', FALSE),
    ('ranking_min_orders_for_rating', '5', FALSE),

    -- Enterprise tier — fully built, gated by this single flag per product decision
    ('enterprise_enabled', 'false', TRUE),
    ('enterprise_price_monthly', '0', TRUE),
    ('enterprise_price_yearly', '0', TRUE),
    ('enterprise_max_branches', '5', FALSE),
    ('enterprise_max_staff', '20', FALSE),
    ('enterprise_max_menu_items', '500', FALSE),
    ('enterprise_dedicated_manager', 'false', TRUE),
    ('enterprise_priority_support', 'false', TRUE),
    ('enterprise_custom_branding', 'false', TRUE),
    ('enterprise_api_access', 'false', TRUE),
    ('enterprise_pos_integration', 'false', TRUE)
ON CONFLICT (key) DO NOTHING;

-- =========================================================
-- SUBSCRIPTIONS  (Tier 2 Pro and Enterprise billing —
-- shared shape, distinguished by `plan`)
-- =========================================================
CREATE TABLE IF NOT EXISTS subscriptions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    plan            VARCHAR(20) NOT NULL CHECK (plan IN ('pro', 'enterprise')),
    billing_cycle   VARCHAR(20) NOT NULL DEFAULT 'monthly'
                    CHECK (billing_cycle IN ('monthly', 'quarterly', 'yearly')),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
                    CHECK (status IN ('pending_payment', 'active', 'cancelled', 'expired')),
    amount          NUMERIC(10, 2) NOT NULL,
    payment_ref     VARCHAR(100),
    auto_renew      BOOLEAN NOT NULL DEFAULT TRUE,
    current_period_start TIMESTAMPTZ,
    current_period_end   TIMESTAMPTZ,
    cancel_at_period_end  BOOLEAN NOT NULL DEFAULT FALSE,
    cancelled_at    TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_vendor ON subscriptions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_plan ON subscriptions(plan);

-- =========================================================
-- BILLING RECORDS  (payment ledger for subscriptions —
-- one row per billing period charged)
-- =========================================================
CREATE TABLE IF NOT EXISTS billing_records (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    amount          NUMERIC(10, 2) NOT NULL,
    billing_cycle   VARCHAR(20) NOT NULL,
    payment_ref     VARCHAR(100),
    status          VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'failed')),
    period_start    TIMESTAMPTZ,
    period_end      TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_billing_records_vendor ON billing_records(vendor_id);
CREATE INDEX IF NOT EXISTS idx_billing_records_subscription ON billing_records(subscription_id);

-- =========================================================
-- AD CAMPAIGNS  (vendor self-service advertising —
-- fixed-duration packages, available from Tier 1 up)
-- =========================================================
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id           UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    -- Matches ads.placement exactly, so activating a campaign is a 1:1 copy,
    -- not a lossy guess at which strip it becomes.
    campaign_type       VARCHAR(10) NOT NULL CHECK (campaign_type IN ('hero', 'tile', 'top', 'middle', 'bottom')),
    duration_days       INTEGER NOT NULL CHECK (duration_days IN (1, 3, 7, 30)),
    price               NUMERIC(10, 2) NOT NULL,
    payment_ref         VARCHAR(100),
    -- The vendor's proposed banner, uploaded at request time. Admin can still
    -- replace it with a different file at activation (see activateCampaign).
    media_url           TEXT,
    media_public_id     VARCHAR(255),
    media_type          VARCHAR(10) CHECK (media_type IN ('image', 'video')),
    status              VARCHAR(20) NOT NULL DEFAULT 'pending_payment'
                        CHECK (status IN ('pending_payment', 'active', 'expired', 'cancelled')),
    ad_id               UUID REFERENCES ads(id) ON DELETE SET NULL,
    starts_at           TIMESTAMPTZ,
    ends_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrating an existing install: widen campaign_type to the real placements and
-- add the banner columns. Safe to re-run.
ALTER TABLE ad_campaigns DROP CONSTRAINT IF EXISTS ad_campaigns_campaign_type_check;
ALTER TABLE ad_campaigns ALTER COLUMN campaign_type TYPE VARCHAR(10);
ALTER TABLE ad_campaigns ADD CONSTRAINT ad_campaigns_campaign_type_check
    CHECK (campaign_type IN ('hero', 'tile', 'top', 'middle', 'bottom'));
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS media_url TEXT;
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS media_public_id VARCHAR(255);
ALTER TABLE ad_campaigns ADD COLUMN IF NOT EXISTS media_type VARCHAR(10);
-- (ads.placement's hero/tile widening is already handled further down by the
-- existing dynamic-lookup migration block — not duplicated here.)

CREATE INDEX IF NOT EXISTS idx_ad_campaigns_vendor ON ad_campaigns(vendor_id);
CREATE INDEX IF NOT EXISTS idx_ad_campaigns_status ON ad_campaigns(status);

-- =========================================================
-- BRANCHES  (Enterprise — multi-branch management;
-- table exists regardless of whether Enterprise is enabled)
-- =========================================================
CREATE TABLE IF NOT EXISTS branches (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    name            VARCHAR(150) NOT NULL,
    address         VARCHAR(255),
    phone           VARCHAR(30),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_branches_vendor ON branches(vendor_id);

-- =========================================================
-- VENDOR STAFF  (Enterprise — staff accounts + RBAC.
-- Staff log in as normal `users` with role='staff'; this
-- table scopes them to a vendor/branch with a permission set.)
-- =========================================================
CREATE TABLE IF NOT EXISTS vendor_staff (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    vendor_id       UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    branch_id       UUID REFERENCES branches(id) ON DELETE SET NULL,
    staff_role      VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (staff_role IN ('manager', 'staff')),
    permissions     TEXT[] NOT NULL DEFAULT '{}',
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_vendor_staff_vendor ON vendor_staff(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vendor_staff_branch ON vendor_staff(branch_id);

-- =========================================================
-- Auto-update updated_at columns
-- =========================================================
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vendors_updated_at ON vendors;
CREATE TRIGGER trg_vendors_updated_at BEFORE UPDATE ON vendors
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_foods_updated_at ON foods;
CREATE TRIGGER trg_foods_updated_at BEFORE UPDATE ON foods
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_orders_updated_at ON orders;
CREATE TRIGGER trg_orders_updated_at BEFORE UPDATE ON orders
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_cart_updated_at ON cart_items;
CREATE TRIGGER trg_cart_updated_at BEFORE UPDATE ON cart_items
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_ads_updated_at ON ads;
CREATE TRIGGER trg_ads_updated_at BEFORE UPDATE ON ads
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_settings_updated_at ON settings;
CREATE TRIGGER trg_settings_updated_at BEFORE UPDATE ON settings
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER trg_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_branches_updated_at ON branches;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS trg_vendor_staff_updated_at ON vendor_staff;
CREATE TRIGGER trg_vendor_staff_updated_at BEFORE UPDATE ON vendor_staff
    FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ============================================================
-- Payment verification gate, settlement automation, ad tracking,
-- and Flutterwave card payments (added after vendor go-live).
-- ============================================================

-- Links an order to the settlement batch it was paid out under, once
-- eligible (delivered + payment verified + at least 1 day old) and
-- requested. NULL means "not yet included in any settlement".
ALTER TABLE orders ADD COLUMN IF NOT EXISTS settlement_id UUID REFERENCES settlements(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_orders_settlement ON orders(settlement_id);

-- Ad performance counters. Incremented by the public tracking endpoint;
-- there is no historical/time-series breakdown, just running totals.
ALTER TABLE ads ADD COLUMN IF NOT EXISTS impressions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE ads ADD COLUMN IF NOT EXISTS clicks INTEGER NOT NULL DEFAULT 0;

-- Login looks up email case-insensitively (LOWER(email) = LOWER($1)) since
-- a mismatched-case email would otherwise fail login with no useful error.
-- This index keeps that lookup fast instead of scanning the whole table.
CREATE INDEX IF NOT EXISTS idx_users_email_lower ON users(LOWER(email));

-- ---------------------------------------------------------------------
-- Opening hours, order pausing and delivery fees
--
-- opening_hours: JSON keyed mon..sun, each { "open": "08:00", "close": "21:00" }
--   or null for a closed day (Lagos time). NULL column = always open, so
--   existing vendors keep taking orders until they choose to set hours.
-- orders_paused: vendor's instant "stop taking orders" switch.
-- delivery_fee / free_delivery_above: flat fee, and an optional food subtotal
--   above which delivery is free. Set 0 / NULL for free delivery.
-- ---------------------------------------------------------------------
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS opening_hours JSONB;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS orders_paused BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS free_delivery_above NUMERIC(10, 2);

-- orders.total is what the customer pays (subtotal + delivery_fee).
-- Commission is taken on subtotal only; payout_amount includes the delivery
-- fee (the vendor delivers, so they keep it). subtotal is NULL on orders
-- placed before delivery fees existed - read it as COALESCE(subtotal, total).
ALTER TABLE orders ADD COLUMN IF NOT EXISTS subtotal NUMERIC(10, 2);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC(10, 2) NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- Customer reviews: one per delivered order. vendors.rating_avg /
-- rating_count are kept up to date by reviewModel.create so vendor listings
-- (which select v.*) carry them without extra queries.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reviews (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id    UUID NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
    customer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    vendor_id   UUID NOT NULL REFERENCES vendors(id) ON DELETE CASCADE,
    rating      SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment     TEXT,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reviews_vendor ON reviews(vendor_id, created_at DESC);

ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rating_avg NUMERIC(2, 1);
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS rating_count INTEGER NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------
-- Homepage ad space
--   hero: the large rotating banner on the home page (images, animated GIFs
--         or short videos)
--   tile: the small static promo squares beside it
-- The original CHECK only allowed top / middle / bottom, so it is replaced.
-- (Found by definition rather than by name, so it works whatever the
-- constraint was originally called.)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    c RECORD;
BEGIN
    FOR c IN
        SELECT conname FROM pg_constraint
        WHERE conrelid = 'ads'::regclass
          AND contype = 'c'
          AND pg_get_constraintdef(oid) ILIKE '%placement%'
    LOOP
        EXECUTE format('ALTER TABLE ads DROP CONSTRAINT %I', c.conname);
    END LOOP;

    ALTER TABLE ads ADD CONSTRAINT ads_placement_check
        CHECK (placement IN ('top', 'middle', 'bottom', 'hero', 'tile'));
END $$;

-- ---------------------------------------------------------------------
-- Site content (CMS): one row per editable section of the public website
-- (banner, tiles, footer, headings, ...). `content` holds only what an admin
-- has saved; anything not saved falls back to built-in defaults, and deleting
-- a row resets that section. See utils/contentSchema.js.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_content (
    section     VARCHAR(50) PRIMARY KEY,
    content     JSONB NOT NULL,
    updated_by  UUID REFERENCES users(id) ON DELETE SET NULL,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
