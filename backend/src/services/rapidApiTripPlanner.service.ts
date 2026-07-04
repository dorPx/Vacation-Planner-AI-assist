import axios from 'axios';
import { cache } from '../db';
import { rapidApiHeaders } from '../scrapers/rapidapi/client';
import { TRIP_PLANNER_INTERESTS, type TripPlannerInterest } from './interestClassifier.service';

// ---------------------------------------------------------------------------
// RapidAPI "AI Trip Planner" — supplementary itinerary suggestions that FEED
// the existing SSE itinerary builder (they never replace it and never block
// it). Every failure path returns null; this module never throws.
//
// Endpoint schema verified live on 2026-07-03 — see
// docs/rapidapi-trip-planner-schema.md.
// ---------------------------------------------------------------------------

// Supplementary source — a slow call must not stall itinerary generation, so
// the production default stays tight. Measured reality (2026-07-03): the API
// takes ~6-20s to generate a COLD plan, so at 5s most uncached calls will
// abort and return null. That is the intended fail-soft trade-off for the
// live SSE path; batch/warm-up callers (e.g. scripts/test-rapidapi.ts) pass a
// larger timeoutMs to actually collect responses into cache.
const DEFAULT_TIMEOUT_MS = 5_000;

// 5,000 requests/month on the current plan (x-ratelimit headers, 2026-07-03,
// ≈166/day) — 6h TTL keeps repeat destination+params lookups off the quota
// while staying fresher than the daily plan-content churn.
const CACHE_TTL_SECONDS = 6 * 60 * 60;

const VALID_INTERESTS = new Set<string>(TRIP_PLANNER_INTERESTS);

function host(): string {
  return process.env.RAPIDAPI_TRIP_PLANNER_HOST ?? 'ai-trip-planner.p.rapidapi.com';
}

// ---------------------------------------------------------------------------
// Types (mirror the verified response shape)
// ---------------------------------------------------------------------------

export interface TripPlanActivity {
  time: string;
  activity: string;
  location: string;
}

export interface TripPlanDay {
  day: number;
  activities: TripPlanActivity[];
}

export interface DetailedTripPlan {
  days: number;
  destination: string;
  budget: string;
  travelMode: string;
  /** Effective interests — the API echoes its defaults back when [] was sent. */
  interests: string[];
  itinerary: TripPlanDay[];
}

export interface FetchDetailedPlanParams {
  destination: string;
  days: number;
  /** Must already be vocabulary tokens (see interestClassifier) — unknown tokens are dropped here as a last line of defense. */
  interests?: string[];
  budget?: string;
  travelMode?: string;
}

export interface FetchDetailedPlanOptions {
  /** Override the tight production timeout for warm-up/dev callers. */
  timeoutMs?: number;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Renders a plan as a compact prompt block — raw JSON in prompts wastes
 * tokens and invites the model to echo structure instead of content.
 */
export function formatForPrompt(plan: DetailedTripPlan): string {
  const lines = [
    `Interests covered: ${plan.interests.join(', ')} (travel mode: ${plan.travelMode}, budget level: ${plan.budget})`,
  ];
  for (const day of plan.itinerary) {
    lines.push(`Day ${day.day}:`);
    for (const a of day.activities) {
      lines.push(`- ${a.time} ${a.activity} (${a.location})`);
    }
  }
  return lines.join('\n');
}

/**
 * Fetches a supplementary day-by-day plan. Returns null on ANY failure
 * (bad input, timeout, quota, schema drift) — callers must treat this data
 * as optional garnish, never a dependency.
 */
export async function fetchDetailedPlan(
  params: FetchDetailedPlanParams,
  options: FetchDetailedPlanOptions = {}
): Promise<DetailedTripPlan | null> {
  const destination = params.destination?.trim();
  const days = Math.round(params.days);
  if (!destination || !Number.isFinite(days) || days < 1) return null;

  // One out-of-vocabulary token 400s the entire request — drop strays silently.
  const interests = (params.interests ?? []).filter((i): i is TripPlannerInterest => VALID_INTERESTS.has(i));
  const budget = params.budget ?? 'medium';
  const travelMode = params.travelMode ?? 'walking';

  const key = `trip-planner:${destination.toLowerCase()}:${days}:${[...interests].sort().join(',')}:${budget}:${travelMode}`;

  const cached = cache.get<DetailedTripPlan>(key);
  if (cached) {
    console.log(`[trip-planner] cache hit: ${key}`);
    return cached;
  }
  console.log(`[trip-planner] cache miss: ${key}`);

  try {
    const res = await axios.post<{ plan?: DetailedTripPlan }>(
      `https://${host()}/detailed-plan`,
      { days, destination, interests, budget, travelMode },
      { headers: rapidApiHeaders(host()), timeout: options.timeoutMs ?? DEFAULT_TIMEOUT_MS }
    );

    const plan = res.data?.plan;
    // Schema drift or an error body must degrade to null, not a half-shaped object.
    if (!plan || !Array.isArray(plan.itinerary)) {
      console.warn('[trip-planner] unexpected response shape — skipping supplementary data');
      return null;
    }

    cache.set(key, plan, CACHE_TTL_SECONDS);
    return plan;
  } catch (err: unknown) {
    console.error('[trip-planner] fetch failed (supplementary, continuing without):', err instanceof Error ? err.message : err);
    return null;
  }
}
