import { neon } from "@neondatabase/serverless";
const sql = neon(process.env.DATABASE_URL);

async function exec(s) {
  // neon tagged template needs an Array-like with .raw (TemplateStringsArray).
  const arr = Object.assign([s], { raw: [s] });
  await sql(arr);
}

const stmts = [
  `DO $$ BEGIN CREATE TYPE store_status AS ENUM ('open','opening_soon','closed'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN CREATE TYPE review_source AS ENUM ('google','yelp','xiaohongshu','tripadvisor','other'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN CREATE TYPE review_sentiment AS ENUM ('positive','neutral','negative'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN CREATE TYPE alert_severity AS ENUM ('info','warning','critical'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `DO $$ BEGIN CREATE TYPE mention_source AS ENUM ('reddit','google_maps','yelp','tiktok','xiaohongshu','other'); EXCEPTION WHEN duplicate_object THEN null; END $$`,
  `CREATE TABLE IF NOT EXISTS stores (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug VARCHAR(80) UNIQUE NOT NULL,
    name_en VARCHAR(200) NOT NULL,
    name_zh VARCHAR(200),
    status store_status NOT NULL DEFAULT 'open',
    address_line1 TEXT, address_line2 TEXT,
    city VARCHAR(80), state VARCHAR(16), zip VARCHAR(16),
    country VARCHAR(8) NOT NULL DEFAULT 'US',
    lat NUMERIC(9,6), lng NUMERIC(9,6),
    phone VARCHAR(32), email VARCHAR(255),
    timezone VARCHAR(64) DEFAULT 'America/Los_Angeles',
    opening_hours JSONB, opening_date TIMESTAMPTZ,
    gmb_place_id VARCHAR(128), yelp_id VARCHAR(128),
    doordash_url TEXT, ubereats_url TEXT, grubhub_url TEXT,
    instagram_handle VARCHAR(64),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS reviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
    source review_source NOT NULL,
    external_id VARCHAR(200), author_name VARCHAR(200),
    rating INTEGER, content TEXT, url TEXT,
    sentiment review_sentiment, categories JSONB, keywords JSONB,
    ai_summary TEXT, suggested_reply TEXT,
    is_handled BOOLEAN NOT NULL DEFAULT FALSE,
    handled_by UUID, handled_at TIMESTAMPTZ,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE INDEX IF NOT EXISTS reviews_store_idx ON reviews(store_id)`,
  `CREATE INDEX IF NOT EXISTS reviews_sentiment_idx ON reviews(sentiment)`,
  `CREATE TABLE IF NOT EXISTS alerts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    type VARCHAR(64) NOT NULL,
    severity alert_severity NOT NULL DEFAULT 'info',
    title VARCHAR(300) NOT NULL, body TEXT,
    source_mention_id UUID, payload JSONB, delivered_channels JSONB,
    is_read BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
  `CREATE TABLE IF NOT EXISTS mentions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source mention_source NOT NULL,
    external_id VARCHAR(256),
    author_name VARCHAR(200), content TEXT, rating INTEGER, url TEXT,
    sentiment review_sentiment,
    is_brand_mention BOOLEAN NOT NULL DEFAULT FALSE,
    published_at TIMESTAMPTZ,
    fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  )`,
];

for (const s of stmts) await exec(s);

const counts = await sql`
  SELECT
    (SELECT COUNT(*) FROM stores)::int AS stores,
    (SELECT COUNT(*) FROM reviews)::int AS reviews,
    (SELECT COUNT(*) FROM alerts)::int AS alerts,
    (SELECT COUNT(*) FROM mentions)::int AS mentions
`;
console.log("✓ tables ready. counts:", counts[0]);
