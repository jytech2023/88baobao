// Inventory of every post on our owned social channels.
// Each fetcher (IG / TikTok / FB) calls upsertSocialPost() on every post it
// sees. Dashboard queries this table directly for "posts this week" type
// stats — no joining or computing.

import { neon } from "@neondatabase/serverless";
import { PROJECT_ID } from "@/lib/project";

const sql = neon(process.env.DATABASE_URL!);

export type SocialPostInput = {
  platform: "instagram" | "tiktok" | "facebook";
  accountHandle?: string | null;
  externalId: string;
  shortCode?: string | null;
  url?: string | null;
  type?: string | null;
  caption?: string | null;
  coverUrl?: string | null;
  mediaUrls?: string[] | null;
  likesCount?: number | null;
  commentsCount?: number | null;
  sharesCount?: number | null;
  viewsCount?: number | null;
  savesCount?: number | null;
  raw?: unknown;
  postedAt?: string | Date | null;
};

async function projectId(): Promise<string> {
  return PROJECT_ID;
}

/**
 * Upsert a single post (idempotent on platform + external_id).
 * Engagement counts are refreshed on every call so periodic re-fetches keep
 * them current.
 */
export async function upsertSocialPost(input: SocialPostInput): Promise<void> {
  const pid = await projectId();
  const postedAt = input.postedAt ? new Date(input.postedAt) : null;
  await sql`
    INSERT INTO social_posts (
      project_id, platform, account_handle, external_id, short_code, url, type,
      caption, cover_url, media_urls,
      likes_count, comments_count, shares_count, views_count, saves_count,
      raw, posted_at, fetched_at
    ) VALUES (
      ${pid}, ${input.platform}, ${input.accountHandle ?? null}, ${input.externalId},
      ${input.shortCode ?? null}, ${input.url ?? null}, ${input.type ?? null},
      ${input.caption ?? null}, ${input.coverUrl ?? null},
      ${input.mediaUrls ? JSON.stringify(input.mediaUrls) : null},
      ${input.likesCount ?? null}, ${input.commentsCount ?? null},
      ${input.sharesCount ?? null}, ${input.viewsCount ?? null}, ${input.savesCount ?? null},
      ${input.raw ? JSON.stringify(input.raw) : null},
      ${postedAt}, NOW()
    )
    ON CONFLICT (platform, external_id) DO UPDATE SET
      account_handle  = COALESCE(EXCLUDED.account_handle, social_posts.account_handle),
      short_code      = COALESCE(EXCLUDED.short_code,     social_posts.short_code),
      url             = COALESCE(EXCLUDED.url,            social_posts.url),
      type            = COALESCE(EXCLUDED.type,           social_posts.type),
      caption         = COALESCE(EXCLUDED.caption,        social_posts.caption),
      cover_url       = COALESCE(EXCLUDED.cover_url,      social_posts.cover_url),
      media_urls      = COALESCE(EXCLUDED.media_urls,     social_posts.media_urls),
      likes_count     = COALESCE(EXCLUDED.likes_count,    social_posts.likes_count),
      comments_count  = COALESCE(EXCLUDED.comments_count, social_posts.comments_count),
      shares_count    = COALESCE(EXCLUDED.shares_count,   social_posts.shares_count),
      views_count     = COALESCE(EXCLUDED.views_count,    social_posts.views_count),
      saves_count     = COALESCE(EXCLUDED.saves_count,    social_posts.saves_count),
      raw             = EXCLUDED.raw,
      posted_at       = COALESCE(EXCLUDED.posted_at,      social_posts.posted_at),
      fetched_at      = NOW()
  `;
}

export async function upsertSocialPosts(inputs: SocialPostInput[]): Promise<number> {
  let n = 0;
  for (const input of inputs) {
    await upsertSocialPost(input);
    n++;
  }
  return n;
}
