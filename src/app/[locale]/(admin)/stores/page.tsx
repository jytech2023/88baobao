import { getTranslations } from "next-intl/server";
import { neon } from "@neondatabase/serverless";

export const dynamic = "force-dynamic";

const sql = neon(process.env.DATABASE_URL!);

type StoreRow = {
  id: string;
  slug: string;
  name_en: string;
  status: "open" | "opening_soon" | "closed";
  address_line1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  gmb_place_id: string | null;
  yelp_id: string | null;
  google_review_count: number;
  google_avg_rating: string | null;
  yelp_review_count: number;
  yelp_avg_rating: string | null;
  unhandled_negative: number;
  latest_review_at: string | Date | null;
};

async function loadStores(): Promise<StoreRow[]> {
  const rows = (await sql`
    SELECT
      s.id, s.slug, s.name_en, s.status,
      s.address_line1, s.city, s.state, s.zip, s.phone,
      s.gmb_place_id, s.yelp_id,
      COUNT(*) FILTER (WHERE r.source = 'google')::int AS google_review_count,
      AVG(r.rating) FILTER (WHERE r.source = 'google')::numeric(3,2) AS google_avg_rating,
      COUNT(*) FILTER (WHERE r.source = 'yelp')::int AS yelp_review_count,
      AVG(r.rating) FILTER (WHERE r.source = 'yelp')::numeric(3,2) AS yelp_avg_rating,
      COUNT(*) FILTER (WHERE r.sentiment = 'negative' AND r.is_handled = false)::int AS unhandled_negative,
      MAX(r.published_at) AS latest_review_at
    FROM stores s
    LEFT JOIN reviews r ON r.store_id = s.id
    GROUP BY s.id
    ORDER BY
      CASE s.status WHEN 'open' THEN 0 WHEN 'opening_soon' THEN 1 ELSE 2 END,
      s.name_en
  `) as StoreRow[];
  return rows;
}

export default async function StoresPage() {
  const t = await getTranslations("Stores");
  const stores = await loadStores();

  const totalGoogleReviews = stores.reduce((s, x) => s + (x.google_review_count ?? 0), 0);
  const totalYelpReviews = stores.reduce((s, x) => s + (x.yelp_review_count ?? 0), 0);
  const open = stores.filter((s) => s.status === "open").length;

  const overallGoogle = stores.reduce(
    (acc, s) => {
      const n = s.google_review_count ?? 0;
      const r = Number(s.google_avg_rating ?? 0);
      return n > 0 ? { sum: acc.sum + r * n, cnt: acc.cnt + n } : acc;
    },
    { sum: 0, cnt: 0 },
  );
  const avgGoogle = overallGoogle.cnt > 0 ? (overallGoogle.sum / overallGoogle.cnt).toFixed(2) : "—";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">{t("title")}</h1>
        <p className="mt-1 text-sm text-black/50 dark:text-white/50">{t("subtitle")}</p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label={t("totalStores")} value={stores.length} />
        <Stat label={t("openStores")} value={open} accent="emerald" />
        <Stat label={t("avgGoogleRating")} value={avgGoogle === "—" ? avgGoogle : `${avgGoogle}★`} />
        <Stat label={t("totalReviews")} value={totalGoogleReviews + totalYelpReviews} />
      </div>

      <section className="overflow-hidden rounded-xl border border-black/10 dark:border-white/10">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-black/10 text-left text-xs uppercase tracking-wider text-black/50 dark:border-white/10 dark:text-white/50">
                <th className="px-4 py-3 font-medium">{t("colStore")}</th>
                <th className="px-4 py-3 font-medium">{t("colCity")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colGoogle")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colYelp")}</th>
                <th className="px-4 py-3 text-right font-medium">{t("colNegative")}</th>
                <th className="px-4 py-3 font-medium">{t("colStatus")}</th>
                <th className="px-4 py-3 font-medium">{t("colLinks")}</th>
              </tr>
            </thead>
            <tbody>
              {stores.map((s) => (
                <tr key={s.id} className="border-b border-black/5 dark:border-white/5">
                  <td className="px-4 py-3">
                    <div className="font-medium">{s.name_en}</div>
                    <div className="font-mono text-xs text-black/40 dark:text-white/40">
                      {s.address_line1 ?? "—"}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-black/70 dark:text-white/70">{s.city ?? "—"}</td>
                  <td className="px-4 py-3 text-right">
                    {s.google_review_count > 0 ? (
                      <>
                        <div className="font-mono">{Number(s.google_avg_rating).toFixed(2)}★</div>
                        <div className="text-xs text-black/40 dark:text-white/40">
                          {s.google_review_count} {t("reviewsShort")}
                        </div>
                      </>
                    ) : (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.yelp_review_count > 0 ? (
                      <>
                        <div className="font-mono">{Number(s.yelp_avg_rating).toFixed(2)}★</div>
                        <div className="text-xs text-black/40 dark:text-white/40">
                          {s.yelp_review_count} {t("reviewsShort")}
                        </div>
                      </>
                    ) : (
                      <span className="text-black/30 dark:text-white/30">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {s.unhandled_negative > 0 ? (
                      <span className="rounded bg-red-500/15 px-2 py-0.5 text-xs text-red-600 dark:text-red-400">
                        {s.unhandled_negative}
                      </span>
                    ) : (
                      <span className="text-black/30 dark:text-white/30">0</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <StoreStatusBadge status={s.status} />
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2 text-xs">
                      {s.gmb_place_id ? (
                        <a
                          href={`https://www.google.com/maps/place/?q=place_id:${s.gmb_place_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Google
                        </a>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">Google</span>
                      )}
                      {s.yelp_id ? (
                        <a
                          href={`https://www.yelp.com/biz/${s.yelp_id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-emerald-600 hover:underline dark:text-emerald-400"
                        >
                          Yelp
                        </a>
                      ) : (
                        <span className="text-black/30 dark:text-white/30">Yelp</span>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {totalGoogleReviews + totalYelpReviews === 0 && (
        <p className="text-xs text-black/40 dark:text-white/40">{t("noReviewsYet")}</p>
      )}
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: number | string;
  accent?: "emerald";
}) {
  const cls = accent === "emerald" ? "text-emerald-600 dark:text-emerald-400" : "";
  return (
    <div className="rounded-xl border border-black/10 p-4 dark:border-white/10">
      <div className="text-xs uppercase tracking-wider text-black/50 dark:text-white/50">{label}</div>
      <div className={`mt-1 text-2xl font-semibold ${cls}`}>
        {typeof value === "number" ? value.toLocaleString() : value}
      </div>
    </div>
  );
}

function StoreStatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    open: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
    opening_soon: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
    closed: "bg-black/10 text-black/50 dark:bg-white/10 dark:text-white/50",
  };
  return (
    <span className={`inline-block rounded px-2 py-0.5 text-xs ${map[status] ?? map.closed}`}>
      {status}
    </span>
  );
}
