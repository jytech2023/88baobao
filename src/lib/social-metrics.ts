// Snapshot follower / engagement metrics for IG, TikTok, and FB.
//   IG, TikTok → Apify scraper actors (free tier OK)
//   FB         → Buffer post analytics (we already publish through Buffer)

const APIFY_BASE = "https://api.apify.com/v2/acts";

export type Snapshot = {
  platform: "instagram" | "tiktok" | "facebook";
  handle?: string;
  externalId?: string;
  profileUrl?: string;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  totalLikes?: number;
  totalViews?: number;
  avgEngagement?: number;
  raw: unknown;
};

export async function snapshotInstagram(username: string): Promise<Snapshot> {
  const token = process.env.APIFY_TOKEN!;
  const res = await fetch(
    `${APIFY_BASE}/apify~instagram-profile-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ usernames: [username], resultsLimit: 1 }),
    },
  );
  if (!res.ok) throw new Error(`IG profile scrape failed: ${res.status}`);
  const arr = (await res.json()) as Array<{
    id?: string;
    username?: string;
    url?: string;
    followersCount?: number;
    followsCount?: number;
    postsCount?: number;
    igtvVideoCount?: number;
  }>;
  const p = arr[0];
  if (!p) throw new Error("IG profile returned no data");
  return {
    platform: "instagram",
    handle: p.username ?? username,
    externalId: p.id,
    profileUrl: p.url ?? `https://www.instagram.com/${username}/`,
    followersCount: p.followersCount,
    followingCount: p.followsCount,
    postsCount: p.postsCount,
    raw: p,
  };
}

export async function snapshotTikTok(username: string): Promise<Snapshot> {
  const token = process.env.APIFY_TOKEN!;
  const res = await fetch(
    `${APIFY_BASE}/clockworks~free-tiktok-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        profiles: [username],
        resultsPerPage: 10,
        shouldDownloadVideos: false,
        shouldDownloadCovers: false,
      }),
    },
  );
  if (!res.ok) throw new Error(`TikTok scrape failed: ${res.status}`);
  const items = (await res.json()) as Array<{
    diggCount?: number; playCount?: number; commentCount?: number; shareCount?: number;
    authorMeta?: {
      id?: string;
      name?: string;
      fans?: number;
      following?: number;
      heart?: number;
      video?: number;
    };
  }>;
  const author = items[0]?.authorMeta;
  // Engagement = avg (likes+comments+shares) per post in the sample
  const sample = items.slice(0, 10);
  const eng = sample.length
    ? sample.reduce((s, i) => s + (i.diggCount ?? 0) + (i.commentCount ?? 0) + (i.shareCount ?? 0), 0) / sample.length
    : undefined;
  const totalViews = sample.reduce((s, i) => s + (i.playCount ?? 0), 0);
  return {
    platform: "tiktok",
    handle: author?.name ?? username,
    externalId: author?.id,
    profileUrl: `https://www.tiktok.com/@${author?.name ?? username}`,
    followersCount: author?.fans,
    followingCount: author?.following,
    postsCount: author?.video,
    totalLikes: author?.heart,
    totalViews,
    avgEngagement: eng,
    raw: { author, recentSampleSize: sample.length },
  };
}

// Facebook: use Buffer's analytics on the connected page channel.
// Falls back to a "no-data" snapshot if the analytics call fails.
export async function snapshotFacebook(): Promise<Snapshot> {
  const token = process.env.APIFY_TOKEN!;
  const pageId = "61570636683046";
  const profileUrl = `https://www.facebook.com/profile.php?id=${pageId}`;

  // Buffer's API doesn't expose follower count for FB pages, so we run
  // apify~facebook-pages-scraper instead — it returns followers / likes /
  // rating / category metadata in one call (~$0.07, ~30s).
  const res = await fetch(
    `${APIFY_BASE}/apify~facebook-pages-scraper/run-sync-get-dataset-items?token=${encodeURIComponent(token)}&timeout=120`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startUrls: [{ url: profileUrl }],
        onlyData: true,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`FB page scrape failed: ${res.status}`);
  }
  const arr = (await res.json()) as Array<{
    title?: string;
    pageId?: string;
    pageUrl?: string;
    facebookUrl?: string;
    followers?: number;
    likes?: number;
    rating?: string;
    ratingCount?: number;
    categories?: string[];
  }>;
  const p = arr[0];
  if (!p) throw new Error("FB scraper returned no data");

  return {
    platform: "facebook",
    handle: p.title ?? "page",
    externalId: p.pageId ?? pageId,
    profileUrl: p.pageUrl ?? p.facebookUrl ?? profileUrl,
    followersCount: p.followers,
    totalLikes: p.likes,
    raw: p,
  };
}
