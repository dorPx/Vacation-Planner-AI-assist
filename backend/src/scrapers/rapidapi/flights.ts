import axios from 'axios';
import type { FlightResult } from '../../../../shared/types';
import { rapidApiHeaders } from './client';

const GOOGLE_FLIGHTS_HOST = 'google-flights2.p.rapidapi.com';
const GOOGLE_FLIGHTS_BASE = `https://${GOOGLE_FLIGHTS_HOST}/api/v1`;

const SKY_SCRAPPER_HOST = 'sky-scrapper.p.rapidapi.com';
const SKY_SCRAPPER_BASE = `https://${SKY_SCRAPPER_HOST}/api/v1/flights`;

// ---------------------------------------------------------------------------
// Google Flights (google-flights2) — real Google Flights data.
// Location IDs are Google Knowledge Graph MIDs (e.g. "/m/02_286"), resolved
// via searchAirport before the actual flight search call.
// ---------------------------------------------------------------------------

interface GoogleAirportSuggestion {
  id?: string;
  title?: string;
}

async function resolveGoogleFlightsLocation(query: string): Promise<string | null> {
  try {
    const res = await axios.get<{ data?: GoogleAirportSuggestion[] }>(`${GOOGLE_FLIGHTS_BASE}/searchAirport`, {
      params: { query },
      headers: rapidApiHeaders(GOOGLE_FLIGHTS_HOST),
      timeout: 10_000,
    });
    return res.data?.data?.[0]?.id ?? null;
  } catch (err: unknown) {
    console.error('[rapidapi/flights/google] resolveLocation error:', err instanceof Error ? err.message : err);
    return null;
  }
}

interface GoogleFlightLeg {
  airline?: string;
  departure_airport?: { time?: string };
  arrival_airport?: { time?: string };
}

interface GoogleFlightItinerary {
  duration?: { raw?: number };
  flights?: GoogleFlightLeg[];
  price?: number;
  stops?: number;
}

function normaliseGoogleFlight(f: GoogleFlightItinerary, index: number): FlightResult | null {
  const legs = f.flights ?? [];
  if (!legs.length) return null;
  const first = legs[0];
  const last = legs[legs.length - 1];

  return {
    id: `google-flight-${index}`,
    airline: first.airline ?? 'Unknown',
    price: f.price ?? 0,
    departure: first.departure_airport?.time ?? '',
    arrival: last.arrival_airport?.time ?? '',
    duration_minutes: f.duration?.raw ?? 0,
    stops: f.stops ?? 0,
    source: 'google-flights',
  };
}

async function searchGoogleFlights(
  originId: string,
  destinationId: string,
  outboundDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  try {
    const res = await axios.get<{ data?: { itineraries?: { topFlights?: GoogleFlightItinerary[]; otherFlights?: GoogleFlightItinerary[] } } }>(
      `${GOOGLE_FLIGHTS_BASE}/searchFlights`,
      {
        params: {
          departure_id: originId,
          arrival_id: destinationId,
          outbound_date: outboundDate,
          return_date: returnDate,
          travel_class: 'ECONOMY',
          adults: '1',
          currency: 'USD',
        },
        headers: rapidApiHeaders(GOOGLE_FLIGHTS_HOST),
        timeout: 20_000,
      }
    );
    const all = [
      ...(res.data?.data?.itineraries?.topFlights ?? []),
      ...(res.data?.data?.itineraries?.otherFlights ?? []),
    ];
    return all
      .slice(0, 20)
      .map((f, i) => normaliseGoogleFlight(f, i))
      .filter((f): f is FlightResult => f !== null);
  } catch (err: unknown) {
    console.error('[rapidapi/flights/google] searchFlights error:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function scrapeGoogleFlights(origin: string, destination: string, outboundDate: string, returnDate: string): Promise<FlightResult[]> {
  const [originId, destinationId] = await Promise.all([
    resolveGoogleFlightsLocation(origin),
    resolveGoogleFlightsLocation(destination),
  ]);
  if (!originId || !destinationId) {
    console.warn(`[rapidapi/flights/google] could not resolve "${origin}" -> "${destination}"`);
    return [];
  }
  return searchGoogleFlights(originId, destinationId, outboundDate, returnDate);
}

// ---------------------------------------------------------------------------
// Sky-Scrapper (sky-scrapper) — secondary flight source for redundancy.
// Needs BOTH a skyId and an entityId per airport, resolved via searchAirport.
// ---------------------------------------------------------------------------

interface SkyAirportSuggestion {
  navigation?: {
    relevantFlightParams?: { skyId?: string; entityId?: string };
  };
}

interface SkyLocation {
  skyId: string;
  entityId: string;
}

async function resolveSkyLocation(query: string): Promise<SkyLocation | null> {
  try {
    const res = await axios.get<{ data?: SkyAirportSuggestion[] }>(`${SKY_SCRAPPER_BASE}/searchAirport`, {
      params: { query },
      headers: rapidApiHeaders(SKY_SCRAPPER_HOST),
      timeout: 10_000,
    });
    const params = res.data?.data?.[0]?.navigation?.relevantFlightParams;
    if (!params?.skyId || !params.entityId) return null;
    return { skyId: params.skyId, entityId: params.entityId };
  } catch (err: unknown) {
    console.error('[rapidapi/flights/sky] resolveLocation error:', err instanceof Error ? err.message : err);
    return null;
  }
}

interface SkyLeg {
  origin?: { displayCode?: string };
  destination?: { displayCode?: string };
  durationInMinutes?: number;
  departure?: string;
  arrival?: string;
  stopCount?: number;
  carriers?: { marketing?: { name?: string }[] };
}

interface SkyItinerary {
  id?: string;
  price?: { raw?: number };
  legs?: SkyLeg[];
}

function normaliseSkyFlight(f: SkyItinerary, index: number): FlightResult | null {
  const leg = f.legs?.[0];
  if (!leg) return null;

  return {
    id: `sky-flight-${f.id ?? index}`,
    airline: leg.carriers?.marketing?.[0]?.name ?? 'Unknown',
    price: f.price?.raw ?? 0,
    departure: leg.departure ?? '',
    arrival: leg.arrival ?? '',
    duration_minutes: leg.durationInMinutes ?? 0,
    stops: leg.stopCount ?? 0,
    source: 'skyscanner',
  };
}

async function searchSkyFlights(origin: SkyLocation, destination: SkyLocation, date: string, returnDate: string): Promise<FlightResult[]> {
  try {
    const res = await axios.get<{ data?: { itineraries?: SkyItinerary[] } }>(`${SKY_SCRAPPER_BASE}/searchFlights`, {
      params: {
        originSkyId: origin.skyId,
        originEntityId: origin.entityId,
        destinationSkyId: destination.skyId,
        destinationEntityId: destination.entityId,
        date,
        returnDate,
        cabinClass: 'economy',
        adults: 1,
        currency: 'USD',
      },
      headers: rapidApiHeaders(SKY_SCRAPPER_HOST),
      timeout: 20_000,
    });
    const items = res.data?.data?.itineraries ?? [];
    return items
      .slice(0, 20)
      .map((f, i) => normaliseSkyFlight(f, i))
      .filter((f): f is FlightResult => f !== null);
  } catch (err: unknown) {
    console.error('[rapidapi/flights/sky] searchFlights error:', err instanceof Error ? err.message : err);
    return [];
  }
}

async function scrapeSkyFlights(origin: string, destination: string, date: string, returnDate: string): Promise<FlightResult[]> {
  const [originLoc, destinationLoc] = await Promise.all([resolveSkyLocation(origin), resolveSkyLocation(destination)]);
  if (!originLoc || !destinationLoc) {
    console.warn(`[rapidapi/flights/sky] could not resolve "${origin}" -> "${destination}"`);
    return [];
  }
  return searchSkyFlights(originLoc, destinationLoc, date, returnDate);
}

// ---------------------------------------------------------------------------
// Public API — merges both sources, deduped on a composite key since neither
// provider shares a common id space.
// ---------------------------------------------------------------------------

export function dedupeFlights(flights: FlightResult[]): FlightResult[] {
  const seen = new Set<string>();
  const out: FlightResult[] = [];
  for (const f of flights) {
    const key = `${f.airline.toLowerCase()}|${f.departure}|${f.stops}|${Math.round(f.price)}`;
    if (!seen.has(key)) {
      seen.add(key);
      out.push(f);
    }
  }
  return out;
}

export async function scrapeFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  const [googleFlights, skyFlights] = await Promise.all([
    scrapeGoogleFlights(origin, destination, departDate, returnDate),
    scrapeSkyFlights(origin, destination, departDate, returnDate),
  ]);

  const merged = dedupeFlights([...googleFlights, ...skyFlights]);
  console.log(`[rapidapi/flights] ${origin} -> ${destination}: ${googleFlights.length} google + ${skyFlights.length} sky = ${merged.length} merged`);
  return merged;
}
