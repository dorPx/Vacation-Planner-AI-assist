import axios from 'axios';
import { cache } from '../db';
import type { HotelResult } from '../../../shared/types';

// Google Geocoding API (verified enabled on this key) — used to backfill
// coordinates for hotels whose source doesn't provide them (TripAdvisor's
// listing endpoint returns no lat/lng), so every hotel can pin on the map.

const GEOCODE_URL = 'https://maps.googleapis.com/maps/api/geocode/json';
// Hotel addresses don't move — cache aggressively, well past the 3h search TTL.
const GEO_CACHE_TTL_SECONDS = 7 * 24 * 60 * 60;
// Bounds cost/latency per search; only the hotels that can actually appear on
// the map's top-20 view need coordinates urgently, and results are cached.
const MAX_LOOKUPS_PER_SEARCH = 20;

interface GeocodeLocation {
  lat: number;
  lng: number;
}

async function geocode(query: string): Promise<GeocodeLocation | null> {
  const cacheKey = `geo:${query.toLowerCase()}`;
  const cached = cache.get<GeocodeLocation | 'miss'>(cacheKey);
  if (cached === 'miss') return null; // negative-cache failed lookups too
  if (cached) return cached;

  try {
    const res = await axios.get<{
      status?: string;
      results?: { geometry?: { location?: GeocodeLocation } }[];
    }>(GEOCODE_URL, {
      params: { address: query, key: process.env.GOOGLE_MAPS_API_KEY ?? '' },
      timeout: 8_000,
    });

    const location = res.data.status === 'OK' ? res.data.results?.[0]?.geometry?.location : undefined;
    if (location && typeof location.lat === 'number' && typeof location.lng === 'number') {
      cache.set(cacheKey, location, GEO_CACHE_TTL_SECONDS);
      return location;
    }
    cache.set(cacheKey, 'miss', GEO_CACHE_TTL_SECONDS);
    return null;
  } catch (err: unknown) {
    console.error('[geocode] lookup failed:', err instanceof Error ? err.message : err);
    return null; // transient failure — don't negative-cache
  }
}

/**
 * Backfills lat/lng on hotels that arrived without coordinates by geocoding
 * "<hotel name>, <destination>". Mutates and returns the same array; capped
 * lookups per call, all results cached for 7 days.
 */
export async function fillMissingHotelCoords(hotels: HotelResult[], destination: string): Promise<HotelResult[]> {
  const missing = hotels.filter((h) => !h.lat && !h.lng).slice(0, MAX_LOOKUPS_PER_SEARCH);
  if (!missing.length) return hotels;

  await Promise.all(
    missing.map(async (hotel) => {
      const location = await geocode(`${hotel.name}, ${destination}`);
      if (location) {
        hotel.lat = location.lat;
        hotel.lng = location.lng;
      }
    })
  );

  const resolved = missing.filter((h) => h.lat || h.lng).length;
  console.log(`[geocode] ${destination}: backfilled ${resolved}/${missing.length} hotel coordinates`);
  return hotels;
}
