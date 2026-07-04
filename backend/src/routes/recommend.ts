import { Router, Request, Response } from 'express';
import { readCache, makeCacheKey, scrapeAllWithMeta } from '../scrapers/orchestrator';
import { aiEngine, diffDaysInclusive } from '../ai/openrouter';
import { classifyInterests } from '../services/interestClassifier.service';
import { fetchDetailedPlan, formatForPrompt } from '../services/rapidApiTripPlanner.service';
import { streamItinerary } from '../services/openRouterClient.service';
import type { SearchParams } from '../../../shared/types';

const router = Router();

// Bound on the pre-stream supplementary gather. The RapidAPI generator needs
// ~7-20s cold, so 15s trades time-to-first-token for an actual hit rate;
// warm-cache requests skip the wait entirely. Revisit once pre-warming lands.
const SUPPLEMENTARY_TIMEOUT_MS = 15_000;

// ---------------------------------------------------------------------------
// POST /api/recommend/stream
// ---------------------------------------------------------------------------

router.post('/stream', async (req: Request, res: Response) => {
  const { destination, budget, dates, model, trip_type, interests, useSupplementarySources } = req.body as {
    destination: string;
    budget: number;
    dates: { start: string; end: string };
    model: string;
    trip_type?: string;
    /** Free-text traveler interests — mapped onto the trip planner's closed vocabulary. */
    interests?: string[];
    /** Per-request toggle for the supplementary RapidAPI source (Phase 4 testing flag). */
    useSupplementarySources?: boolean;
  };

  if (!destination || !budget || !dates?.start || !dates?.end || !model) {
    return res.status(400).json({
      error: 'Missing required fields: destination, budget, dates.start, dates.end, model are all required.',
    });
  }

  const params: SearchParams = { destination, checkin: dates.start, checkout: dates.end };
  const cached = readCache(makeCacheKey(params));

  if (!useSupplementarySources) {
    // Legacy path — byte-for-byte the behavior the frontend already consumes.
    await aiEngine.streamItinerary(
      {
        destination,
        budget,
        start_date: dates.start,
        end_date: dates.end,
        model,
        trip_type,
        scraped_data: cached ?? {},
      },
      res
    );
    return;
  }

  // --- Supplementary path -------------------------------------------------
  // Open the SSE pipe first so the client sees the connection immediately;
  // the supplementary gather happens before the first data event.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders?.();

  const days = diffDaysInclusive(dates.start, dates.end);

  // allSettled: supplementary sources are garnish — a rejected one is skipped
  // silently and must never take the itinerary down with it. (fetchDetailedPlan
  // already resolves null on failure; allSettled is the belt to that suspender,
  // and the array shape leaves room for more supplementary sources later.)
  const settled = await Promise.allSettled([
    (async () => {
      const mapped = await classifyInterests(interests ?? []);
      return fetchDetailedPlan({ destination, days, interests: mapped }, { timeoutMs: SUPPLEMENTARY_TIMEOUT_MS });
    })(),
  ]);

  const plan = settled[0].status === 'fulfilled' ? settled[0].value : null;
  const supplementaryContext = plan ? formatForPrompt(plan) : undefined;
  if (plan) {
    const sample = plan.itinerary[0]?.activities.slice(0, 3).map((a) => a.location).join(', ') ?? '';
    console.log(`[recommend] supplementary plan attached (${plan.itinerary.length} days; sample locations: ${sample})`);
  } else {
    console.log('[recommend] no supplementary plan (failed or timed out) — continuing without');
  }

  try {
    const stream = streamItinerary({
      destination,
      days,
      preferences: {
        budget,
        start_date: dates.start,
        end_date: dates.end,
        trip_type,
        model,
        scraped_data: cached ?? {},
      },
      supplementaryContext,
    });
    // Same event framing the legacy engine writes — the frontend EventSource
    // parser must not need changes.
    for await (const chunk of stream) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
  } catch (err: unknown) {
    res.write(`data: ${JSON.stringify({ error: err instanceof Error ? err.message : String(err) })}\n\n`);
  }
  res.write('data: [DONE]\n\n');
  res.end();
});

// ---------------------------------------------------------------------------
// POST /api/recommend/random-trip
// ---------------------------------------------------------------------------

router.post('/random-trip', async (req: Request, res: Response) => {
  const { budget, dates, model } = req.body as {
    budget: number;
    dates: { start: string; end: string };
    model: string;
  };

  if (!budget || !dates?.start || !dates?.end || !model) {
    return res.status(400).json({
      error: 'Missing required fields: budget, dates.start, dates.end, model are all required.',
    });
  }

  const { destination, trip_type, rationale } = await aiEngine.generateRandomTrip({
    budget,
    start_date: dates.start,
    end_date: dates.end,
    model,
  });

  // Warm the cache for this destination so /stream has live data to draw on
  try {
    await scrapeAllWithMeta({ destination, checkin: dates.start, checkout: dates.end });
  } catch (err: unknown) {
    console.error('[recommend/random-trip] scrape warm-up failed:', err instanceof Error ? err.message : err);
  }

  return res.json({
    destination,
    trip_type,
    rationale,
    stream_url: '/api/recommend/stream',
    // Convenience payload the client can POST straight to stream_url
    stream_body: { destination, budget, dates, model, trip_type },
  });
});

export default router;
