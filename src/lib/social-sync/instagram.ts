import { env } from "./env";

export type IgPost = {
  id: string;
  shortCode: string;
  url: string;
  type: "Image" | "Video" | "Sidecar";
  timestamp: string;
  caption: string;
  displayUrl: string;
  videoUrl?: string;
  childPosts: { displayUrl: string; videoUrl?: string; type: string }[];
};

type RawPost = {
  id: string;
  shortCode: string;
  url: string;
  type: string;
  timestamp: string;
  caption?: string | null;
  displayUrl: string;
  videoUrl?: string | null;
  childPosts?: { displayUrl: string; videoUrl?: string | null; type: string }[];
};

export async function fetchLatestPosts(): Promise<IgPost[]> {
  const username = env.igUsername();
  if (!username) return [];
  const token = env.apifyToken();
  const limit = env.igFetchLimit();

  const res = await fetch(
    `https://api.apify.com/v2/acts/apify~instagram-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        directUrls: [`https://www.instagram.com/${username}/`],
        resultsType: "posts",
        resultsLimit: limit,
        addParentData: false,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Apify scrape failed: ${res.status} ${await res.text()}`);
  }

  const raw = (await res.json()) as RawPost[];
  return raw
    .filter((p) => p.id && p.displayUrl)
    .map((p) => ({
      id: p.id,
      shortCode: p.shortCode,
      url: p.url,
      type: (p.type as IgPost["type"]) ?? "Image",
      timestamp: p.timestamp,
      caption: p.caption ?? "",
      displayUrl: p.displayUrl,
      videoUrl: p.videoUrl ?? undefined,
      childPosts: (p.childPosts ?? []).map((c) => ({
        displayUrl: c.displayUrl,
        videoUrl: c.videoUrl ?? undefined,
        type: c.type,
      })),
    }));
}
