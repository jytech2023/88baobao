import {
  pgTable,
  text,
  varchar,
  integer,
  bigint,
  boolean,
  timestamp,
  jsonb,
  numeric,
  uuid,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

// ----------------------------------------------------------------------
// Enums
// ----------------------------------------------------------------------
export const storeStatusEnum = pgEnum("store_status", [
  "open",
  "opening_soon",
  "closed",
]);

export const reviewSourceEnum = pgEnum("review_source", [
  "google",
  "yelp",
  "xiaohongshu",
  "tripadvisor",
  "other",
]);

export const reviewSentimentEnum = pgEnum("review_sentiment", [
  "positive",
  "neutral",
  "negative",
]);

export const orderPlatformEnum = pgEnum("order_platform", [
  "doordash",
  "ubereats",
  "grubhub",
  "in_store",
  "website",
  "other",
]);

export const couponStatusEnum = pgEnum("coupon_status", [
  "active",
  "redeemed",
  "expired",
  "void",
]);

export const campaignChannelEnum = pgEnum("campaign_channel", [
  "sms",
  "email",
]);

export const campaignStatusEnum = pgEnum("campaign_status", [
  "draft",
  "scheduled",
  "sending",
  "sent",
  "failed",
]);

// ----------------------------------------------------------------------
// Auth / Admin users
// ----------------------------------------------------------------------
export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  name: varchar("name", { length: 100 }),
  passwordHash: text("password_hash"),
  role: varchar("role", { length: 32 }).notNull().default("admin"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------
// 1. Stores
// ----------------------------------------------------------------------
export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: varchar("slug", { length: 80 }).notNull().unique(),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameZh: varchar("name_zh", { length: 200 }),
    status: storeStatusEnum("status").notNull().default("open"),
    addressLine1: text("address_line1"),
    addressLine2: text("address_line2"),
    city: varchar("city", { length: 80 }),
    state: varchar("state", { length: 16 }),
    zip: varchar("zip", { length: 16 }),
    country: varchar("country", { length: 8 }).notNull().default("US"),
    lat: numeric("lat", { precision: 9, scale: 6 }),
    lng: numeric("lng", { precision: 9, scale: 6 }),
    phone: varchar("phone", { length: 32 }),
    email: varchar("email", { length: 255 }),
    timezone: varchar("timezone", { length: 64 }).default("America/Los_Angeles"),
    openingHours: jsonb("opening_hours"), // { mon: [{open,close}], ... }
    openingDate: timestamp("opening_date", { withTimezone: true }),
    // External IDs / links
    gmbPlaceId: varchar("gmb_place_id", { length: 128 }),
    yelpId: varchar("yelp_id", { length: 128 }),
    doordashUrl: text("doordash_url"),
    ubereatsUrl: text("ubereats_url"),
    grubhubUrl: text("grubhub_url"),
    instagramHandle: varchar("instagram_handle", { length: 64 }),
    // Meta
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("stores_status_idx").on(t.status)],
);

// ----------------------------------------------------------------------
// 2. Menu
// ----------------------------------------------------------------------
export const menuCategories = pgTable("menu_categories", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 80 }).notNull().unique(),
  nameEn: varchar("name_en", { length: 120 }).notNull(),
  nameZh: varchar("name_zh", { length: 120 }),
  sortOrder: integer("sort_order").notNull().default(0),
  isActive: boolean("is_active").notNull().default(true),
});

export const menuItems = pgTable(
  "menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    categoryId: uuid("category_id").references(() => menuCategories.id, {
      onDelete: "set null",
    }),
    sku: varchar("sku", { length: 64 }).unique(),
    nameEn: varchar("name_en", { length: 200 }).notNull(),
    nameZh: varchar("name_zh", { length: 200 }),
    descriptionEn: text("description_en"),
    descriptionZh: text("description_zh"),
    basePrice: numeric("base_price", { precision: 10, scale: 2 }).notNull(),
    imageUrl: text("image_url"),
    cloudinaryId: varchar("cloudinary_id", { length: 200 }),
    spicyLevel: integer("spicy_level").default(0),
    allergens: jsonb("allergens"), // string[]
    tags: jsonb("tags"), // string[]
    isActive: boolean("is_active").notNull().default(true),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("menu_items_category_idx").on(t.categoryId)],
);

// per-store overrides (price / availability / hidden)
export const storeMenuItems = pgTable(
  "store_menu_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    menuItemId: uuid("menu_item_id").notNull().references(() => menuItems.id, { onDelete: "cascade" }),
    priceOverride: numeric("price_override", { precision: 10, scale: 2 }),
    isAvailable: boolean("is_available").notNull().default(true),
    note: text("note"),
  },
  (t) => [
    uniqueIndex("store_menu_unique").on(t.storeId, t.menuItemId),
  ],
);

// ----------------------------------------------------------------------
// 3. Members / CRM
// ----------------------------------------------------------------------
export const members = pgTable(
  "members",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    phone: varchar("phone", { length: 32 }).unique(),
    email: varchar("email", { length: 255 }),
    firstName: varchar("first_name", { length: 80 }),
    lastName: varchar("last_name", { length: 80 }),
    birthday: timestamp("birthday", { withTimezone: false }),
    locale: varchar("locale", { length: 8 }).default("en"),
    homeStoreId: uuid("home_store_id").references(() => stores.id, { onDelete: "set null" }),
    points: integer("points").notNull().default(0),
    totalSpend: numeric("total_spend", { precision: 12, scale: 2 }).notNull().default("0"),
    visitsCount: integer("visits_count").notNull().default(0),
    lastVisitAt: timestamp("last_visit_at", { withTimezone: true }),
    tags: jsonb("tags"), // string[]
    smsOptIn: boolean("sms_opt_in").notNull().default(true),
    emailOptIn: boolean("email_opt_in").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("members_phone_idx").on(t.phone)],
);

export const memberVisits = pgTable("member_visits", {
  id: uuid("id").primaryKey().defaultRandom(),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
  amount: numeric("amount", { precision: 10, scale: 2 }),
  pointsEarned: integer("points_earned").default(0),
  source: varchar("source", { length: 32 }).default("manual"),
  visitedAt: timestamp("visited_at", { withTimezone: true }).notNull().defaultNow(),
});

export const coupons = pgTable("coupons", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: varchar("code", { length: 32 }).notNull().unique(),
  nameEn: varchar("name_en", { length: 120 }).notNull(),
  nameZh: varchar("name_zh", { length: 120 }),
  discountType: varchar("discount_type", { length: 16 }).notNull(), // "percent" | "fixed" | "freebie"
  discountValue: numeric("discount_value", { precision: 10, scale: 2 }),
  minSpend: numeric("min_spend", { precision: 10, scale: 2 }),
  startsAt: timestamp("starts_at", { withTimezone: true }),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponGrants = pgTable("coupon_grants", {
  id: uuid("id").primaryKey().defaultRandom(),
  couponId: uuid("coupon_id").notNull().references(() => coupons.id, { onDelete: "cascade" }),
  memberId: uuid("member_id").notNull().references(() => members.id, { onDelete: "cascade" }),
  status: couponStatusEnum("status").notNull().default("active"),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }),
  redeemedStoreId: uuid("redeemed_store_id").references(() => stores.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
});

export const campaigns = pgTable("campaigns", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 200 }).notNull(),
  channel: campaignChannelEnum("channel").notNull(),
  status: campaignStatusEnum("status").notNull().default("draft"),
  segment: jsonb("segment"), // filter rules
  subject: varchar("subject", { length: 200 }),
  body: text("body").notNull(),
  scheduledAt: timestamp("scheduled_at", { withTimezone: true }),
  sentAt: timestamp("sent_at", { withTimezone: true }),
  recipientCount: integer("recipient_count").default(0),
  createdBy: uuid("created_by").references(() => users.id),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------
// 4. Reviews
// ----------------------------------------------------------------------
export const reviews = pgTable(
  "reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    source: reviewSourceEnum("source").notNull(),
    externalId: varchar("external_id", { length: 200 }),
    authorName: varchar("author_name", { length: 200 }),
    rating: integer("rating"), // 1..5
    content: text("content"),
    url: text("url"),
    sentiment: reviewSentimentEnum("sentiment"),
    categories: jsonb("categories"), // string[] e.g. ["service","food","wait"]
    keywords: jsonb("keywords"),
    aiSummary: text("ai_summary"),
    suggestedReply: text("suggested_reply"),
    isHandled: boolean("is_handled").notNull().default(false),
    handledBy: uuid("handled_by").references(() => users.id),
    handledAt: timestamp("handled_at", { withTimezone: true }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("reviews_source_external_idx").on(t.source, t.externalId),
    index("reviews_store_idx").on(t.storeId),
    index("reviews_sentiment_idx").on(t.sentiment),
  ],
);

// ----------------------------------------------------------------------
// 5. Orders (CSV-imported daily aggregates + line items)
// ----------------------------------------------------------------------
export const orderImports = pgTable("order_imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
  platform: orderPlatformEnum("platform").notNull(),
  fileName: text("file_name"),
  periodStart: timestamp("period_start", { withTimezone: true }),
  periodEnd: timestamp("period_end", { withTimezone: true }),
  totalOrders: integer("total_orders").default(0),
  totalRevenue: numeric("total_revenue", { precision: 12, scale: 2 }).default("0"),
  rawSummary: jsonb("raw_summary"),
  importedBy: uuid("imported_by").references(() => users.id),
  importedAt: timestamp("imported_at", { withTimezone: true }).notNull().defaultNow(),
});

export const dailySales = pgTable(
  "daily_sales",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id").notNull().references(() => stores.id, { onDelete: "cascade" }),
    platform: orderPlatformEnum("platform").notNull(),
    date: timestamp("date", { withTimezone: false }).notNull(),
    orders: integer("orders").notNull().default(0),
    revenue: numeric("revenue", { precision: 12, scale: 2 }).notNull().default("0"),
    avgTicket: numeric("avg_ticket", { precision: 10, scale: 2 }),
    importId: uuid("import_id").references(() => orderImports.id, { onDelete: "set null" }),
  },
  (t) => [
    uniqueIndex("daily_sales_unique").on(t.storeId, t.platform, t.date),
    index("daily_sales_date_idx").on(t.date),
  ],
);

// ----------------------------------------------------------------------
// 7. Market Monitoring (competitors / mentions / trends / alerts)
// ----------------------------------------------------------------------
export const competitorTypeEnum = pgEnum("competitor_type", [
  "self",
  "direct",        // same category (dim sum / xlb)
  "indirect",      // adjacent (boba, ramen, fast casual)
  "category_lead", // benchmark (DTF, Tim Ho Wan)
]);

export const mentionSourceEnum = pgEnum("mention_source", [
  "google",
  "yelp",
  "reddit",
  "tiktok",
  "instagram",
  "xiaohongshu",
  "google_trends",
  "news",
  "other",
]);

export const alertSeverityEnum = pgEnum("alert_severity", [
  "info",
  "warning",
  "critical",
]);

export const alertChannelEnum = pgEnum("alert_channel", [
  "feishu",
  "slack",
  "email",
  "webhook",
]);

export const competitors = pgTable(
  "competitors",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 200 }).notNull(),
    type: competitorTypeEnum("type").notNull().default("direct"),
    isSelf: boolean("is_self").notNull().default(false),
    cuisine: varchar("cuisine", { length: 80 }),
    notes: text("notes"),
    // External IDs
    gmbPlaceId: varchar("gmb_place_id", { length: 128 }),
    yelpId: varchar("yelp_id", { length: 128 }),
    instagramHandle: varchar("instagram_handle", { length: 64 }),
    tiktokHandle: varchar("tiktok_handle", { length: 64 }),
    websiteUrl: text("website_url"),
    // Snapshot fields (denormalized for fast dashboard)
    avgRating: numeric("avg_rating", { precision: 3, scale: 2 }),
    reviewCount: integer("review_count").default(0),
    lastSnapshotAt: timestamp("last_snapshot_at", { withTimezone: true }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("competitors_type_idx").on(t.type),
    index("competitors_is_self_idx").on(t.isSelf),
  ],
);

// Watch keywords (for品类趋势 + 品牌口碑)
export const watchKeywords = pgTable("watch_keywords", {
  id: uuid("id").primaryKey().defaultRandom(),
  keyword: varchar("keyword", { length: 200 }).notNull().unique(),
  purpose: varchar("purpose", { length: 32 }).notNull(), // "brand" | "category" | "crisis"
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Generic mention stream — anything fetched from any source
export const mentions = pgTable(
  "mentions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: mentionSourceEnum("source").notNull(),
    externalId: varchar("external_id", { length: 256 }),
    competitorId: uuid("competitor_id").references(() => competitors.id, {
      onDelete: "set null",
    }),
    storeId: uuid("store_id").references(() => stores.id, { onDelete: "set null" }),
    matchedKeywordId: uuid("matched_keyword_id").references(() => watchKeywords.id, {
      onDelete: "set null",
    }),
    authorName: varchar("author_name", { length: 200 }),
    authorHandle: varchar("author_handle", { length: 200 }),
    authorFollowers: integer("author_followers"),
    title: text("title"),
    content: text("content"),
    rating: integer("rating"), // 1..5 if applicable
    url: text("url"),
    imageUrls: jsonb("image_urls"), // string[]
    likeCount: integer("like_count"),
    commentCount: integer("comment_count"),
    // AI enrichment
    sentiment: reviewSentimentEnum("sentiment"),
    categories: jsonb("categories"), // string[]
    keywords: jsonb("keywords"),
    aiSummary: text("ai_summary"),
    isBrandMention: boolean("is_brand_mention").notNull().default(false),
    language: varchar("language", { length: 8 }),
    publishedAt: timestamp("published_at", { withTimezone: true }),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("mentions_source_external_idx").on(t.source, t.externalId),
    index("mentions_competitor_idx").on(t.competitorId),
    index("mentions_published_idx").on(t.publishedAt),
    index("mentions_sentiment_idx").on(t.sentiment),
  ],
);

// Time-series snapshot — for trends / Google Trends / rating over time
export const trendSnapshots = pgTable(
  "trend_snapshots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    source: mentionSourceEnum("source").notNull(),
    metric: varchar("metric", { length: 64 }).notNull(), // "rating" | "review_count" | "trend_score" | "follower_count"
    competitorId: uuid("competitor_id").references(() => competitors.id, {
      onDelete: "cascade",
    }),
    keywordId: uuid("keyword_id").references(() => watchKeywords.id, {
      onDelete: "cascade",
    }),
    value: numeric("value", { precision: 14, scale: 4 }).notNull(),
    capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("trend_snapshots_metric_idx").on(t.metric),
    index("trend_snapshots_captured_idx").on(t.capturedAt),
  ],
);

// Influencers / KOL radar (for E)
export const influencers = pgTable("influencers", {
  id: uuid("id").primaryKey().defaultRandom(),
  handle: varchar("handle", { length: 200 }).notNull(),
  platform: mentionSourceEnum("platform").notNull(),
  displayName: varchar("display_name", { length: 200 }),
  followers: integer("followers"),
  engagementRate: numeric("engagement_rate", { precision: 5, scale: 2 }),
  bio: text("bio"),
  region: varchar("region", { length: 64 }),
  tags: jsonb("tags"),
  contactStatus: varchar("contact_status", { length: 32 }).default("new"), // new | contacted | collab | blacklist
  notes: text("notes"),
  lastMentionedAt: timestamp("last_mentioned_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Site candidates (for D — selection scoring)
export const siteCandidates = pgTable("site_candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  label: varchar("label", { length: 200 }).notNull(),
  city: varchar("city", { length: 80 }),
  state: varchar("state", { length: 16 }),
  zip: varchar("zip", { length: 16 }),
  lat: numeric("lat", { precision: 9, scale: 6 }),
  lng: numeric("lng", { precision: 9, scale: 6 }),
  // scoring inputs (snapshotted from Google Places nearby search)
  populationDensity: integer("population_density"),
  competitorsWithin1mi: integer("competitors_within_1mi"),
  competitorsWithin3mi: integer("competitors_within_3mi"),
  avgCompetitorRating: numeric("avg_competitor_rating", { precision: 3, scale: 2 }),
  trafficScore: integer("traffic_score"),
  rentEstimate: numeric("rent_estimate", { precision: 10, scale: 2 }),
  // computed
  score: numeric("score", { precision: 5, scale: 2 }),
  status: varchar("status", { length: 32 }).default("evaluating"), // evaluating | approved | rejected | opened
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: varchar("type", { length: 64 }).notNull(), // "negative_review" | "crisis_keyword" | "competitor_promo" | "rating_drop"
    severity: alertSeverityEnum("severity").notNull().default("info"),
    title: varchar("title", { length: 300 }).notNull(),
    body: text("body"),
    sourceMentionId: uuid("source_mention_id").references(() => mentions.id, {
      onDelete: "set null",
    }),
    payload: jsonb("payload"),
    deliveredChannels: jsonb("delivered_channels"), // string[]
    isRead: boolean("is_read").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("alerts_type_idx").on(t.type),
    index("alerts_severity_idx").on(t.severity),
    index("alerts_created_idx").on(t.createdAt),
  ],
);

// ----------------------------------------------------------------------
// 8. Audit log
// ----------------------------------------------------------------------
export const auditLogs = pgTable("audit_logs", {
  id: bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity(),
  userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
  action: varchar("action", { length: 64 }).notNull(),
  entity: varchar("entity", { length: 64 }).notNull(),
  entityId: varchar("entity_id", { length: 64 }),
  diff: jsonb("diff"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// ----------------------------------------------------------------------
// Relations (lightweight; expand as needed)
// ----------------------------------------------------------------------
export const storesRelations = relations(stores, ({ many }) => ({
  storeMenuItems: many(storeMenuItems),
  reviews: many(reviews),
  dailySales: many(dailySales),
}));

export const menuItemsRelations = relations(menuItems, ({ one, many }) => ({
  category: one(menuCategories, {
    fields: [menuItems.categoryId],
    references: [menuCategories.id],
  }),
  storeOverrides: many(storeMenuItems),
}));

export const membersRelations = relations(members, ({ one, many }) => ({
  homeStore: one(stores, {
    fields: [members.homeStoreId],
    references: [stores.id],
  }),
  visits: many(memberVisits),
  couponGrants: many(couponGrants),
}));
