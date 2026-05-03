/**
 * Reddit API — free with OAuth (script app).
 * Used for品类趋势 + 品牌口碑 (B/C).
 *
 * Subreddits to watch: bayarea, sacramento, bayareaeats, askSF, foodporn, AsianEats
 */

const TOKEN_URL = "https://www.reddit.com/api/v1/access_token";
const BASE = "https://oauth.reddit.com";

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) {
    return cachedToken.token;
  }
  const id = process.env.REDDIT_CLIENT_ID;
  const secret = process.env.REDDIT_CLIENT_SECRET;
  const ua = process.env.REDDIT_USER_AGENT ?? "88baobao/0.1";
  if (!id || !secret) throw new Error("Reddit credentials not set");

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "User-Agent": ua,
    },
    body: "grant_type=client_credentials",
  });
  if (!res.ok) throw new Error(`Reddit auth ${res.status}`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return cachedToken.token;
}

export type RedditPost = {
  externalId: string;
  title: string;
  content: string;
  author: string;
  subreddit: string;
  url: string;
  permalink: string;
  score: number;
  numComments: number;
  publishedAt: Date;
};

export async function searchPosts(args: {
  query: string;
  subreddit?: string;
  limit?: number;
  sort?: "new" | "relevance" | "hot";
}): Promise<RedditPost[]> {
  const token = await getToken();
  const params = new URLSearchParams({
    q: args.query,
    limit: String(args.limit ?? 25),
    sort: args.sort ?? "new",
    restrict_sr: args.subreddit ? "true" : "false",
  });
  const path = args.subreddit
    ? `/r/${args.subreddit}/search?${params}`
    : `/search?${params}`;

  const res = await fetch(`${BASE}${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": process.env.REDDIT_USER_AGENT ?? "88baobao/0.1",
    },
  });
  if (!res.ok) throw new Error(`Reddit search ${res.status}`);
  const data = (await res.json()) as {
    data: { children: Array<{ data: Record<string, unknown> }> };
  };
  return data.data.children.map((c) => {
    const d = c.data;
    return {
      externalId: d.id as string,
      title: (d.title as string) ?? "",
      content: (d.selftext as string) ?? "",
      author: (d.author as string) ?? "",
      subreddit: (d.subreddit as string) ?? "",
      url: (d.url as string) ?? "",
      permalink: `https://reddit.com${d.permalink as string}`,
      score: (d.score as number) ?? 0,
      numComments: (d.num_comments as number) ?? 0,
      publishedAt: new Date(((d.created_utc as number) ?? 0) * 1000),
    };
  });
}
