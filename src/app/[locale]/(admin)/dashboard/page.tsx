import { getTranslations } from "next-intl/server";
import { neon } from "@neondatabase/serverless";
import { TaskList } from "@/components/task-list";
import { TrafficSection, PERIODS, type Period } from "@/components/traffic-section";

export const dynamic = "force-dynamic";

const sql = neon(process.env.DATABASE_URL!);

async function loadStats() {
  const safe = async <T,>(fn: () => Promise<T>, fb: T): Promise<T> => {
    try { return await fn(); } catch { return fb; }
  };

  const [
    postsThisWeek,
    postsLastWeek,
    sentimentRows,
    sentimentRowsLastWeek,
    openAlerts,
    cron24h,
    unhandledNeg,
    recentAlerts,
    recentPosts,
    recentReviews,
    recentRuns,
    failedRuns,
    igSnapshot,
    tiktokSnapshot,
    fbSnapshot,
    googleAgg,
    yelpAgg,
    storeCount,
    syncSources,
    syncCounts,
  ] = await Promise.all([
    safe(() => sql`SELECT COUNT(*)::int AS n FROM synced_posts WHERE posted_at > NOW() - INTERVAL '7 days'`, [{ n: 0 }] as { n: number }[]),
    safe(() => sql`
      SELECT COUNT(*)::int AS n FROM synced_posts
      WHERE posted_at > NOW() - INTERVAL '14 days' AND posted_at <= NOW() - INTERVAL '7 days'
    `, [{ n: 0 }] as { n: number }[]),
    safe(() => sql`
      SELECT sentiment, COUNT(*)::int AS n FROM (
        SELECT sentiment FROM mentions WHERE published_at > NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT sentiment FROM reviews WHERE published_at > NOW() - INTERVAL '7 days'
      ) x GROUP BY sentiment
    `, [] as { sentiment: string | null; n: number }[]),
    safe(() => sql`
      SELECT sentiment, COUNT(*)::int AS n FROM (
        SELECT sentiment FROM mentions
        WHERE published_at > NOW() - INTERVAL '14 days' AND published_at <= NOW() - INTERVAL '7 days'
        UNION ALL
        SELECT sentiment FROM reviews
        WHERE published_at > NOW() - INTERVAL '14 days' AND published_at <= NOW() - INTERVAL '7 days'
      ) x GROUP BY sentiment
    `, [] as { sentiment: string | null; n: number }[]),
    safe(() => sql`SELECT COUNT(*)::int AS n FROM alerts WHERE is_read = false`, [{ n: 0 }] as { n: number }[]),
    safe(() => sql`
      SELECT status, COUNT(*)::int AS n FROM sync_runs
      WHERE started_at > NOW() - INTERVAL '24 hours'
      GROUP BY status
    `, [] as { status: string | null; n: number }[]),
    safe(() => sql`SELECT COUNT(*)::int AS n FROM reviews WHERE sentiment = 'negative' AND is_handled = false`, [{ n: 0 }] as { n: number }[]),
    safe(() => sql`
      SELECT id, type, severity, title, created_at FROM alerts
      WHERE is_read = false
      ORDER BY CASE severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END, created_at DESC
      LIMIT 5
    `, [] as { id: string; type: string; severity: string; title: string; created_at: string }[]),
    safe(() => sql`
      SELECT id, source_platform, destination_caption, posted_at FROM synced_posts
      ORDER BY posted_at DESC LIMIT 50
    `, [] as { id: string; source_platform: string; destination_caption: string | null; posted_at: string }[]),
    safe(() => sql`
      SELECT id, source, rating, sentiment, content, published_at FROM reviews
      ORDER BY published_at DESC NULLS LAST LIMIT 50
    `, [] as { id: string; source: string; rating: number | null; sentiment: string | null; content: string | null; published_at: string | null }[]),
    safe(() => sql`
      SELECT id, status, posted_count, started_at FROM sync_runs
      ORDER BY started_at DESC LIMIT 50
    `, [] as { id: string; status: string | null; posted_count: number | null; started_at: string }[]),
    safe(() => sql`
      SELECT id, error_message, started_at FROM sync_runs
      WHERE status = 'failed' AND started_at > NOW() - INTERVAL '7 days'
      ORDER BY started_at DESC LIMIT 20
    `, [] as { id: string; error_message: string | null; started_at: string }[]),
    // For each platform, take the LATEST snapshot per (handle), then SUM across handles.
    // This way multiple sub-accounts of the same platform are aggregated.
    safe(() => sql`
      WITH latest AS (
        SELECT DISTINCT ON (handle) handle, followers_count, posts_count, fetched_at
        FROM social_metrics_snapshots
        WHERE platform = 'instagram'
        ORDER BY handle, fetched_at DESC
      )
      SELECT
        SUM(followers_count)::bigint AS followers_count,
        SUM(posts_count)::int AS posts_count,
        COUNT(*)::int AS account_count,
        MAX(fetched_at) AS fetched_at
      FROM latest
    `, [] as Array<{ followers_count: number | null; posts_count: number | null; account_count: number; fetched_at: Date | string | null }>),
    safe(() => sql`
      WITH latest AS (
        SELECT DISTINCT ON (handle) handle, followers_count, posts_count, total_likes, fetched_at
        FROM social_metrics_snapshots
        WHERE platform = 'tiktok'
        ORDER BY handle, fetched_at DESC
      )
      SELECT
        SUM(followers_count)::bigint AS followers_count,
        SUM(posts_count)::int AS posts_count,
        SUM(total_likes)::bigint AS total_likes,
        COUNT(*)::int AS account_count,
        MAX(fetched_at) AS fetched_at
      FROM latest
    `, [] as Array<{ followers_count: number | null; posts_count: number | null; total_likes: number | null; account_count: number; fetched_at: Date | string | null }>),
    safe(() => sql`
      WITH latest AS (
        SELECT DISTINCT ON (handle, external_id) handle, posts_count, fetched_at
        FROM social_metrics_snapshots
        WHERE platform = 'facebook'
        ORDER BY handle, external_id, fetched_at DESC
      )
      SELECT
        SUM(posts_count)::int AS posts_count,
        COUNT(*)::int AS account_count,
        MAX(fetched_at) AS fetched_at
      FROM latest
    `, [] as Array<{ posts_count: number | null; account_count: number; fetched_at: Date | string | null }>),
   safe(() => sql`
      SELECT
        COUNT(*)::int AS total_reviews,
        AVG(rating)::numeric(3,2) AS avg_rating,
        COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '30 days')::int AS recent_30d
      FROM reviews WHERE source = 'google'
    `, [{ total_reviews: 0, avg_rating: null, recent_30d: 0 }] as Array<{ total_reviews: number; avg_rating: string | null; recent_30d: number }>),
    safe(() => sql`
      SELECT
        COUNT(*)::int AS total_reviews,
        AVG(rating)::numeric(3,2) AS avg_rating,
        COUNT(*) FILTER (WHERE published_at > NOW() - INTERVAL '30 days')::int AS recent_30d
      FROM reviews WHERE source = 'yelp'
    `, [{ total_reviews: 0, avg_rating: null, recent_30d: 0 }] as Array<{ total_reviews: number; avg_rating: string | null; recent_30d: number }>),
    safe(() => sql`SELECT COUNT(*)::int AS n FROM stores WHERE status = 'open'`, [{ n: 0 }] as { n: number }[]),
    // Sync topology: list source/destination accounts + per-source sync counts
    safe(() => sql`
      SELECT s.platform, s.role, s.username, s.external_id, s.url
      FROM social_sources s
      JOIN projects p ON p.id = s.project_id
      WHERE p.slug = '88baobao'
      ORDER BY s.role, s.platform, s.username
    `, [] as Array<{ platform: string; role: string; username: string | null; external_id: string | null; url: string | null }>),
    safe(() => sql`
      SELECT source_platform, COUNT(*)::int AS n
      FROM synced_posts
      GROUP BY source_platform
    `, [] as Array<{ source_platform: string; n: number }>),
  ]);

  const sentiment = { positive: 0, negative: 0, neutral: 0 };
  for (const r of sentimentRows) {
    const k = (r.sentiment ?? "neutral") as keyof typeof sentiment;
    if (k in sentiment) sentiment[k] += r.n;
  }
  const sentimentLast = { positive: 0, negative: 0, neutral: 0 };
  for (const r of sentimentRowsLastWeek) {
    const k = (r.sentiment ?? "neutral") as keyof typeof sentimentLast;
    if (k in sentimentLast) sentimentLast[k] += r.n;
  }
  const cron = { success: 0, failed: 0, partial: 0, running: 0 };
  for (const r of cron24h) {
    const k = (r.status ?? "running") as keyof typeof cron;
    if (k in cron) cron[k] += r.n;
  }

  return {
    postsThisWeek: postsThisWeek[0]?.n ?? 0,
    postsLastWeek: postsLastWeek[0]?.n ?? 0,
    sentiment,
    sentimentLast,
    openAlerts: openAlerts[0]?.n ?? 0,
    cron,
    unhandledNeg: unhandledNeg[0]?.n ?? 0,
    recentAlerts,
    recentPosts,
    recentReviews,
    recentRuns,
    failedRuns,
    channels: {
      instagram: igSnapshot[0],
      tiktok: tiktokSnapshot[0],
      facebook: fbSnapshot[0],
      google: googleAgg[0],
      yelp: yelpAgg[0],
      storeCount: storeCount[0]?.n ?? 0,
    },
    syncTopology: {
      sources: syncSources.filter((s) => s.role === "source"),
      destinations: syncSources.filter((s) => s.role === "destination"),
      countsBySourcePlatform: Object.fromEntries(
        syncCounts.map((r) => [r.source_platform, r.n]),
      ) as Record<string, number>,
    },
  };
}

export default async function DashboardPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ period?: string }>;
}) {
  const { locale } = await params;
  const { period: rawPeriod } = await searchParams;
  const period: Period = PERIODS.includes(rawPeriod as Period)
    ? (rawPeriod as Period)
    : "day";
  const t = await getTranslations("Dashboard");
  const data = await loadStats();
  const sentimentNet = data.sentiment.positive - data.sentiment.negative;
  const sentimentNetLast = data.sentimentLast.positive - data.sentimentLast.negative;
  const cronOk = data.cron.success;
  const cronBad = data.cron.failed + data.cron.partial;
  const cronTotal = cronOk + cronBad + data.cron.running;
  const actionCount = data.unhandledNeg + data.failedRuns.length + data.recentAlerts.length;
  const events = mergeActivity(data);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">{t("title")}</h1>

      <TrafficSection period={period} locale={locale} />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label={t("postsThisWeek")}
          value={data.postsThisWeek}
          previous={data.postsLastWeek}
          previousLabel={t("lastWeek")}
        />
        <Stat
          label={t("mentionsNet")}
          value={`${sentimentNet >= 0 ? "+" : ""}${sentimentNet}`}
          sub={`${data.sentiment.positive} ${t("positive")} · ${data.sentiment.negative} ${t("negative")}`}
          accent={sentimentNet >= 0 ? "emerald" : "red"}
          previous={sentimentNetLast}
          previousLabel={t("lastWeek")}
          rawValue={sentimentNet}
        />
        <Stat
          label={t("openAlerts")}
          value={data.openAlerts}
          accent={data.openAlerts > 0 ? "amber" : undefined}
        />
        <Stat
          label={t("cronHealth")}
          value={cronTotal === 0 ? "—" : `${cronOk}/${cronTotal}`}
          sub={cronBad > 0 ? `${cronBad} ${t("failed")}` : t("allHealthy")}
          accent={cronBad > 0 ? "red" : "emerald"}
        />
      </div>

      <Card title={t("todos")}>
        <TaskList
          labels={{
            heading: t("todos"),
            empty: t("todosEmpty"),
            addPlaceholder: t("todosAddPlaceholder"),
            add: t("add"),
            markDone: t("markDone"),
            delete: t("delete"),
            showCompleted: t("showCompleted"),
            hideCompleted: t("hideCompleted"),
          }}
        />
      </Card>

      <Card title={t("actionItems")} aside={`${actionCount} ${t("pending")}`}>
        {actionCount === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">{t("allClear")}</p>
        ) : (
          <ul className="space-y-2">
            {data.unhandledNeg > 0 && (
              <ActionItem
                icon="⚠"
                tone="amber"
                text={t("negativeReviewsPending", { n: data.unhandledNeg })}
              />
            )}
            {data.failedRuns.map((r) => (
              <ActionItem
                key={r.id}
                icon="🔧"
                tone="red"
                text={`${t("cronFailedAt")} ${relativeTime(r.started_at)}`}
                sub={r.error_message?.slice(0, 100) ?? undefined}
              />
            ))}
            {data.recentAlerts.map((a) => (
              <ActionItem
                key={a.id}
                icon={a.severity === "critical" ? "🚨" : a.severity === "warning" ? "⚠" : "ℹ"}
                tone={a.severity === "critical" ? "red" : a.severity === "warning" ? "amber" : "slate"}
                text={a.title}
                sub={`${a.type} · ${relativeTime(a.created_at)}`}
              />
            ))}
          </ul>
        )}
      </Card>

      {/* Channels */}
      <Card title={t("channels")}>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <ChannelCard
            label="Instagram"
            href="https://www.instagram.com/88baobao_official/"
            external
            stats={[
              { k: t("followers"), v: data.channels.instagram?.followers_count ?? "—" },
              { k: t("posts"), v: data.channels.instagram?.posts_count ?? "—" },
            ]}
            accountCount={data.channels.instagram?.account_count ?? 0}
            accountLabel={t("accounts")}
            updated={data.channels.instagram?.fetched_at}
          />
          <ChannelCard
            label="TikTok"
            href="https://www.tiktok.com/@88baobao.official"
            external
            stats={[
              { k: t("followers"), v: data.channels.tiktok?.followers_count ?? "—" },
              { k: t("posts"), v: data.channels.tiktok?.posts_count ?? "—" },
              { k: t("totalLikes"), v: data.channels.tiktok?.total_likes ?? "—" },
            ]}
            accountCount={data.channels.tiktok?.account_count ?? 0}
            accountLabel={t("accounts")}
            updated={data.channels.tiktok?.fetched_at}
          />
          <ChannelCard
            label="Facebook"
            href="https://www.facebook.com/profile.php?id=61570636683046"
            external
            stats={[
              { k: t("postsThroughBuffer"), v: data.channels.facebook?.posts_count ?? "—" },
            ]}
            accountCount={data.channels.facebook?.account_count ?? 0}
            accountLabel={t("accounts")}
            updated={data.channels.facebook?.fetched_at}
            note={t("fbNote")}
          />
          <ChannelCard
            label="Google Maps"
            href={`/${locale}/stores`}
            stats={[
              { k: t("openStores"), v: data.channels.storeCount },
              { k: t("avgRating"), v: data.channels.google?.avg_rating ? `${Number(data.channels.google.avg_rating).toFixed(2)}★` : "—" },
              { k: t("reviews30d"), v: data.channels.google?.recent_30d ?? 0 },
            ]}
            note={t("clickForStores")}
          />
          <ChannelCard
            label="Yelp"
            href={`/${locale}/stores`}
            stats={[
              { k: t("totalReviews"), v: data.channels.yelp?.total_reviews ?? 0 },
              { k: t("avgRating"), v: data.channels.yelp?.avg_rating ? `${Number(data.channels.yelp.avg_rating).toFixed(2)}★` : "—" },
              { k: t("reviews30d"), v: data.channels.yelp?.recent_30d ?? 0 },
            ]}
            note={t("clickForStores")}
          />
        </div>
        <p className="mt-3 text-xs text-black/40 dark:text-white/40">{t("websiteTrafficTodo")}</p>
      </Card>

      {/* Sync topology */}
      <Card title={t("syncMap")}>
        <SyncMap
          sources={data.syncTopology.sources as unknown as SocialAccount[]}
          destinations={data.syncTopology.destinations as unknown as SocialAccount[]}
          counts={data.syncTopology.countsBySourcePlatform}
          countLabel={t("syncedTotal")}
        />
      </Card>

      <Card title={t("recentActivity")}>
        {events.length === 0 ? (
          <p className="text-sm text-black/50 dark:text-white/50">{t("noActivity")}</p>
        ) : (
          <ul className="space-y-3">
            {events.map((e) => (
              <li key={e.id} className="flex items-start gap-3">
                <span className="mt-0.5 text-xl leading-none">{e.icon}</span>
                <div className="min-w-0 flex-1">
                  <div className="text-sm">{e.text}</div>
                  {e.detail && (
                    <div className="truncate text-xs text-black/50 dark:text-white/50">
                      {e.detail}
                    </div>
                  )}
                </div>
                <span className="whitespace-nowrap text-xs text-black/40 dark:text-white/40">
                  {relativeTime(e.at)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}

function Stat({
  label,
  value,
  rawValue,
  sub,
  accent,
  previous,
  previousLabel,
}: {
  label: string;
  value: number | string;
  rawValue?: number; // numeric value used for delta when `value` is pre-formatted
  sub?: string;
  accent?: "emerald" | "amber" | "red";
  previous?: number;
  previousLabel?: string;
}) {
  const cls =
    accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" :
    accent === "amber" ? "text-amber-600 dark:text-amber-400" :
    accent === "red" ? "text-red-600 dark:text-red-400" :
    "";

  const numeric = typeof value === "number" ? value : rawValue;
  let delta: { sign: "+" | "−" | ""; abs: number; up: boolean } | null = null;
  if (typeof numeric === "number" && typeof previous === "number") {
    const d = numeric - previous;
    delta = { sign: d > 0 ? "+" : d < 0 ? "−" : "", abs: Math.abs(d), up: d > 0 };
  }

  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs uppercase tracking-wider text-black/50 dark:text-white/50">
        {label}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className={`text-2xl font-semibold ${cls}`}>
          {typeof value === "number" ? value.toLocaleString() : value}
        </span>
        {delta && (
          <span
            className={`text-xs font-medium ${
              delta.abs === 0
                ? "text-black/40 dark:text-white/40"
                : delta.up
                ? "text-emerald-600 dark:text-emerald-400"
                : "text-red-600 dark:text-red-400"
            }`}
            title={`${previousLabel}: ${previous}`}
          >
            {delta.abs === 0 ? "—" : `${delta.up ? "▲" : "▼"} ${delta.sign}${delta.abs}`}
          </span>
        )}
      </div>
      {sub && <div className="mt-1 truncate text-xs text-black/50 dark:text-white/50">{sub}</div>}
      {previous !== undefined && (
        <div className="mt-1 text-[10px] uppercase tracking-wider text-black/40 dark:text-white/40">
          {previousLabel}: {previous}
        </div>
      )}
    </div>
  );
}

function Card({
  title,
  aside,
  children,
}: {
  title: string;
  aside?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border border-black/10 p-6 dark:border-white/10">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{title}</h2>
        {aside && <span className="text-xs text-black/50 dark:text-white/50">{aside}</span>}
      </div>
      {children}
    </section>
  );
}

type SocialAccount = {
  platform: string;
  role: string;
  username: string | null;
  external_id: string | null;
  url: string | null;
};

const PLATFORM_GLYPH: Record<string, string> = {
  instagram: "📷",
  tiktok: "🎵",
  facebook: "📘",
  buffer: "📤",
  youtube: "▶️",
  xiaohongshu: "📕",
};

function SyncMap({
  sources,
  destinations,
  counts,
  countLabel,
}: {
  sources: SocialAccount[];
  destinations: SocialAccount[];
  counts: Record<string, number>;
  countLabel: string;
}) {
  // Render publishable destinations only (exclude buffer relay row)
  const dests = destinations.filter((d) => d.platform !== "buffer");
  if (sources.length === 0 || dests.length === 0) {
    return <p className="text-sm text-black/50 dark:text-white/50">No sync configured.</p>;
  }
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
      {/* sources column */}
      <ul className="space-y-2">
        {sources.map((s, i) => (
          <li key={`src-${i}`}>
            <AccountRow account={s} side="left" count={counts[platformDbName(s.platform)]} countLabel={countLabel} />
          </li>
        ))}
      </ul>

      {/* arrows column */}
      <div className="flex flex-col items-center justify-center text-2xl text-black/30 dark:text-white/30">
        <span aria-hidden>→</span>
      </div>

      {/* destinations column */}
      <ul className="space-y-2">
        {dests.map((d, i) => (
          <li key={`dst-${i}`}>
            <AccountRow account={d} side="right" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function platformDbName(p: string) {
  // Our synced_posts.source_platform uses 'instagram' / 'tiktok'
  return p;
}

function AccountRow({
  account,
  side,
  count,
  countLabel,
}: {
  account: SocialAccount;
  side: "left" | "right";
  count?: number;
  countLabel?: string;
}) {
  const glyph = PLATFORM_GLYPH[account.platform] ?? "•";
  const handle = account.username ?? account.external_id ?? account.platform;
  const align = side === "right" ? "flex-row-reverse text-right" : "";
  return (
    <a
      href={account.url ?? "#"}
      target={account.url ? "_blank" : undefined}
      rel={account.url ? "noopener noreferrer" : undefined}
      className={`flex items-center gap-3 rounded-lg border border-black/10 px-3 py-2 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30 ${align}`}
    >
      <span className="text-2xl leading-none" aria-hidden>{glyph}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium capitalize">{account.platform}</div>
        <div className="truncate font-mono text-xs text-black/50 dark:text-white/50">
          {handle}
        </div>
      </div>
      {typeof count === "number" && (
        <div className={`shrink-0 ${side === "right" ? "text-left" : "text-right"}`}>
          <div className="font-mono text-sm">{count}</div>
          <div className="text-[10px] uppercase tracking-wider text-black/40 dark:text-white/40">
            {countLabel}
          </div>
        </div>
      )}
    </a>
  );
}

function ChannelCard({
  label,
  href,
  external,
  stats,
  accountCount,
  accountLabel,
  updated,
  note,
}: {
  label: string;
  href: string;
  external?: boolean;
  stats: { k: string; v: number | string | null }[];
  accountCount?: number;
  accountLabel?: string;
  updated?: Date | string;
  note?: string;
}) {
  const linkProps = external ? { target: "_blank", rel: "noopener noreferrer" } : {};
  return (
    <a
      href={href}
      {...linkProps}
      className="block rounded-lg border border-black/10 p-4 transition hover:border-black/30 dark:border-white/10 dark:hover:border-white/30"
    >
      <div className="mb-3 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold">{label}</span>
        <span className="flex items-center gap-1.5 text-xs text-black/40 dark:text-white/40">
          {accountCount !== undefined && accountCount > 0 && (
            <span className="rounded bg-black/5 px-1.5 py-0.5 font-mono text-[10px] dark:bg-white/10">
              {accountCount} {accountLabel}
            </span>
          )}
          {external ? "↗" : "→"}
        </span>
      </div>
      <dl className="space-y-1.5">
        {stats.map((s) => (
          <div key={s.k} className="flex items-baseline justify-between gap-2">
            <dt className="text-xs text-black/50 dark:text-white/50">{s.k}</dt>
            <dd className="font-mono text-sm">
              {typeof s.v === "number" ? s.v.toLocaleString() : (s.v ?? "—")}
            </dd>
          </div>
        ))}
      </dl>
      {note && <p className="mt-3 text-xs text-black/40 dark:text-white/40">{note}</p>}
      {updated && (
        <p className="mt-2 text-[10px] uppercase tracking-wider text-black/40 dark:text-white/40">
          {relativeTime(updated)}
        </p>
      )}
    </a>
  );
}

function ActionItem({
  icon,
  tone,
  text,
  sub,
}: {
  icon: string;
  tone: "red" | "amber" | "slate";
  text: string;
  sub?: string;
}) {
  const dot =
    tone === "red" ? "bg-red-500/15 text-red-600 dark:text-red-400" :
    tone === "amber" ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" :
    "bg-black/5 text-black/70 dark:bg-white/10 dark:text-white/70";
  return (
    <li className="flex items-start gap-3 py-1">
      <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded text-xs ${dot}`}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-sm">{text}</div>
        {sub && <div className="text-xs text-black/50 dark:text-white/50">{sub}</div>}
      </div>
    </li>
  );
}

// Postgres timestamps come back as Date | string depending on driver, so
// `at` is typed broadly and converted via Date() everywhere.
type ActivityEvent = { id: string; icon: string; text: string; detail?: string; at: Date | string };

function mergeActivity(data: Awaited<ReturnType<typeof loadStats>>): ActivityEvent[] {
  const events: ActivityEvent[] = [];
  for (const p of data.recentPosts) {
    events.push({
      id: `post-${p.id}`,
      icon: "📤",
      text: `Synced ${p.source_platform} → FB`,
      detail: (p.destination_caption ?? "").slice(0, 100) || undefined,
      at: p.posted_at,
    });
  }
  for (const r of data.recentReviews) {
    const stars = r.rating ? "★".repeat(r.rating) + "☆".repeat(5 - r.rating) : "";
    const tone = r.sentiment === "positive" ? "🍴" : r.sentiment === "negative" ? "🔻" : "🍽";
    events.push({
      id: `review-${r.id}`,
      icon: tone,
      text: `New ${r.source} review ${stars}`,
      detail: (r.content ?? "").slice(0, 100) || undefined,
      at: r.published_at ?? new Date(),
    });
  }
  for (const run of data.recentRuns) {
    const ok = run.status === "success";
    events.push({
      id: `run-${run.id}`,
      icon: ok ? "🤖" : "⚠️",
      text: `cron ${run.status ?? "—"} (${run.posted_count ?? 0} posted)`,
      at: run.started_at,
    });
  }
  return events
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
    .slice(0, 100);
}

function relativeTime(at: Date | string): string {
  const diff = Date.now() - new Date(at).getTime();
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}
