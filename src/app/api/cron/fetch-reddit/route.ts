import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db/client";
import { mentions, watchKeywords } from "@/db/schema";
import { eq } from "drizzle-orm";
import { searchPosts } from "@/lib/sources/reddit";
import { classifyMention } from "@/lib/ai-classify";
import { createAlert } from "@/lib/alerts";
import { assertCronAuth } from "@/lib/cron-auth";

export const maxDuration = 300;

const BRAND_NAMES = ["88 Bao Bao", "88baobao", "88宝宝"];
const SUBREDDITS = ["bayarea", "sacramento", "AsianEats", "FoodPorn"];

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
    for (const sr of SUBREDDITS) {
      try {
        const posts = await searchPosts({
          query: kw.keyword,
          subreddit: sr,
          limit: 25,
          sort: "new",
        });

        for (const p of posts) {
          const text = `${p.title}\n\n${p.content}`;
          const cls = await classifyMention({
            source: "reddit",
            brandNames: BRAND_NAMES,
            text,
          }).catch(() => null);

          const inserted = await db
            .insert(mentions)
            .values({
              source: "reddit",
              externalId: p.externalId,
              matchedKeywordId: kw.id,
              authorName: p.author,
              authorHandle: p.author,
              title: p.title,
              content: p.content,
              url: p.permalink,
              likeCount: p.score,
              commentCount: p.numComments,
              publishedAt: p.publishedAt,
              sentiment: cls?.sentiment,
              categories: cls?.categories,
              keywords: cls?.keywords,
              aiSummary: cls?.summary,
              language: cls?.language,
              isBrandMention: cls?.isBrandMention ?? false,
            })
            .onConflictDoNothing({
              target: [mentions.source, mentions.externalId],
            })
            .returning({ id: mentions.id });

          if (inserted.length > 0 && cls?.isCrisis) {
            await createAlert({
              type: "crisis_keyword",
              severity: "critical",
              title: `Reddit /r/${sr}: ${p.title.slice(0, 120)}`,
              body: cls.summary,
              sourceMentionId: inserted[0].id,
              payload: { url: p.permalink },
            });
          }
        }

        summary.push({ keyword: kw.keyword, subreddit: sr, fetched: posts.length });
      } catch (e) {
        summary.push({ keyword: kw.keyword, subreddit: sr, error: String(e) });
      }
    }
  }

  return NextResponse.json({ ok: true, summary });
}
