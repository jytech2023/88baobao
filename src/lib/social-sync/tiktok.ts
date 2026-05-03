import { env } from "./env";

export type TikTokPost = {
  id: string;
  url: string;
  timestamp: string;
  caption: string;
  coverUrl: string;
  videoUrl?: string;
};

type RawTikTokPost = {
  id: number | string;
  text?: string;
  createTimeISO: string;
  webVideoUrl: string;
  mediaUrls?: string[];
  videoMeta?: { coverUrl?: string };
};

export async function fetchLatestTikToks(): Promise<TikTokPost[]> {
  const username = env.tiktokUsername();
  if (!username) return [];

  const res = await fetch(
    `https://api.apify.com/v2/acts/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(env.apifyToken())}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [username],
        resultsPerPage: env.tiktokFetchLimit(),
        shouldDownloadVideos: true,
        shouldDownloadCovers: false,
        proxyConfiguration: { useApifyProxy: true },
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`TikTok scrape failed: ${res.status} ${await res.text()}`);
  }

  const raw = (await res.json()) as RawTikTokPost[];
  return raw
    .filter((p) => p.id && p.videoMeta?.coverUrl)
    .map((p) => ({
      id: String(p.id),
      url: p.webVideoUrl,
      timestamp: p.createTimeISO,
      caption: p.text ?? "",
      coverUrl: p.videoMeta!.coverUrl!,
      videoUrl: p.mediaUrls?.[0],
    }));
}
