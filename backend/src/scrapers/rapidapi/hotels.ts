import axios from 'axios';
import type { HotelResult } from '../../../../shared/types';
import { rapidApiHeaders } from './client';
import type { Occupancy } from './booking';

// ---------------------------------------------------------------------------
// Two distinct RapidAPI products, both fronting the same Expedia-family
// GraphQL backend — "Hotels" (apidojo, host hotels4) and "Hotels.com Provider"
// (host hotels-com-provider). Confirmed live: both correctly resolve a
// destination to a gaiaId/region_id, and both accept a full property search
// request (200, real matchedPropertiesSize counts in the hundreds) — but the
// actual `propertySearchListings` entries these specific RapidAPI wrappers
// return are stub objects containing only `__typename: "LodgingCard"`, no
// name/price/rating/etc. This was verified across multiple sort orders and
// param combinations, so it isn't a request-shape bug on our side — it's a
// GraphQL field-selection limitation baked into these wrappers. Both are kept
// wired up (rather than deleted) since the destination-resolution half is
// solid and the listing responses may start populating fields if the
// provider fixes their wrapper; until then both degrade to [].
// ---------------------------------------------------------------------------

const HOTELS4_HOST = 'hotels4.p.rapidapi.com';
const HOTELS_COM_PROVIDER_HOST = 'hotels-com-provider.p.rapidapi.com';

function nightsBetween(checkin: string, checkout: string): number {
  const ms = new Date(checkout).getTime() - new Date(checkin).getTime();
  return Math.max(1, Math.round(ms / 86400000));
}

function dateParts(dateStr: string): { day: number; month: number; year: number } {
  const d = new Date(dateStr);
  return { day: d.getUTCDate(), month: d.getUTCMonth() + 1, year: d.getUTCFullYear() };
}

interface LodgingCard {
  __typename?: string;
  name?: string;
  id?: string;
  price?: { lead?: { amount?: number }; displayMessages?: unknown };
  reviews?: { score?: number; total?: number };
  propertyImage?: { image?: { url?: string } };
  mapMarker?: { latLong?: { latitude?: number; longitude?: number } };
  optimizedThumbnailUrls?: { srpDesktop?: string };
}

interface PropertySearchListingsResponse {
  data?: { propertySearch?: { propertySearchListings?: LodgingCard[] } };
  propertySearchListings?: LodgingCard[];
}

function normaliseCard(card: LodgingCard, source: string, checkin: string, checkout: string, index: number): HotelResult | null {
  // Confirmed live: these wrappers currently return {__typename: "LodgingCard"}
  // stubs with no other fields — this guard keeps the scraper correct/no-op
  // rather than emitting empty-named garbage entries if that's all we get.
  if (!card.name) return null;

  const nights = nightsBetween(checkin, checkout);
  const totalPrice = card.price?.lead?.amount ?? 0;

  return {
    id: `${source}-${card.id ?? index}`,
    name: card.name,
    price_per_night: totalPrice > 0 ? Math.round((totalPrice / nights) * 100) / 100 : 0,
    rating: card.reviews?.score ?? 0,
    review_count: card.reviews?.total ?? 0,
    amenities: [],
    lat: card.mapMarker?.latLong?.latitude ?? 0,
    lng: card.mapMarker?.latLong?.longitude ?? 0,
    image_url: card.propertyImage?.image?.url ?? card.optimizedThumbnailUrls?.srpDesktop ?? '',
    source,
    booking_url: '',
  };
}

// ---------------------------------------------------------------------------
// "Hotels" (apidojo) — hotels4.p.rapidapi.com
// ---------------------------------------------------------------------------

interface Hotels4RegionResult {
  gaiaId?: string;
  type?: string;
}

// Like booking's searchDestination, these location endpoints rank by string
// match — a query like "New York, New York, United States" can put a HOTEL
// entry (e.g. New York-New York, Las Vegas) above the city. Prefer city-like
// regions so the property search runs against the right place.
function preferCity<T extends { type?: string }>(items: T[]): T | undefined {
  return items.find((i) => (i.type ?? '').toUpperCase() === 'CITY') ?? items[0];
}

async function resolveHotels4Region(destination: string): Promise<string | null> {
  try {
    const res = await axios.get<{ sr?: Hotels4RegionResult[] }>('https://' + HOTELS4_HOST + '/locations/v3/search', {
      params: { q: destination, locale: 'en_US' },
      headers: rapidApiHeaders(HOTELS4_HOST),
      timeout: 10_000,
    });
    return preferCity(res.data?.sr ?? [])?.gaiaId ?? null;
  } catch (err: unknown) {
    console.error('[rapidapi/hotels4] resolveRegion error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchHotels4(regionId: string, checkin: string, checkout: string, occupancy: Occupancy): Promise<HotelResult[]> {
  const adults = occupancy.adults ?? 2;
  const roomCount = occupancy.rooms ?? 1;
  try {
    const res = await axios.post<PropertySearchListingsResponse>(
      'https://' + HOTELS4_HOST + '/properties/v2/list',
      {
        currency: 'USD',
        eapid: 1,
        locale: 'en_US',
        siteId: 300000001,
        destination: { regionId },
        checkInDate: dateParts(checkin),
        checkOutDate: dateParts(checkout),
        // Split adults evenly across the requested rooms (min 1 per room).
        rooms: Array.from({ length: roomCount }, (_, i) => ({
          adults: Math.max(1, Math.floor(adults / roomCount) + (i < adults % roomCount ? 1 : 0)),
        })),
        resultsStartingIndex: 0,
        resultsSize: 20,
      },
      { headers: rapidApiHeaders(HOTELS4_HOST), timeout: 20_000 }
    );
    const cards = res.data?.data?.propertySearch?.propertySearchListings ?? [];
    return cards
      .filter((c) => c.__typename === 'LodgingCard')
      .map((c, i) => normaliseCard(c, 'hotels.com', checkin, checkout, i))
      .filter((h): h is HotelResult => h !== null);
  } catch (err: unknown) {
    console.error('[rapidapi/hotels4] fetchHotels error:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function scrapeHotels4(destination: string, checkin: string, checkout: string, occupancy: Occupancy = {}): Promise<HotelResult[]> {
  const regionId = await resolveHotels4Region(destination);
  if (!regionId) {
    console.warn(`[rapidapi/hotels4] could not resolve region for "${destination}"`);
    return [];
  }
  const hotels = await fetchHotels4(regionId, checkin, checkout, occupancy);
  console.log(`[rapidapi/hotels4] ${destination}: ${hotels.length} hotels`);
  return hotels;
}

// ---------------------------------------------------------------------------
// "Hotels.com Provider" — hotels-com-provider.p.rapidapi.com
// ---------------------------------------------------------------------------

interface HotelsComRegionResult {
  gaiaId?: string;
  type?: string;
}

async function resolveHotelsComRegion(destination: string): Promise<string | null> {
  try {
    const res = await axios.get<{ data?: HotelsComRegionResult[] }>('https://' + HOTELS_COM_PROVIDER_HOST + '/v2/regions', {
      params: { query: destination, domain: 'US', locale: 'en_US' },
      headers: rapidApiHeaders(HOTELS_COM_PROVIDER_HOST),
      timeout: 10_000,
    });
    return preferCity(res.data?.data ?? [])?.gaiaId ?? null;
  } catch (err: unknown) {
    console.error('[rapidapi/hotels-com-provider] resolveRegion error:', err instanceof Error ? err.message : err);
    return null;
  }
}

async function fetchHotelsComProvider(regionId: string, checkin: string, checkout: string, occupancy: Occupancy): Promise<HotelResult[]> {
  try {
    const res = await axios.get<PropertySearchListingsResponse>('https://' + HOTELS_COM_PROVIDER_HOST + '/v2/hotels/search', {
      params: {
        region_id: regionId,
        domain: 'US',
        sort_order: 'PRICE_LOW_TO_HIGH',
        locale: 'en_US',
        checkin_date: checkin,
        checkout_date: checkout,
        adults_number: String(occupancy.adults ?? 2),
        currency: 'USD',
      },
      headers: rapidApiHeaders(HOTELS_COM_PROVIDER_HOST),
      timeout: 20_000,
    });
    const cards = res.data?.propertySearchListings ?? [];
    return cards
      .filter((c) => c.__typename === 'LodgingCard')
      .map((c, i) => normaliseCard(c, 'hotels.com-provider', checkin, checkout, i))
      .filter((h): h is HotelResult => h !== null);
  } catch (err: unknown) {
    console.error('[rapidapi/hotels-com-provider] fetchHotels error:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function scrapeHotelsComProvider(destination: string, checkin: string, checkout: string, occupancy: Occupancy = {}): Promise<HotelResult[]> {
  const regionId = await resolveHotelsComRegion(destination);
  if (!regionId) {
    console.warn(`[rapidapi/hotels-com-provider] could not resolve region for "${destination}"`);
    return [];
  }
  const hotels = await fetchHotelsComProvider(regionId, checkin, checkout, occupancy);
  console.log(`[rapidapi/hotels-com-provider] ${destination}: ${hotels.length} hotels`);
  return hotels;
}

// ---------------------------------------------------------------------------
// Public API — both sources, merged
// ---------------------------------------------------------------------------

export async function scrapeHotelsProviders(
  destination: string,
  checkin: string,
  checkout: string,
  occupancy: Occupancy = {}
): Promise<HotelResult[]> {
  const [hotels4, hotelsComProvider] = await Promise.all([
    scrapeHotels4(destination, checkin, checkout, occupancy),
    scrapeHotelsComProvider(destination, checkin, checkout, occupancy),
  ]);
  return [...hotels4, ...hotelsComProvider];
}

export { scrapeHotels4, scrapeHotelsComProvider };
