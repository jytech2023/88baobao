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

/**
 * Look up a Yelp business listing via Google search and read the rating /
 * review-count fields that come back attached to the SERP rich result.
 *
 * Avoids Yelp Fusion API entirely (now ~$229/mo for new applicants) and
 * dodges Cloudflare-protected direct-fetch on yelp.com (server IPs get 403'd).
 */
export async function lookupYelpBusiness(args: {
  name: string;
  city?: string;
  slug?: string; // yelp.com/biz/<slug> — used to disambiguate when multiple matches
}): Promise<{
  rating: number;
  ratingCount: number;
  url: string;
  title: string;
} | null> {
  const q = `${args.name}${args.city ? ` ${args.city}` : ""} site:yelp.com`;
  const data = await serperPost<{
    organic?: Array<{
      title: string;
      link: string;
      rating?: number;
      ratingCount?: number;
    }>;
  }>("/search", { q, gl: "us", hl: "en", num: 5 });

  const candidates = (data.organic ?? []).filter(
    (r) => r.rating != null && r.ratingCount != null && r.link.includes("/biz/"),
  );
  if (candidates.length === 0) return null;

  // Prefer the result whose URL contains the canonical slug (if provided).
  const matched = args.slug
    ? candidates.find((r) => r.link.includes(`/biz/${args.slug}`))
    : null;
  const pick = matched ?? candidates[0];
  return {
    rating: pick.rating!,
    ratingCount: pick.ratingCount!,
    url: pick.link,
    title: pick.title,
  };
}

/**
 * Look up a Google Maps business listing via Serper's /places endpoint.
 *
 * Avoids the Google Places API (which needs gmbPlaceId per store, plus a
 * key+billing setup). Returns the first match for "<name> <city>".
 */
export async function lookupGoogleBusiness(args: {
  name: string;
  city: string;
}): Promise<{
  rating: number;
  ratingCount: number;
  address: string;
  cid?: string;
  category?: string;
  title: string;
} | null> {
  const data = await serperPost<{ places?: SerperPlaceResult[] }>(
    "/places",
    { q: `${args.name} ${args.city}`, gl: "us" },
  );
  const top = (data.places ?? [])[0];
  if (!top || top.rating == null || top.ratingCount == null) return null;
  return {
    rating: top.rating,
    ratingCount: top.ratingCount,
    address: top.address,
    cid: top.cid,
    category: top.category,
    title: top.title,
  };
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
