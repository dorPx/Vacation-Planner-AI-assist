import axios from 'axios';
import type { FlightResult } from '../../../shared/types';

const BASE = 'https://api.duffel.com';

// Duffel (duffel.com) — direct airline/GDS flight content. The API requires a
// Duffel-Version header (v2 is current; requests without it are rejected).
// Responses use a {"data": ...} envelope. With a duffel_test_ key the offers
// are realistic but synthetic inventory; a duffel_live_ key returns bookable
// fares with no code changes here.
//
// Duffel Stays (hotels) was probed live on this account and is feature-gated
// (403 "This feature is not enabled for your account") — flights only.

function duffelHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.DUFFEL_API_KEY ?? ''}`,
    'Duffel-Version': 'v2',
    'Content-Type': 'application/json',
  };
}

// ---------------------------------------------------------------------------
// Place resolution — free text ("New York") -> IATA code ("NYC")
// ---------------------------------------------------------------------------

interface DuffelPlace {
  type?: string;
  iata_code?: string;
  name?: string;
}

export async function resolveIata(query: string): Promise<string | null> {
  const trimmed = query.trim();
  // Already an IATA code ("JFK", "nyc") — use it directly.
  if (/^[A-Za-z]{3}$/.test(trimmed)) return trimmed.toUpperCase();

  try {
    const res = await axios.get<{ data?: DuffelPlace[] }>(`${BASE}/places/suggestions`, {
      params: { query: trimmed },
      headers: duffelHeaders(),
      timeout: 10_000,
    });
    return res.data?.data?.[0]?.iata_code ?? null;
  } catch (err: unknown) {
    console.error('[duffel] resolveIata error:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Offers
// ---------------------------------------------------------------------------

interface DuffelSegment {
  departing_at?: string;
  arriving_at?: string;
  marketing_carrier?: { name?: string };
}

interface DuffelSlice {
  duration?: string;
  segments?: DuffelSegment[];
}

interface DuffelOffer {
  id?: string;
  total_amount?: string;
  owner?: { name?: string };
  slices?: DuffelSlice[];
}

/** "PT2H7M" -> 127. Duffel durations are ISO-8601. */
function isoDurationToMinutes(duration?: string): number {
  if (!duration) return 0;
  const m = duration.match(/P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/);
  if (!m) return 0;
  return (parseInt(m[1] ?? '0', 10) * 24 + parseInt(m[2] ?? '0', 10)) * 60 + parseInt(m[3] ?? '0', 10);
}

function normaliseOffer(offer: DuffelOffer, index: number): FlightResult | null {
  const outbound = offer.slices?.[0];
  const segments = outbound?.segments ?? [];
  if (!segments.length) return null;

  return {
    id: `duffel-${offer.id ?? index}`,
    airline: offer.owner?.name ?? segments[0].marketing_carrier?.name ?? 'Unknown',
    // Round-trip total, same basis as the other flight sources (which are
    // also queried with a return date).
    price: parseFloat(offer.total_amount ?? '0') || 0,
    departure: segments[0].departing_at ?? '',
    arrival: segments[segments.length - 1].arriving_at ?? '',
    duration_minutes: isoDurationToMinutes(outbound?.duration),
    stops: Math.max(0, segments.length - 1),
    source: 'duffel',
  };
}

async function searchOffers(
  originIata: string,
  destinationIata: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  try {
    const res = await axios.post<{ data?: { offers?: DuffelOffer[] } }>(
      `${BASE}/air/offer_requests?return_offers=true`,
      {
        data: {
          slices: [
            { origin: originIata, destination: destinationIata, departure_date: departDate },
            { origin: destinationIata, destination: originIata, departure_date: returnDate },
          ],
          passengers: [{ type: 'adult' }],
          cabin_class: 'economy',
        },
      },
      { headers: duffelHeaders(), timeout: 25_000 }
    );

    const offers = res.data?.data?.offers ?? [];
    return offers
      .slice(0, 20)
      .map((o, i) => normaliseOffer(o, i))
      .filter((f): f is FlightResult => f !== null);
  } catch (err: unknown) {
    console.error('[duffel] searchOffers error:', err instanceof Error ? err.message : err);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export async function scrapeDuffelFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  const [originIata, destinationIata] = await Promise.all([resolveIata(origin), resolveIata(destination)]);
  if (!originIata || !destinationIata) {
    console.warn(`[duffel] could not resolve "${origin}" -> "${destination}" to IATA codes`);
    return [];
  }

  const flights = await searchOffers(originIata, destinationIata, departDate, returnDate);
  console.log(`[duffel] ${origin} -> ${destination}: ${flights.length} offers`);
  return flights;
}
