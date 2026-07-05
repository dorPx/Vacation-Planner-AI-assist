import axios from 'axios';
import type { FlightResult } from '../../../shared/types';

// Ignav (ignav.com) — flight fares + booking links. Round-trip fares are
// queried in USD (market=US) to match the app's USD-authoritative price basis,
// same as the other flight sources. Auth is an X-Api-Key header.
//
// Ignav is FLIGHTS ONLY — it has no hotel/lodging data, so it plugs into the
// flights pipeline beside Google Flights / Sky-Scrapper / Duffel and nowhere
// else. Fail-soft: any error or a missing key degrades to zero flights.

const BASE = 'https://ignav.com/api';

function ignavHeaders(): Record<string, string> {
  return {
    'X-Api-Key': process.env.IGNAV_API_KEY ?? '',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Place resolution — free text ("New York") -> airport code ("JFK")
// ---------------------------------------------------------------------------

interface IgnavAirport {
  code?: string;
  name?: string;
  city?: string;
  country?: string;
}

async function resolveAirport(query: string): Promise<string | null> {
  const trimmed = query.trim();
  // Already an airport/IATA code — use it directly.
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();

  try {
    const res = await axios.get<IgnavAirport[]>(`${BASE}/airports`, {
      params: { q: trimmed, limit: 1 },
      headers: ignavHeaders(),
      timeout: 10_000,
    });
    return res.data?.[0]?.code ?? null;
  } catch (err: unknown) {
    console.error('[ignav] resolveAirport error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Fares
// ---------------------------------------------------------------------------

interface IgnavSegment {
  marketing_carrier_code?: string | null;
  flight_number?: string | null;
  operating_carrier_name?: string | null;
  departure_airport?: string;
  departure_time_local?: string;
  departure_time_utc?: string | null;
  arrival_airport?: string;
  arrival_time_local?: string;
  arrival_time_utc?: string | null;
  duration_minutes?: number;
}

interface IgnavSlice {
  carrier?: string | null;
  duration_minutes?: number | null;
  segments?: IgnavSegment[];
}

interface IgnavItinerary {
  price?: { amount?: number; currency?: string; status?: string };
  outbound?: IgnavSlice;
  inbound?: IgnavSlice | null;
  cabin_class?: string | null;
  ignav_id?: string;
}

function sliceDuration(slice?: IgnavSlice): number {
  if (slice?.duration_minutes && slice.duration_minutes > 0) return slice.duration_minutes;
  return (slice?.segments ?? []).reduce((sum, s) => sum + (s.duration_minutes ?? 0), 0);
}

function normaliseItinerary(it: IgnavItinerary, index: number): FlightResult | null {
  const segments = it.outbound?.segments ?? [];
  if (!segments.length) return null;
  const first = segments[0];
  const last = segments[segments.length - 1];

  const airline =
    it.outbound?.carrier ??
    first.operating_carrier_name ??
    first.marketing_carrier_code ??
    'Unknown';

  return {
    id: `ignav-${it.ignav_id ?? index}`,
    airline,
    // Round-trip total in USD, same basis as the other flight sources.
    price: it.price?.amount ?? 0,
    departure: first.departure_time_local ?? first.departure_time_utc ?? '',
    arrival: last.arrival_time_local ?? last.arrival_time_utc ?? '',
    duration_minutes: sliceDuration(it.outbound),
    stops: Math.max(0, segments.length - 1),
    source: 'ignav',
  };
}

async function searchRoundTrip(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  try {
    const res = await axios.post<{ itineraries?: IgnavItinerary[] }>(
      `${BASE}/fares/round-trip`,
      {
        origin,
        destination,
        departure_date: departDate,
        return_date: returnDate,
        adults: 1,
        cabin_class: 'economy',
        market: 'US',
      },
      { headers: ignavHeaders(), timeout: 25_000 }
    );

    const itineraries = res.data?.itineraries ?? [];
    return itineraries
      .slice(0, 20)
      .map((it, i) => normaliseItinerary(it, i))
      .filter((f): f is FlightResult => f !== null);
  } catch (err: unknown) {
    console.error('[ignav] searchRoundTrip error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeIgnavFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  if (!process.env.IGNAV_API_KEY) return []; // unconfigured — fail soft like every other source

  const [originCode, destinationCode] = await Promise.all([
    resolveAirport(origin),
    resolveAirport(destination),
  ]);
  if (!originCode || !destinationCode) {
    console.warn(`[ignav] could not resolve "${origin}" -> "${destination}" to airport codes`);
    return [];
  }

  const flights = await searchRoundTrip(originCode, destinationCode, departDate, returnDate);
  console.log(`[ignav] ${origin} -> ${destination}: ${flights.length} fares`);
  return flights;
}
