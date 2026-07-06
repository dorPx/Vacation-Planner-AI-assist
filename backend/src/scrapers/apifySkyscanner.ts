import { runApifyActor } from './apifyClient';
import { resolveIata } from './duffel';
import type { FlightResult } from '../../../shared/types';

// Skyscanner flight fares via the Apify actor makework36/flight-price-scraper.
// It needs IATA codes, so free-text origin/destination are resolved first
// (reusing Duffel's resolver, with a 3-letter-code shortcut). Fast in practice
// (~5s), so it's safe as a live flight source. Fail-soft throughout.

const ACTOR = 'makework36~flight-price-scraper';
const TIMEOUT_MS = 35_000;
const MAX_FLIGHTS = 20;

interface SkyscannerItem {
  airline?: string;
  bestPrice?: number;
  currency?: string;
  departTime?: string;
  arriveTime?: string | null;
  duration?: string;
  durationMinutes?: number;
  stops?: number;
  links?: { book?: string | null; googleFlights?: string | null; kiwi?: string | null };
}

/** "27h 45m" -> 1665. */
function parseDuration(text?: string): number {
  if (!text) return 0;
  const h = /(\d+)\s*h/.exec(text)?.[1] ?? '0';
  const m = /(\d+)\s*m/.exec(text)?.[1] ?? '0';
  return parseInt(h, 10) * 60 + parseInt(m, 10);
}

function normalise(item: SkyscannerItem, index: number): FlightResult | null {
  if (!(Number(item.bestPrice) > 0)) return null;
  const bookingUrl = item.links?.book || item.links?.googleFlights || '';
  return {
    id: `skyscanner-${index}`,
    airline: item.airline || 'Unknown',
    price: Number(item.bestPrice),
    departure: item.departTime ?? '',
    arrival: item.arriveTime ?? '',
    duration_minutes: item.durationMinutes ?? parseDuration(item.duration),
    stops: item.stops ?? 0,
    source: 'skyscanner',
    ...(bookingUrl ? { booking_url: bookingUrl } : {}),
  };
}

export async function scrapeSkyscannerFlights(
  origin: string,
  destination: string,
  departDate: string,
  returnDate: string
): Promise<FlightResult[]> {
  const [originIata, destinationIata] = await Promise.all([resolveIata(origin), resolveIata(destination)]);
  if (!originIata || !destinationIata) {
    console.warn(`[apify/skyscanner] could not resolve "${origin}" -> "${destination}" to IATA codes`);
    return [];
  }

  const items = await runApifyActor<SkyscannerItem>(
    ACTOR,
    {
      origin: originIata,
      destination: destinationIata,
      departDate,
      returnDate,
      adults: 1,
      cabinClass: 'ECONOMY',
      currency: 'USD',
      maxFlights: MAX_FLIGHTS,
    },
    { timeoutMs: TIMEOUT_MS }
  );

  const flights = items
    .map((item, i) => normalise(item, i))
    .filter((f): f is FlightResult => f !== null)
    .slice(0, MAX_FLIGHTS);
  console.log(`[apify/skyscanner] ${origin} -> ${destination}: ${flights.length} fares`);
  return flights;
}
