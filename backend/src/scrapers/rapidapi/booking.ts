import axios from 'axios';
import type { HotelResult } from '../../../../shared/types';
import { rapidApiHeaders } from './client';

const HOST = 'booking-com15.p.rapidapi.com';
const BASE = `https://${HOST}/api/v1`;

// ---------------------------------------------------------------------------
// Step 1 — resolve dest_id + search_type
// ---------------------------------------------------------------------------

interface DestinationItem {
  dest_id?: string;
  search_type?: string;
}

// searchDestination ranks by string match, not by place kind — querying the
// full autocomplete label "New York, New York, United States" puts the
// "New York-New York" hotel (Las Vegas!) first. A destination search must
// resolve to a place, so prefer geographic types over hotels/landmarks.
const SEARCH_TYPE_PRIORITY = ['city', 'district', 'region', 'country'];

function pickDestination(items: DestinationItem[]): DestinationItem | null {
  for (const type of SEARCH_TYPE_PRIORITY) {
    const match = items.find((item) => (item.search_type ?? '').toLowerCase() === type);
    if (match) return match;
  }
  return items[0] ?? null;
}

async function resolveDestination(destination: string): Promise<DestinationItem | null> {
  try {
    const res = await axios.get<{ data?: DestinationItem[] }>(`${BASE}/hotels/searchDestination`, {
      params: { query: destination },
      headers: rapidApiHeaders(HOST),
      timeout: 10_000,
    });
    const items = res.data?.data ?? [];
    return pickDestination(items);
  } catch (err: unknown) {
    console.error('[rapidapi/booking] resolveDestination error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Hotels
// ---------------------------------------------------------------------------

interface BookingHotel {
  hotel_id?: number;
  property?: {
    name?: string;
    reviewScore?: number;
    reviewCount?: number;
    latitude?: number;
    longitude?: number;
    photoUrls?: string[];
    priceBreakdown?: { grossPrice?: { value?: number } };
  };
}

function nightsBetween(checkin: string, checkout: string): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function normaliseHotel(h: BookingHotel, destination: string, checkin: string, checkout: string, index: number): HotelResult {
  const p = h.property ?? {};
  const name = p.name ?? `Hotel ${index + 1}`;
  const totalPrice = p.priceBreakdown?.grossPrice?.value ?? 0;
  const nights = nightsBetween(checkin, checkout);

  return {
    id: `booking15-${h.hotel_id ?? index}`,
    name,
    price_per_night: totalPrice > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
    // Booking's reviewScore is 0-10; everything downstream (star display,
    // dedupe, rating filters) assumes 0-5, so halve it (8.6 -> 4.3).
    rating: p.reviewScore ? Math.round(p.reviewScore * 5) / 10 : 0,
    review_count: p.reviewCount ?? 0,
    amenities: [],
    lat: p.latitude ?? 0,
    lng: p.longitude ?? 0,
    image_url: p.photoUrls?.[0] ?? '',
    // The list endpoint doesn't return a per-hotel permalink — this search
    // URL reliably lands on a real Booking.com results page for the hotel.
    source: 'booking.com',
    booking_url: `https://www.booking.com/searchresults.html?ss=${encodeURIComponent(`${name} ${destination}`)}&checkin=${checkin}&checkout=${checkout}`,
  };
}

export interface Occupancy {
  adults?: number;
  children?: number;
  rooms?: number;
}

async function fetchHotels(
  destId: string,
  searchType: string,
  destination: string,
  checkin: string,
  checkout: string,
  occupancy: Occupancy
): Promise<HotelResult[]> {
  const adults = occupancy.adults ?? 2;
  const rooms = occupancy.rooms ?? 1;
  const children = occupancy.children ?? 0;
  try {
    const res = await axios.get<{ data?: { hotels?: BookingHotel[] } }>(`${BASE}/hotels/searchHotels`, {
      params: {
        dest_id: destId,
        search_type: searchType,
        // Booking's own "top picks" ranking — without this the API's default
        // ordering decides which 20 hotels we keep, and that skews expensive.
        sort_by: 'popularity',
        arrival_date: checkin,
        departure_date: checkout,
        adults: String(adults),
        room_qty: String(rooms),
        // The API prices children by age; we only collect a count, so assume
        // school-age (8) per child — the standard OTA default when age is unknown.
        ...(children > 0 ? { children_age: Array(children).fill('8').join(',') } : {}),
        page_number: '1',
        currency_code: 'USD',
      },
      headers: rapidApiHeaders(HOST),
      timeout: 15_000,
    });
    const items = res.data?.data?.hotels ?? [];
    return items.slice(0, 20).map((h, i) => normaliseHotel(h, destination, checkin, checkout, i));
  } catch (err: unknown) {
    console.error('[rapidapi/booking] fetchHotels error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeBookingHotels(
  destination: string,
  checkin: string,
  checkout: string,
  occupancy: Occupancy = {}
): Promise<HotelResult[]> {
  const dest = await resolveDestination(destination);
  if (!dest?.dest_id || !dest.search_type) {
    console.warn(`[rapidapi/booking] could not resolve dest_id for "${destination}" — skipping`);
    return [];
  }

  const hotels = await fetchHotels(dest.dest_id, dest.search_type, destination, checkin, checkout, occupancy);
  console.log(`[rapidapi/booking] ${destination}: ${hotels.length} hotels`);
  return hotels;
}
