// Hardcoded project identifier for 88baobao.
//
// We previously stored a singleton `projects` row in Postgres and looked the
// id up at the top of every cron route. That table had nothing operationally
// useful in it — slug + name + a UUID — and accidentally got dropped during
// a `db:push` (drizzle's interactive prompt offered to "rename projects →
// audit_logs"; the rename was confirmed and that took the row with it).
//
// Hardcoding the id removes the foot-gun: no schema migration can drop it,
// every cron route has one fewer thing to fail on, and the value is stable
// across rebuilds. Existing rows in social_daily_stats / synced_posts /
// social_metrics_snapshots use the OLD project id and are effectively
// orphaned — that's fine, the dashboard only reads the most recent N
// buckets and we backfill from today's cron runs onward.

export const PROJECT_ID = "c0bb2adc-77b8-43d4-8a7e-be88ba0babb0";
export const PROJECT_SLUG = "88baobao";

// Connected social handles for metric snapshots.
// Hardcoded for the same reason PROJECT_ID is — used to live in a
// `social_sources` table that got rebuilt empty during db:push.
export const SOCIAL_HANDLES = {
  instagram: [
    "88baobao_official",
    "88_baobao_vv",
    "88baobao.manteca",
    "88baobao.stockton",
    "88baobao_castrovalley",
  ],
  tiktok: ["88baobao.official"],
} as const;
