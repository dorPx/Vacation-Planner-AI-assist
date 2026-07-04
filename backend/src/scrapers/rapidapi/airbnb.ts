import axios from 'axios';
import type { HotelResult } from '../../../../shared/types';
import { rapidApiHeaders } from './client';

const HOST = 'airbnb19.p.rapidapi.com';
const BASE = `https://${HOST}/api/v1`;

// ---------------------------------------------------------------------------
// Airbnb (airbnb19.p.rapidapi.com). Destination resolution is confirmed
// solid — searchDestination returns real Google Place IDs with correct
// names. The property search step (searchPropertyByPlace) is also confirmed
// reachable — 200, no validation error, correct required param name (`id`,
// not `placeId`) — but consistently responds { status: false, message: {} }
// with zero listings across every parameter combination tried live (with/
// without dates, adults, currency, page). This mirrors the exact same
// confirmed-reachable-but-empty behavior already documented for TripAdvisor's
// restaurant endpoint in rapidapi/tripadvisor.ts — a provider-side limitation,
// not a request-shape bug here. Kept wired up rather than dropped since the
// resolution half works and the search may start returning data later.
//
// Airbnb listings are modeled as HotelResult, consistent with how this app
// already treats all short-term lodging (hotels, BnBs, apartments) uniformly.
// ---------------------------------------------------------------------------

interface AirbnbDestination {
  id?: string;
  location_name?: string;
}

async function resolveDestination(destination: string): Promise<string | null> {
  try {
    const res = await axios.get<{ data?: AirbnbDestination[] }>(`${BASE}/searchDestination`, {
      params: { query: destination },
      headers: rapidApiHeaders(HOST),
      timeout: 10_000,
    });
    return res.data?.data?.[0]?.id ?? null;
  } catch (err: unknown) {
    console.error('[rapidapi/airbnb] resolveDestination error:', err instanceof Error ? err.message : err);
    return null;
  }
}

interface AirbnbListing {
  id?: string;
  name?: string;
  price?: { total?: { amount?: number } };
  rating?: { value?: number; reviewCount?: number };
  images?: string[];
  coordinate?: { latitude?: number; longitude?: number };
  url?: string;
}

function nightsBetween(checkin: string, checkout: string): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function normaliseListing(l: AirbnbListing, checkin: string, checkout: string, index: number): HotelResult | null {
  if (!l.name) return null;
  const nights = nightsBetween(checkin, checkout);
  const totalPrice = l.price?.total?.amount ?? 0;

  return {
    id: `airbnb-${l.id ?? index}`,
    name: l.name,
    price_per_night: totalPrice > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
    rating: l.rating?.value ?? 0,
    review_count: l.rating?.reviewCount ?? 0,
    amenities: [],
    lat: l.coordinate?.latitude ?? 0,
    lng: l.coordinate?.longitude ?? 0,
    image_url: l.images?.[0] ?? '',
    source: 'airbnb',
    booking_url: l.url ?? '',
  };
}

async function fetchListings(placeId: string, checkin: string, checkout: string): Promise<HotelResult[]> {
  try {
    const res = await axios.get<{ data?: { list?: AirbnbListing[] } }>(`${BASE}/searchPropertyByPlace`, {
      params: {
        id: placeId,
        checkin,
        checkout,
        adults: 2,
        currency: 'USD',
      },
      headers: rapidApiHeaders(HOST),
      timeout: 20_000,
    });
    const listings = res.data?.data?.list ?? [];
    return listings
      .slice(0, 20)
      .map((l, i) => normaliseListing(l, checkin, checkout, i))
      .filter((h): h is HotelResult => h !== null);
  } catch (err: unknown) {
    console.error('[rapidapi/airbnb] fetchListings error:', err instanceof Error ? err.message : err);
    return [];
  }
}

export async function scrapeAirbnb(destination: string, checkin: string, checkout: string): Promise<HotelResult[]> {
  const placeId = await resolveDestination(destination);
  if (!placeId) {
    console.warn(`[rapidapi/airbnb] could not resolve destination for "${destination}"`);
    return [];
  }
  const listings = await fetchListings(placeId, checkin, checkout);
  console.log(`[rapidapi/airbnb] ${destination}: ${listings.length} listings`);
  return listings;
}
