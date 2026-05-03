import { db } from "@/db/client";
import { mentions } from "@/db/schema";
import { desc } from "drizzle-orm";

export const dynamic = "force-dynamic";

export default async function MentionsPage() {
  const rows = await db
    .select()
    .from(mentions)
    .orderBy(desc(mentions.publishedAt))
    .limit(100);

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold">提及流 / Mentions</h1>
      <div className="space-y-3">
        {rows.length === 0 && (
          <p className="text-sm opacity-60">暂无数据</p>
        )}
        {rows.map((m) => (
          <article
            key={m.id}
            className="rounded border border-black/10 p-3 text-sm dark:border-white/10"
          >
            <header className="flex flex-wrap items-center gap-2 text-xs opacity-70">
              <span className="rounded bg-black/10 px-1.5 py-0.5 dark:bg-white/10">
                {m.source}
              </span>
              {m.rating != null && <span>{m.rating}★</span>}
              {m.sentiment && <span>· {m.sentiment}</span>}
              {m.authorName && <span>· {m.authorName}</span>}
              <span className="ml-auto">
                {m.publishedAt?.toLocaleString() ?? "—"}
              </span>
            </header>
            {m.title && <h3 className="mt-1 font-medium">{m.title}</h3>}
            {m.aiSummary && (
              <p className="mt-1 italic opacity-80">📝 {m.aiSummary}</p>
            )}
            {m.content && (
              <p className="mt-1 line-clamp-3 opacity-90">{m.content}</p>
            )}
            {m.url && (
              <a
                href={m.url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-block text-xs underline opacity-60"
              >
                Source ↗
              </a>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
