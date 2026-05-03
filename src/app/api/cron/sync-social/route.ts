import { NextResponse } from "next/server";
import { fetchLatestPosts, type IgPost } from "@/lib/social-sync/instagram";
import { fetchLatestTikToks, type TikTokPost } from "@/lib/social-sync/tiktok";
import { getSeenIds, getSeenFingerprints, recordPosted } from "@/lib/social-sync/store";
import { rehost } from "@/lib/social-sync/rehost";
import { rewriteCaption } from "@/lib/social-sync/caption";
import { createFacebookPost, fetchRecentBufferFingerprints } from "@/lib/social-sync/buffer";
import { fingerprint } from "@/lib/social-sync/fingerprint";
import { env } from "@/lib/social-sync/env";

export const runtime = "nodejs";
export const maxDuration = 300;

type Source = "ig" | "tiktok";

type NormalizedPost = {
  source: Source;
  sourceId: string;
  dedupeKey: string;     // "ig:DUW..." / "tiktok:7632..."
  fingerprint: string | null;
  shortRef: string;
  url: string;
  timestamp: string;
  caption: string;
  imageUrls: string[];
  videoUrl?: string;
};

type SyncResult = {
  fetched: { ig: number; tiktok: number };
  newPosts: number;
  posted: { source: Source; sourceId: string; bufferId: string; status: string }[];
  skipped: { source: Source; sourceId: string; reason: string }[];
};

export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  if (auth !== `Bearer ${env.cronSecret()}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const result = await runSync();
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    console.error("sync failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}

export async function runSync(): Promise<SyncResult> {
  const [igPosts, ttPosts, seenIds, seenFps, bufferFps] = await Promise.all([
    fetchLatestPosts().catch((e) => { console.error("IG fetch failed", e); return [] as IgPost[]; }),
    fetchLatestTikToks().catch((e) => { console.error("TikTok fetch failed", e); return [] as TikTokPost[]; }),
    getSeenIds(),
    getSeenFingerprints(),
    fetchRecentBufferFingerprints(25).catch((e) => {
      console.warn("Buffer recent-posts fetch failed; skipping that dedupe layer", e);
      return [] as string[];
    }),
  ]);

  const seenFingerprints = new Set([...seenFps, ...bufferFps]);

  const all: NormalizedPost[] = [
    ...igPosts.map(normalizeIg),
    ...ttPosts.map(normalizeTikTok),
  ];

  // Two-layer dedupe + intra-batch fingerprint dedupe (so IG+TikTok of the
  // same post in the SAME run don't both get posted).
  const seenInBatch = new Set<string>();
  const fresh: NormalizedPost[] = [];
  for (const p of all.sort((a, b) => a.timestamp.localeCompare(b.timestamp))) {
    if (seenIds.has(p.dedupeKey)) continue;
    if (p.fingerprint && (seenFingerprints.has(p.fingerprint) || seenInBatch.has(p.fingerprint))) continue;
    fresh.push(p);
    if (p.fingerprint) seenInBatch.add(p.fingerprint);
  }

  const result: SyncResult = {
    fetched: { ig: igPosts.length, tiktok: ttPosts.length },
    newPosts: fresh.length,
    posted: [],
    skipped: [],
  };

  for (const post of fresh) {
    try {
      const bufferRes = await processPost(post);
      result.posted.push({
        source: post.source,
        sourceId: post.sourceId,
        bufferId: bufferRes.id,
        status: bufferRes.status,
      });
      await recordPosted([post.dedupeKey], post.fingerprint ? [post.fingerprint] : []);
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err);
      console.error(`Failed to post ${post.dedupeKey}:`, reason);
      result.skipped.push({ source: post.source, sourceId: post.sourceId, reason });
    }
  }

  return result;
}

function normalizeIg(p: IgPost): NormalizedPost {
  const isVideo = p.type === "Video" && !!p.videoUrl;
  const images =
    p.childPosts.length > 0
      ? p.childPosts.filter((c) => c.type !== "Video").map((c) => c.displayUrl)
      : isVideo ? [] : [p.displayUrl];

  return {
    source: "ig",
    sourceId: p.id,
    dedupeKey: `ig:${p.id}`,
    fingerprint: fingerprint(p.caption),
    shortRef: p.shortCode,
    url: p.url,
    timestamp: p.timestamp,
    caption: p.caption,
    imageUrls: images,
    videoUrl: isVideo ? p.videoUrl : undefined,
  };
}

function normalizeTikTok(p: TikTokPost): NormalizedPost {
  return {
    source: "tiktok",
    sourceId: p.id,
    dedupeKey: `tiktok:${p.id}`,
    fingerprint: fingerprint(p.caption),
    shortRef: p.id,
    url: p.url,
    timestamp: p.timestamp,
    caption: p.caption,
    imageUrls: p.videoUrl ? [] : [p.coverUrl],
    videoUrl: p.videoUrl,
  };
}

async function processPost(post: NormalizedPost) {
  const text = await rewriteCaption(post.caption, post.timestamp);
  const keyBase = `${post.source}/${post.shortRef}`;

  if (post.videoUrl) {
    const videoUrl = await rehost(post.videoUrl, `${keyBase}/video`);
    return createFacebookPost({ text, videoUrl });
  }

  const imageUrls: string[] = [];
  for (let i = 0; i < post.imageUrls.length; i++) {
    imageUrls.push(await rehost(post.imageUrls[i], `${keyBase}/image-${i}`));
  }
  return createFacebookPost({ text, imageUrls });
}
