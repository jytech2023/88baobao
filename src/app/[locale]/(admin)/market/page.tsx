import Link from "next/link";
import { db } from "@/db/client";
import { mentions, alerts, competitors } from "@/db/schema";
import { desc, eq, sql } from "drizzle-orm";
import { getTranslations } from "next-intl/server";

export const dynamic = "force-dynamic";

export default async function MarketPage() {
  const t = await getTranslations("Nav");

  const [recent, latestAlerts, comps, sentimentRows] = await Promise.all([
    db.select().from(mentions).orderBy(desc(mentions.fetchedAt)).limit(20),
    db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(10),
    db.select().from(competitors).orderBy(desc(competitors.avgRating)).limit(15),
    db
      .select({
        sentiment: mentions.sentiment,
        count: sql<number>`count(*)::int`,
      })
      .from(mentions)
      .groupBy(mentions.sentiment),
  ]);

  const sentimentMap = Object.fromEntries(
    sentimentRows.map((r) => [r.sentiment ?? "unknown", r.count]),
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">{t("market")}</h1>
        <div className="flex gap-2">
          <Link
            href="market/competitors"
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/15"
          >
            竞品 / Competitors
          </Link>
          <Link
            href="market/mentions"
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/15"
          >
            提及流 / Mentions
          </Link>
          <Link
            href="market/alerts"
            className="rounded border border-black/15 px-3 py-1 text-sm dark:border-white/15"
          >
            告警 / Alerts
          </Link>
        </div>
      </div>

      {/* sentiment cards */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card label="Positive" value={sentimentMap.positive ?? 0} tone="ok" />
        <Card label="Neutral" value={sentimentMap.neutral ?? 0} tone="muted" />
        <Card label="Negative" value={sentimentMap.negative ?? 0} tone="bad" />
        <Card label="Tracked competitors" value={comps.length} tone="muted" />
      </div>

      {/* recent mentions */}
      <section>
        <h2 className="mb-2 text-sm font-semibold opacity-70">Recent mentions</h2>
        <div className="overflow-hidden rounded border border-black/10 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr className="text-left">
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Author</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Sentiment</th>
                <th className="px-3 py-2">Summary</th>
                <th className="px-3 py-2">When</th>
              </tr>
            </thead>
            <tbody>
              {recent.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center opacity-60">
                    No data yet — run cron jobs or seed competitors.
                  </td>
                </tr>
              )}
              {recent.map((m) => (
                <tr key={m.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">{m.source}</td>
                  <td className="px-3 py-2">{m.authorName ?? "—"}</td>
                  <td className="px-3 py-2">{m.rating ?? "—"}</td>
                  <td className="px-3 py-2">
                    <SentimentBadge value={m.sentiment} />
                  </td>
                  <td className="px-3 py-2">
                    {m.aiSummary ?? m.content?.slice(0, 120) ?? "—"}
                  </td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    {m.publishedAt?.toLocaleDateString() ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* alerts */}
      <section>
        <h2 className="mb-2 text-sm font-semibold opacity-70">Latest alerts</h2>
        <ul className="space-y-2">
          {latestAlerts.length === 0 && (
            <li className="text-xs opacity-60">No alerts.</li>
          )}
          {latestAlerts.map((a) => (
            <li
              key={a.id}
              className="rounded border border-black/10 p-3 text-xs dark:border-white/10"
            >
              <div className="flex items-center gap-2">
                <span
                  className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${
                    a.severity === "critical"
                      ? "bg-red-600 text-white"
                      : a.severity === "warning"
                        ? "bg-amber-500 text-white"
                        : "bg-black/20"
                  }`}
                >
                  {a.severity}
                </span>
                <span className="font-medium">{a.title}</span>
                <span className="ml-auto opacity-60">
                  {a.createdAt.toLocaleString()}
                </span>
              </div>
              {a.body && <p className="mt-1 opacity-70">{a.body}</p>}
            </li>
          ))}
        </ul>
      </section>

      {/* competitor leaderboard */}
      <section>
        <h2 className="mb-2 text-sm font-semibold opacity-70">Competitor leaderboard</h2>
        <div className="overflow-hidden rounded border border-black/10 dark:border-white/10">
          <table className="w-full text-xs">
            <thead className="bg-black/5 dark:bg-white/5">
              <tr className="text-left">
                <th className="px-3 py-2">Name</th>
                <th className="px-3 py-2">Type</th>
                <th className="px-3 py-2">Rating</th>
                <th className="px-3 py-2">Reviews</th>
                <th className="px-3 py-2">Last sync</th>
              </tr>
            </thead>
            <tbody>
              {comps.map((c) => (
                <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                  <td className="px-3 py-2">
                    {c.isSelf && "⭐ "}
                    {c.name}
                  </td>
                  <td className="px-3 py-2">{c.type}</td>
                  <td className="px-3 py-2">{c.avgRating ?? "—"}</td>
                  <td className="px-3 py-2">{c.reviewCount ?? "—"}</td>
                  <td className="px-3 py-2">
                    {c.lastSnapshotAt?.toLocaleDateString() ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function Card({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "ok" | "bad" | "muted";
}) {
  const color =
    tone === "ok"
      ? "text-green-600 dark:text-green-400"
      : tone === "bad"
        ? "text-red-600 dark:text-red-400"
        : "opacity-80";
  return (
    <div className="rounded border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs opacity-60">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${color}`}>{value}</div>
    </div>
  );
}

function SentimentBadge({ value }: { value: string | null }) {
  if (!value) return <span className="opacity-50">—</span>;
  const cls =
    value === "positive"
      ? "bg-green-600/20 text-green-700 dark:text-green-300"
      : value === "negative"
        ? "bg-red-600/20 text-red-700 dark:text-red-300"
        : "bg-black/10 dark:bg-white/10";
  return <span className={`rounded px-1.5 py-0.5 ${cls}`}>{value}</span>;
}
