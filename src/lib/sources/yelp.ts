/**
 * Yelp Fusion API — FREE 5000 calls/day.
 * Docs: https://docs.developer.yelp.com/reference/v3_business_info
 *
 * Limitation: only returns 3 review excerpts per business.
 * For full reviews you'd need scraping; we accept the 3-review snapshot.
 */

const BASE = "https://api.yelp.com/v3";

function key() {
  const k = process.env.YELP_API_KEY;
  if (!k) throw new Error("YELP_API_KEY not set");
  return k;
}

async function yelpFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${key()}` },
  });
  if (!res.ok) throw new Error(`Yelp ${res.status}: ${await res.text()}`);
  return res.json();
}

export type YelpBusiness = {
  id: string;
  name: string;
  rating: number;
  reviewCount: number;
  url: string;
};

export type YelpReview = {
  externalId: string;
  authorName: string | null;
  rating: number;
  content: string;
  publishedAt: Date | null;
  url: string;
};

export async function getBusiness(yelpId: string): Promise<YelpBusiness> {
  const data = await yelpFetch<{
    id: string;
    name: string;
    rating: number;
    review_count: number;
    url: string;
  }>(`/businesses/${yelpId}`);
  return {
    id: data.id,
    name: data.name,
    rating: data.rating,
    reviewCount: data.review_count,
    url: data.url,
  };
}

export async function getReviews(yelpId: string): Promise<YelpReview[]> {
  const data = await yelpFetch<{
    reviews: Array<{
      id: string;
      rating: number;
      text: string;
      time_created: string;
      url: string;
      user: { name: string };
    }>;
  }>(`/businesses/${yelpId}/reviews?sort_by=newest`);
  return data.reviews.map((r) => ({
    externalId: r.id,
    authorName: r.user?.name ?? null,
    rating: r.rating,
    content: r.text,
    publishedAt: r.time_created ? new Date(r.time_created) : null,
    url: r.url,
  }));
}

/** Search businesses for competitor discovery. */
export async function searchBusinesses(args: {
  term: string;
  location: string; // e.g. "Dublin, CA"
  categories?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({
    term: args.term,
    location: args.location,
    limit: String(args.limit ?? 20),
  });
  if (args.categories) params.set("categories", args.categories);
  return yelpFetch<{ businesses: Array<Record<string, unknown>> }>(
    `/businesses/search?${params}`,
  );
}
