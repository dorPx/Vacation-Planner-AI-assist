import axios, { AxiosRequestConfig } from 'axios';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../../shared/types';

const RAPID_HOST = 'tripadvisor16.p.rapidapi.com';
const BASE = `https://${RAPID_HOST}/api/v1`;

function headers(): AxiosRequestConfig['headers'] {
  return {
    'X-RapidAPI-Key': process.env.RAPIDAPI_KEY ?? '',
    'X-RapidAPI-Host': RAPID_HOST,
  };
}

// ---------------------------------------------------------------------------
// Step 1 — resolve geoId
// ---------------------------------------------------------------------------

interface LocationItem {
  locationId?: string | number;
  location_id?: string | number;
  geoId?: string | number;
  name?: string;
}

async function resolveLocationId(destination: string): Promise<string | null> {
  try {
    const res = await axios.get<{ data?: LocationItem[] }>(
      `${BASE}/hotels/searchLocation`,
      {
        params: { query: destination },
        headers: headers(),
        timeout: 10_000,
      }
    );
    const items = res.data?.data ?? [];
    if (!items.length) return null;
    const first = items[0];
    const id = first.geoId ?? first.locationId ?? first.location_id ?? null;
    return id ? String(id) : null;
  } catch (err: unknown) {
    console.error('[rapidapi] resolveLocationId error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

interface RapidHotel {
  id?: string | number;
  locationId?: string | number;
  name?: string;
  title?: string;
  priceForDisplay?: string;
  rawPrice?: number;
  bubbleRating?: { rating?: number; count?: string };
  cardPhotos?: { sizes?: { urlTemplate?: string } }[];
  commerceInfo?: { externalUrl?: string };
  latitude?: number;
  longitude?: number;
  amenitiesV2?: { text?: string }[];
}

function normaliseHotel(h: RapidHotel, index: number): HotelResult {
  // TripAdvisor titles arrive ranked ("3. The Empire Hotel") — strip the prefix.
  const name = (h.name ?? h.title ?? `Hotel ${index + 1}`).replace(/^\d+\.\s*/, '');
  const rawPrice = h.rawPrice ?? parseFloat((h.priceForDisplay ?? '').replace(/[^0-9.]/g, '')) ?? 0;
  const rating = h.bubbleRating?.rating ?? 0;
  // count comes back like "(1,852)" — strip everything but digits, not just commas.
  const reviewCountRaw = h.bubbleRating?.count ?? '0';
  const reviewCount = parseInt(reviewCountRaw.replace(/[^0-9]/g, ''), 10) || 0;
  const imageTemplate = h.cardPhotos?.[0]?.sizes?.urlTemplate ?? '';
  const imageUrl = imageTemplate.replace('{width}', '600').replace('{height}', '400');
  const bookingUrl = h.commerceInfo?.externalUrl ?? '';
  const amenities = (h.amenitiesV2 ?? []).map((a) => a.text ?? '').filter(Boolean);

  return {
    id: `ta-hotel-${h.id ?? h.locationId ?? index}`,
    name,
    price_per_night: rawPrice,
    rating,
    review_count: reviewCount,
    amenities: amenities.slice(0, 10),
    lat: h.latitude ?? 0,
    lng: h.longitude ?? 0,
    image_url: imageUrl,
    source: 'tripadvisor',
    booking_url: bookingUrl,
  };
}

async function fetchHotels(geoId: string, checkin: string, checkout: string): Promise<HotelResult[]> {
  try {
    // NOTE: the real endpoint is the plural "searchHotels" and takes a
    // resolved geoId, not a free-text location string — the singular
    // "searchHotel" + `location` param this used to call 404s outright.
    const res = await axios.get<{ data?: { data?: RapidHotel[] } }>(
      `${BASE}/hotels/searchHotels`,
      {
        params: {
          geoId,
          checkIn: checkin,
          checkOut: checkout,
          pageNumber: 1,
          currencyCode: 'USD',
        },
        headers: headers(),
        timeout: 15_000,
      }
    );
    const items: RapidHotel[] = res.data?.data?.data ?? [];
    return items.slice(0, 20).map(normaliseHotel);
  } catch (err: unknown) {
    console.error('[rapidapi] fetchHotels error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Restaurants
// ---------------------------------------------------------------------------

interface RapidRestaurant {
  restaurantsId?: string | number;
  locationId?: string | number;
  name?: string;
  averageRating?: number;
  userReviewCount?: number;
  establishmentTypeAndCuisineTags?: string[];
  priceTag?: string;
  latitude?: number;
  longitude?: number;
}

function normaliseRestaurant(r: RapidRestaurant, index: number): RestaurantResult {
  const priceDollars = (r.priceTag ?? '').replace(/[^$]/g, '').length;
  const cuisines = r.establishmentTypeAndCuisineTags ?? [];
  const cuisine = cuisines.filter((t) => !/restaurant|dining/i.test(t)).join(', ') || 'International';

  return {
    id: `ta-rest-${r.restaurantsId ?? r.locationId ?? index}`,
    name: r.name ?? `Restaurant ${index + 1}`,
    cuisine: cuisine.substring(0, 60),
    price_level: priceDollars || 2,
    rating: r.averageRating ?? 0,
    lat: r.latitude ?? 0,
    lng: r.longitude ?? 0,
    source: 'tripadvisor',
  };
}

async function fetchRestaurants(locationId: string): Promise<RestaurantResult[]> {
  try {
    const res = await axios.get<{ data?: { data?: RapidRestaurant[] } }>(
      `${BASE}/restaurant/searchRestaurants`,
      {
        params: { locationId },
        headers: headers(),
        timeout: 15_000,
      }
    );
    const items: RapidRestaurant[] = res.data?.data?.data ?? [];
    // As of writing this endpoint accepts the request (no validation error)
    // but the provider always responds { status: false, message: {} } with
    // no data — confirmed live, not a bug in this parsing. Degrades to [].
    return items.slice(0, 20).map(normaliseRestaurant);
  } catch (err: unknown) {
    console.error('[rapidapi] fetchRestaurants error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Activities / Attractions
// ---------------------------------------------------------------------------

interface RapidAttraction {
  attractionId?: string | number;
  locationId?: string | number;
  name?: string;
  averageRating?: number;
  userReviewCount?: number;
  primaryCategory?: string;
  subcategory?: string[];
  latitude?: number;
  longitude?: number;
  description?: string;
  duration?: string;
  price?: { amount?: number };
}

function normaliseActivity(a: RapidAttraction, index: number): ActivityResult {
  const durMatch = (a.duration ?? '').match(/(\d(?:\.\d)?)\s*(?:hour|hr)/i);
  const durationHours = durMatch ? parseFloat(durMatch[1]) : 2;
  const category =
    (a.subcategory && a.subcategory[0]) ?? a.primaryCategory ?? 'Attraction';

  return {
    id: `ta-act-${a.attractionId ?? a.locationId ?? index}`,
    name: a.name ?? `Activity ${index + 1}`,
    category: category.substring(0, 40),
    price: a.price?.amount ?? 0,
    rating: a.averageRating ?? 0,
    duration_hours: durationHours,
    lat: a.latitude ?? 0,
    lng: a.longitude ?? 0,
    description: (a.description ?? '').substring(0, 300),
    source: 'tripadvisor',
  };
}

async function fetchActivities(locationId: string): Promise<ActivityResult[]> {
  try {
    // NOTE: confirmed live (see diagnostic session) that /attraction/searchAttractions
    // no longer exists on this RapidAPI listing — every name variant tried 404s.
    // Left in place (fails safe to []) until a replacement endpoint is found.
    const res = await axios.get<{ data?: { data?: RapidAttraction[] } }>(
      `${BASE}/attraction/searchAttractions`,
      {
        params: { locationId },
        headers: headers(),
        timeout: 15_000,
      }
    );
    const items: RapidAttraction[] = res.data?.data?.data ?? [];
    return items.slice(0, 20).map(normaliseActivity);
  } catch (err: unknown) {
    console.error('[rapidapi] fetchActivities error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeTripAdvisor(
  destination: string,
  checkin: string,
  checkout: string
): Promise<{ activities: ActivityResult[]; restaurants: RestaurantResult[]; hotels: HotelResult[] }> {
  const locationId = await resolveLocationId(destination);

  if (!locationId) {
    console.warn(`[rapidapi] could not resolve geoId for "${destination}" — skipping all RapidAPI fetches`);
    return { hotels: [], activities: [], restaurants: [] };
  }

  const [hotels, activities, restaurants] = await Promise.all([
    fetchHotels(locationId, checkin, checkout),
    fetchActivities(locationId),
    fetchRestaurants(locationId),
  ]);

  console.log(
    `[rapidapi/tripadvisor] ${destination}: ${hotels.length} hotels, ${activities.length} activities, ${restaurants.length} restaurants`
  );

  return { hotels, activities, restaurants };
}
