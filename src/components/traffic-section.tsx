import { neon } from "@neondatabase/serverless";
import { getTranslations } from "next-intl/server";

const sql = neon(process.env.DATABASE_URL!);

export const PERIODS = ["day", "week", "month", "quarter", "year"] as const;
export type Period = (typeof PERIODS)[number];

const LOOKBACK_DAYS: Record<Period, number> = {
  day: 30,
  week: 7 * 12,
  month: 31 * 12,
  quarter: 92 * 8,
  year: 366 * 5,
};

type Row = {
  platform: string;
  account_handle: string;
  bucket: string;
  posts: number;
  likes: number | null;
  views: number | null;
  followers_delta: number | null;
  followers_end: number | null;
  reviews: number | null;
  avg_rating: string | null;
};

type Channel = {
  platform: string;
  handle: string;
  rows: Row[];
};

type View = "totals" | "detailed";

async function loadAnalytics(
  period: Period,
  view: View,
): Promise<{ channels: Channel[]; lastUpdated: string | null }> {
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS[period] * 86400000)
    .toISOString()
    .slice(0, 10);

  let rows: Row[] = [];
  let lastUpdated: string | null = null;
  try {
    rows = (await sql`
      WITH bucketed AS (
        SELECT
          platform,
          account_handle,
          date,
          date_trunc(${period}, date::timestamp)::date AS bucket,
          posts_published,
          total_likes,
          total_views,
          followers_count,
          followers_delta,
          reviews_count,
          avg_rating
        FROM social_daily_stats
        WHERE date >= ${cutoff}::date
      )
      SELECT
        platform,
        account_handle,
        bucket::text AS bucket,
        SUM(posts_published)::int AS posts,
        SUM(total_likes)::bigint AS likes,
        SUM(total_views)::bigint AS views,
        SUM(followers_delta)::int AS followers_delta,
        (
          array_agg(followers_count ORDER BY date DESC)
            FILTER (WHERE followers_count IS NOT NULL)
        )[1] AS followers_end,
        SUM(reviews_count)::int AS reviews,
        AVG(avg_rating)::numeric(3,2) AS avg_rating
      FROM bucketed
      GROUP BY platform, account_handle, bucket
      ORDER BY bucket DESC, platform, account_handle
    `) as unknown as Row[];

    const max = (await sql`
      SELECT MAX(computed_at) AS m FROM social_daily_stats
    `) as unknown as { m: string | null }[];
    lastUpdated = max[0]?.m ?? null;
  } catch (e) {
    console.error("traffic-section query failed:", e);
  }

  // Bucket the raw rows by handle, separating the rollup's "*" platform-only
  // rows (which lack follower counts) from per-handle rows.
  const perHandleMap = new Map<string, Channel>();
  const starRowsByPlatform = new Map<string, Row[]>();
  for (const r of rows) {
    if (r.account_handle === "*") {
      if (!starRowsByPlatform.has(r.platform)) starRowsByPlatform.set(r.platform, []);
      starRowsByPlatform.get(r.platform)!.push(r);
      continue;
    }
    const key = `${r.platform}|${r.account_handle}`;
    if (!perHandleMap.has(key)) {
      perHandleMap.set(key, { platform: r.platform, handle: r.account_handle, rows: [] });
    }
    perHandleMap.get(key)!.rows.push(r);
  }
  const perHandle = [...perHandleMap.values()];

  // Synthesize one cross-handle aggregate per platform from per-handle rows
  // (sums posts/likes/views/delta/followers per bucket).
  const aggMap = new Map<string, Channel>();
  for (const ch of perHandle) {
    let agg = aggMap.get(ch.platform);
    if (!agg) {
      agg = { platform: ch.platform, handle: "(all)", rows: [] };
      aggMap.set(ch.platform, agg);
    }
    for (const r of ch.rows) {
      let aggRow = agg.rows.find((x) => x.bucket === r.bucket);
      if (!aggRow) {
        aggRow = {
          platform: r.platform,
          account_handle: "(all)",
          bucket: r.bucket,
          posts: 0,
          likes: 0,
          views: 0,
          followers_delta: 0,
          followers_end: 0,
          reviews: 0,
          avg_rating: null,
        };
        agg.rows.push(aggRow);
      }
      aggRow.posts += r.posts ?? 0;
      aggRow.likes = (aggRow.likes ?? 0) + Number(r.likes ?? 0);
      aggRow.views = (aggRow.views ?? 0) + Number(r.views ?? 0);
      aggRow.followers_delta =
        (aggRow.followers_delta ?? 0) + (r.followers_delta ?? 0);
      aggRow.followers_end =
        (aggRow.followers_end ?? 0) + (r.followers_end ?? 0);
      aggRow.reviews = (aggRow.reviews ?? 0) + (r.reviews ?? 0);
    }
    agg.rows.sort((a, b) => b.bucket.localeCompare(a.bucket));
  }

  // For platforms that only have a "*" row (e.g. Facebook today) and no per-
  // handle breakdown, fall back to the "*" row so the platform still appears.
  for (const [platform, starRows] of starRowsByPlatform) {
    if (aggMap.has(platform)) continue;
    aggMap.set(platform, {
      platform,
      handle: "(all)",
      rows: starRows.map((r) => ({ ...r, account_handle: "(all)" })),
    });
  }

  const aggregates = [...aggMap.values()].sort((a, b) =>
    a.platform.localeCompare(b.platform),
  );

  const channels =
    view === "detailed"
      ? [
          ...aggregates,
          ...perHandle.sort(
            (a, b) =>
              a.platform.localeCompare(b.platform) ||
              a.handle.localeCompare(b.handle),
          ),
        ]
      : aggregates;
  return { channels, lastUpdated };
}

export async function TrafficSection({
  period,
  locale,
  view = "totals",
  basePath = "/dashboard",
}: {
  period: Period;
  locale: string;
  view?: View;
  basePath?: string;
}) {
  const t = await getTranslations("Analytics");
  const { channels, lastUpdated } = await loadAnalytics(period, view);

  return (
    <section className="space-y-4">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 className="text-lg font-semibold">{t("title")}</h2>
          <p className="text-xs text-black/60 dark:text-white/60">{t("subtitle")}</p>
        </div>
        <nav
          aria-label={t("periodSwitcher")}
          className="flex flex-wrap gap-1 self-start rounded-lg border border-black/10 p-1 dark:border-white/10"
        >
          {PERIODS.map((p) => (
            <a
              key={p}
              href={`/${locale}${basePath}?period=${p}`}
              aria-current={p === period ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm transition ${
                p === period
                  ? "bg-black text-white dark:bg-white dark:text-black"
                  : "hover:bg-black/5 dark:hover:bg-white/10"
              }`}
            >
              {t(`period.${p}`)}
            </a>
          ))}
        </nav>
      </header>

      {lastUpdated && (
        <p className="text-xs text-black/40 dark:text-white/40">
          {t("lastUpdated")}:{" "}
          {new Date(lastUpdated).toLocaleString(locale === "zh" ? "zh-CN" : "en-US")}
        </p>
      )}

      {channels.length === 0 ? (
        <div className="rounded-xl border border-dashed border-black/20 p-8 text-center dark:border-white/20">
          <p className="text-sm font-medium">{t("empty")}</p>
          <p className="mt-2 text-xs text-black/50 dark:text-white/50">{t("emptyHint")}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {channels.map((c) => (
            <ChannelTable
              key={`${c.platform}-${c.handle}`}
              period={period}
              channel={c}
              t={(k: string) => t(k)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

const PLATFORM_GLYPH: Record<string, string> = {
  instagram: "📷",
  tiktok: "🎵",
  facebook: "📘",
  google: "🗺️",
  yelp: "⭐",
  reddit: "📬",
};

function ChannelTable({
  channel,
  period,
  t,
}: {
  channel: Channel;
  period: Period;
  t: (key: string) => string;
}) {
  const { platform, handle, rows } = channel;
  const showFollowers = ["instagram", "tiktok", "facebook"].includes(platform);
  const showReviews = ["google", "yelp"].includes(platform);
  const showEngagement = ["instagram", "tiktok", "facebook"].includes(platform);

  return (
    <section className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
      <header className="flex items-center justify-between gap-3 border-b border-black/10 bg-black/2 px-4 py-3 dark:border-white/10 dark:bg-white/2">
        <div className="flex min-w-0 items-center gap-3">
          <span className="text-2xl leading-none" aria-hidden>
            {PLATFORM_GLYPH[platform] ?? "•"}
          </span>
          <div className="min-w-0">
            <div className="font-medium capitalize">{platform}</div>
            <div className="truncate font-mono text-xs text-black/50 dark:text-white/50">
              {handle === "(all)" ? t("aggregate") : `@${handle}`}
            </div>
          </div>
        </div>
        <div className="text-xs text-black/40 dark:text-white/40">
          {rows.length} {t("buckets")}
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase tracking-wider text-black/50 dark:text-white/50">
              <th className="px-3 py-2 text-left">{t("col.period")}</th>
              <th className="px-3 py-2 text-right">{t("col.posts")}</th>
              {showFollowers && <th className="px-3 py-2 text-right">{t("col.followers")}</th>}
              {showFollowers && <th className="px-3 py-2 text-right">{t("col.delta")}</th>}
              {showEngagement && <th className="px-3 py-2 text-right">{t("col.likes")}</th>}
              {showEngagement && <th className="px-3 py-2 text-right">{t("col.views")}</th>}
              {showReviews && <th className="px-3 py-2 text-right">{t("col.reviews")}</th>}
              {showReviews && <th className="px-3 py-2 text-right">{t("col.rating")}</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.followers_delta;
              return (
                <tr key={r.bucket} className="border-t border-black/5 dark:border-white/5">
                  <td className="px-3 py-2 font-mono text-xs">
                    {formatBucket(r.bucket, period)}
                  </td>
                  <td className="px-3 py-2 text-right font-mono">{r.posts ?? 0}</td>
                  {showFollowers && (
                    <td className="px-3 py-2 text-right font-mono">
                      {fmtNum(r.followers_end)}
                    </td>
                  )}
                  {showFollowers && (
                    <td
                      className={`px-3 py-2 text-right font-mono ${
                        delta == null
                          ? "text-black/40 dark:text-white/40"
                          : delta > 0
                            ? "text-emerald-600 dark:text-emerald-400"
                            : delta < 0
                              ? "text-red-600 dark:text-red-400"
                              : "text-black/50 dark:text-white/50"
                      }`}
                    >
                      {delta == null
                        ? "—"
                        : (delta > 0 ? "+" : "") + delta.toLocaleString()}
                    </td>
                  )}
                  {showEngagement && (
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(r.likes)}</td>
                  )}
                  {showEngagement && (
                    <td className="px-3 py-2 text-right font-mono">{fmtNum(r.views)}</td>
                  )}
                  {showReviews && (
                    <td className="px-3 py-2 text-right font-mono">{r.reviews ?? 0}</td>
                  )}
                  {showReviews && (
                    <td className="px-3 py-2 text-right font-mono">
                      {r.avg_rating ? `${Number(r.avg_rating).toFixed(2)}★` : "—"}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function fmtNum(n: number | string | null): string {
  if (n == null) return "—";
  const num = typeof n === "string" ? Number(n) : n;
  if (!Number.isFinite(num)) return "—";
  return num.toLocaleString();
}

function formatBucket(bucket: string, period: Period): string {
  const [yy, mm, dd] = bucket.split("-").map((s) => parseInt(s, 10));
  if (period === "day") return `${yy}-${pad(mm)}-${pad(dd)}`;
  if (period === "week") {
    const d = new Date(Date.UTC(yy, mm - 1, dd));
    const end = new Date(d.getTime() + 6 * 86400000);
    return `${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} → ${pad(end.getUTCMonth() + 1)}-${pad(end.getUTCDate())}`;
  }
  if (period === "month") return `${yy}-${pad(mm)}`;
  if (period === "quarter") {
    const q = Math.floor((mm - 1) / 3) + 1;
    return `${yy} Q${q}`;
  }
  if (period === "year") return `${yy}`;
  return bucket;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
