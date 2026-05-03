import { db } from "@/db/client";
import { alerts } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function AlertsPage() {
  const rows = await db
    .select()
    .from(alerts)
    .orderBy(desc(alerts.createdAt))
    .limit(100);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">告警 / Alerts</h1>
      <ul className="space-y-2">
        {rows.length === 0 && <li className="text-sm opacity-60">暂无</li>}
        {rows.map((a) => (
          <li
            key={a.id}
            className="rounded border border-black/10 p-3 text-sm dark:border-white/10"
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
              <span className="ml-auto text-xs opacity-60">
                {a.createdAt.toLocaleString()}
              </span>
            </div>
            {a.body && <p className="mt-1 text-xs opacity-80">{a.body}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}
