import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mentions, watchKeywords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { news, search } from "@/lib/sources/serper";
import { classifyMention } from "@/lib/ai-classify";
import { createAlert } from "@/lib/alerts";
import { assertCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

const BRAND_NAMES = ["88 Bao Bao", "88baobao", "88宝宝"];

export async function GET(req: NextRequest) {
  try {
    assertCronAuth(req);
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const keywords = await db
    .select()
    .from(watchKeywords)
    .where(eq(watchKeywords.isActive, true));

  const summary: Array<Record<string, unknown>> = [];

  for (const kw of keywords) {
    try {
      // News (past week)
      const newsData = await news({ q: kw.keyword, tbs: "qdr:w" });
      let newsNew = 0;
      for (const n of newsData.news ?? []) {
        const cls = await classifyMention({
          source: "news",
          brandNames: BRAND_NAMES,
          text: `${n.title}\n${n.snippet}`,
        }).catch(() => null);

        const inserted = await db
          .insert(mentions)
          .values({
            source: "news",
            externalId: n.link,
            matchedKeywordId: kw.id,
            authorName: n.source,
            title: n.title,
            content: n.snippet,
            url: n.link,
            publishedAt: n.date ? new Date(n.date) : null,
            sentiment: cls?.sentiment,
            categories: cls?.categories,
            keywords: cls?.keywords,
            aiSummary: cls?.summary,
            isBrandMention: cls?.isBrandMention ?? false,
            language: cls?.language,
          })
          .onConflictDoNothing({
            target: [mentions.source, mentions.externalId],
          })
          .returning({ id: mentions.id });

        if (inserted.length > 0) {
          newsNew++;
          if (cls?.isCrisis) {
            await createAlert({
              type: "crisis_keyword",
              severity: "critical",
              title: `News crisis: ${n.title.slice(0, 120)}`,
              body: cls.summary,
              sourceMentionId: inserted[0].id,
              payload: { url: n.link, source: n.source },
            });
          }
        }
      }

      // Brand search (only for brand-purpose keywords)
      let searchNew = 0;
      if (kw.purpose === "brand") {
        const sd = await search({ q: kw.keyword, num: 10 });
        for (const r of sd.organic ?? []) {
          const cls = await classifyMention({
            source: "google",
            brandNames: BRAND_NAMES,
            text: `${r.title}\n${r.snippet}`,
          }).catch(() => null);

          const inserted = await db
            .insert(mentions)
            .values({
              source: "google",
              externalId: r.link,
              matchedKeywordId: kw.id,
              title: r.title,
              content: r.snippet,
              url: r.link,
              sentiment: cls?.sentiment,
              categories: cls?.categories,
              keywords: cls?.keywords,
              aiSummary: cls?.summary,
              isBrandMention: cls?.isBrandMention ?? false,
              language: cls?.language,
            })
            .onConflictDoNothing({
              target: [mentions.source, mentions.externalId],
            });
          if ((inserted as unknown as unknown[]).length !== undefined) searchNew++;
        }
      }

      summary.push({ keyword: kw.keyword, newsNew, searchNew });
    } catch (e) {
      summary.push({ keyword: kw.keyword, error: String(e) });
    }
  }

  return NextResponse.json({ ok: true, summary });
}
