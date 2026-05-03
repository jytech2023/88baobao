/**
 * Serper.dev — Google Search / Maps / News API.
 * Free 2500 queries, then $1 / 1000.
 * Docs: https://serper.dev/
 *
 * Replaces SerpAPI for our market intel — cheaper and covers more endpoints.
 * Trade-off: no Google Trends. We get news + maps + search instead.
 */

const BASE = "https://google.serper.dev";

function key() {
  const k = process.env.SERPER_API_KEY;
  if (!k) throw new Error("SERPER_API_KEY not set");
  return k;
}

async function serperPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: {
      "X-API-KEY": key(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Serper ${res.status}: ${await res.text()}`);
  return res.json();
}

export type SerperSearchResult = {
  title: string;
  link: string;
  snippet: string;
  date?: string;
  position: number;
};

export async function search(args: {
  q: string;
  gl?: string; // country, default "us"
  hl?: string; // language, default "en"
  num?: number;
}) {
  return serperPost<{
    organic?: SerperSearchResult[];
    news?: SerperSearchResult[];
  }>("/search", {
    q: args.q,
    gl: args.gl ?? "us",
    hl: args.hl ?? "en",
    num: args.num ?? 20,
  });
}

export type SerperNewsResult = {
  title: string;
  link: string;
  snippet: string;
  date: string;
  source: string;
  imageUrl?: string;
  position: number;
};

export async function news(args: {
  q: string;
  gl?: string;
  tbs?: string; // time filter, e.g. "qdr:w" = past week
}) {
  return serperPost<{ news?: SerperNewsResult[] }>("/news", {
    q: args.q,
    gl: args.gl ?? "us",
    tbs: args.tbs ?? "qdr:w",
  });
}

export type SerperPlaceResult = {
  position: number;
  title: string;
  address: string;
  latitude?: number;
  longitude?: number;
  rating?: number;
  ratingCount?: number;
  category?: string;
  phoneNumber?: string;
  website?: string;
  cid?: string;
  placeId?: string;
};

/**
 * Maps search — competitor discovery near a location.
 * Pass `ll` as `@<lat>,<lng>,<zoom>z` for precise centering.
 */
export async function maps(args: {
  q: string;
  ll?: string;
  gl?: string;
}) {
  return serperPost<{ places?: SerperPlaceResult[] }>("/maps", {
    q: args.q,
    ll: args.ll,
    gl: args.gl ?? "us",
  });
}
