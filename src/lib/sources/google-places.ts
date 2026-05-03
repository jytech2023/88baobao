/**
 * Google Places API (New) — Place Details + Nearby Search
 * Docs: https://developers.google.com/maps/documentation/places/web-service
 *
 * Free tier: $200/month credit. Place Details ~$17/1000 calls.
 * For 11 stores + 10 competitors twice/day = ~1300 calls/mo = ~$22 → free.
 */

const BASE = "https://places.googleapis.com/v1";

function key() {
  const k = process.env.GOOGLE_PLACES_API_KEY;
  if (!k) throw new Error("GOOGLE_PLACES_API_KEY not set");
  return k;
}

export type PlaceReview = {
  externalId: string;
  authorName: string | null;
  rating: number | null;
  content: string | null;
  publishedAt: Date | null;
  language: string | null;
};

export type PlaceDetails = {
  placeId: string;
  name: string;
  rating: number | null;
  userRatingCount: number | null;
  reviews: PlaceReview[];
};

export async function fetchPlaceDetails(placeId: string): Promise<PlaceDetails> {
  const res = await fetch(`${BASE}/places/${placeId}`, {
    headers: {
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask":
        "id,displayName,rating,userRatingCount,reviews.name,reviews.rating,reviews.text,reviews.publishTime,reviews.authorAttribution",
    },
  });
  if (!res.ok) {
    throw new Error(`Google Places ${res.status}: ${await res.text()}`);
  }
  const data = await res.json();
  return {
    placeId: data.id,
    name: data.displayName?.text ?? "",
    rating: data.rating ?? null,
    userRatingCount: data.userRatingCount ?? null,
    reviews: (data.reviews ?? []).map(
      (r: {
        name: string;
        rating?: number;
        text?: { text?: string; languageCode?: string };
        publishTime?: string;
        authorAttribution?: { displayName?: string };
      }) => ({
        externalId: r.name,
        authorName: r.authorAttribution?.displayName ?? null,
        rating: r.rating ?? null,
        content: r.text?.text ?? null,
        publishedAt: r.publishTime ? new Date(r.publishTime) : null,
        language: r.text?.languageCode ?? null,
      }),
    ),
  };
}

/**
 * Nearby search — used for site selection (D) and competitor discovery.
 */
export async function searchNearby(args: {
  lat: number;
  lng: number;
  radiusMeters?: number;
  includedTypes?: string[];
}) {
  const res = await fetch(`${BASE}/places:searchNearby`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key(),
      "X-Goog-FieldMask":
        "places.id,places.displayName,places.rating,places.userRatingCount,places.primaryType,places.location",
    },
    body: JSON.stringify({
      includedTypes: args.includedTypes ?? ["restaurant"],
      maxResultCount: 20,
      locationRestriction: {
        circle: {
          center: { latitude: args.lat, longitude: args.lng },
          radius: args.radiusMeters ?? 1600, // 1 mi default
        },
      },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google Nearby ${res.status}: ${await res.text()}`);
  }
  return res.json();
}
