import { runApifyActor } from './apifyClient';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../shared/types';

// TripAdvisor listings via the Apify actor maxcopell/tripadvisor. Richer than
// the RapidAPI TripAdvisor source (whose attraction/restaurant endpoints are
// dead), but slow (~80s), so it runs as a background enrichment (see
// orchestrator), never on the blocking search path.
//
// The actor fills maxItemsPerQuery with one type at a time in priority order,
// and big cities have enough hotels to fill any reasonable cap — so we target
// HOTELS (the primary results surface; restaurants/attractions are already
// covered by Google Places). The parser still handles every type, so flipping
// the include* toggles is all it takes to pull the others. Fail-soft: any
// error returns empty lists.

const ACTOR = 'maxcopell~tripadvisor';
const TIMEOUT_MS = 180_000;
const MAX_ITEMS = 20;

interface TripAdvisorItem {
  id?: string | number;
  type?: string; // "HOTEL" | "RESTAURANT" | "ATTRACTION"
  category?: string;
  subcategories?: string[];
  name?: string;
  rating?: number;
  numberOfReviews?: number;
  latitude?: number;
  longitude?: number;
  image?: string;
  priceLevel?: string; // "$$$"
  priceRange?: string | null; // "$218 - $347"
  webUrl?: string;
  description?: string;
  amenities?: string[];
}

/** "$218 - $347" -> 218 (nightly-ish lower bound). */
function parsePriceRange(range?: string | null): number {
  if (!range) return 0;
  const m = range.replace(/,/g, '').match(/\d+/);
  return m ? parseInt(m[0], 10) : 0;
}

function priceLevelToNumber(level?: string): number {
  const dollars = (level ?? '').replace(/[^$]/g, '').length;
  return dollars || 2;
}

function toHotel(item: TripAdvisorItem, index: number): HotelResult {
  return {
    id: `apify-ta-hotel-${item.id ?? index}`,
    name: item.name ?? `Hotel ${index + 1}`,
    price_per_night: parsePriceRange(item.priceRange),
    rating: Math.min(Number(item.rating) || 0, 5),
    review_count: item.numberOfReviews ?? 0,
    amenities: (item.amenities ?? []).slice(0, 10),
    lat: Number(item.latitude) || 0,
    lng: Number(item.longitude) || 0,
    image_url: item.image ?? '',
    source: 'tripadvisor',
    booking_url: item.webUrl ?? '',
  };
}

function toActivity(item: TripAdvisorItem, index: number): ActivityResult {
  return {
    id: `apify-ta-act-${item.id ?? index}`,
    name: item.name ?? `Activity ${index + 1}`,
    category: (item.subcategories?.[0] ?? item.category ?? 'Attraction').substring(0, 40),
    price: 0,
    rating: Number(item.rating) || 0,
    duration_hours: 2,
    lat: Number(item.latitude) || 0,
    lng: Number(item.longitude) || 0,
    description: (item.description ?? '').substring(0, 300),
    source: 'tripadvisor',
  };
}

function toRestaurant(item: TripAdvisorItem, index: number): RestaurantResult {
  return {
    id: `apify-ta-rest-${item.id ?? index}`,
    name: item.name ?? `Restaurant ${index + 1}`,
    cuisine: (item.subcategories?.[0] ?? item.category ?? 'Restaurant').substring(0, 60),
    price_level: priceLevelToNumber(item.priceLevel),
    rating: Number(item.rating) || 0,
    lat: Number(item.latitude) || 0,
    lng: Number(item.longitude) || 0,
    source: 'tripadvisor',
  };
}

export async function scrapeApifyTripAdvisor(
  destination: string,
  checkin: string,
  checkout: string
): Promise<{ hotels: HotelResult[]; activities: ActivityResult[]; restaurants: RestaurantResult[] }> {
  const items = await runApifyActor<TripAdvisorItem>(
    ACTOR,
    {
      query: destination,
      maxItemsPerQuery: MAX_ITEMS,
      includeHotels: true,
      includeRestaurants: false,
      includeAttractions: false,
      includeTags: false,
      language: 'en',
      currency: 'USD',
      checkInDate: checkin,
      checkOutDate: checkout,
    },
    { timeoutMs: TIMEOUT_MS }
  );

  const hotels: HotelResult[] = [];
  const activities: ActivityResult[] = [];
  const restaurants: RestaurantResult[] = [];

  items.forEach((item, i) => {
    const type = (item.type ?? '').toUpperCase();
    if (type === 'HOTEL') hotels.push(toHotel(item, i));
    else if (type === 'RESTAURANT') restaurants.push(toRestaurant(item, i));
    else if (type === 'ATTRACTION') activities.push(toActivity(item, i));
  });

  console.log(
    `[apify/tripadvisor] ${destination}: ${hotels.length} hotels, ${activities.length} activities, ${restaurants.length} restaurants`
  );
  return { hotels, activities, restaurants };
}
