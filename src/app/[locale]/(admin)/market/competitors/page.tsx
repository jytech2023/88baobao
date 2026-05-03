import { db } from "@/db/client";
import { competitors } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function CompetitorsPage() {
  const rows = await db
    .select()
    .from(competitors)
    .orderBy(desc(competitors.isSelf), desc(competitors.avgRating));

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">竞品列表 / Competitors</h1>
      <p className="mb-4 text-xs opacity-60">
        TODO: 新建/编辑表单 (name, type, gmb_place_id, yelp_id, ...)
      </p>
      <div className="overflow-hidden rounded border border-black/10 dark:border-white/10">
        <table className="w-full text-sm">
          <thead className="bg-black/5 dark:bg-white/5">
            <tr className="text-left">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Type</th>
              <th className="px-3 py-2">GMB</th>
              <th className="px-3 py-2">Yelp</th>
              <th className="px-3 py-2">⭐</th>
              <th className="px-3 py-2">Reviews</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center opacity-60">
                  No competitors yet — seed via /api/seed-competitors
                </td>
              </tr>
            )}
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-black/10 dark:border-white/10">
                <td className="px-3 py-2">
                  {c.isSelf && "⭐ "}
                  {c.name}
                </td>
                <td className="px-3 py-2">{c.type}</td>
                <td className="px-3 py-2 font-mono text-xs">
                  {c.gmbPlaceId ? "✓" : "—"}
                </td>
                <td className="px-3 py-2 font-mono text-xs">
                  {c.yelpId ? "✓" : "—"}
                </td>
                <td className="px-3 py-2">{c.avgRating ?? "—"}</td>
                <td className="px-3 py-2">{c.reviewCount ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
