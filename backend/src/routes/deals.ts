import { Router, Request, Response } from 'express';
import { db, cache } from '../db';
import type { PriceDeal } from '../../../shared/types';

const router = Router();

// GET /api/deals — the home page's "Deals right now" feed plus per-destination
// "from $X/night" floor prices for the inspiration gallery.
//
// Everything here is REAL recorded data from the price_history table (written
// on every scrape) — no invented urgency. A deal is a hotel whose newest
// observation is ≥8% below an earlier observation in the last 30 days.
// Fail-soft: empty lists when nothing qualifies yet (fresh installs).

const DEALS_CACHE_KEY = 'deals:home';
const DEALS_CACHE_TTL_SECONDS = 10 * 60;
const WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const MIN_PRICE_WINDOW_MS = 14 * 24 * 60 * 60 * 1000;
const MIN_DROP_FRACTION = 0.08;
const MAX_DEALS = 8;

interface DealsPayload {
  deals: PriceDeal[];
  /** Lowercased destination -> cheapest recorded nightly price (last 14 days). */
  min_prices: Record<string, number>;
}

function computeDeals(): DealsPayload {
  const since = Date.now() - WINDOW_MS;

  // Newest observation per (destination, hotel) vs the max earlier price in
  // the window — a real recorded drop, not a marketing countdown.
  const dealRows = db
    .prepare(
      `WITH latest AS (
         SELECT destination, hotel_key, price, observed_at,
                ROW_NUMBER() OVER (PARTITION BY destination, hotel_key ORDER BY observed_at DESC) AS rn
         FROM price_history
         WHERE observed_at >= ? AND price > 0
       )
       SELECT l.destination, l.hotel_key, l.price AS now_price, l.observed_at,
              MAX(h.price) AS was_price
       FROM latest l
       JOIN price_history h
         ON h.destination = l.destination
        AND h.hotel_key = l.hotel_key
        AND h.observed_at < l.observed_at
        AND h.observed_at >= ?
        AND h.price > 0
       WHERE l.rn = 1
       GROUP BY l.destination, l.hotel_key
       HAVING (MAX(h.price) - l.price) * 1.0 / MAX(h.price) >= ?
       ORDER BY (MAX(h.price) - l.price) * 1.0 / MAX(h.price) DESC
       LIMIT ?`
    )
    .all(since, since, MIN_DROP_FRACTION, MAX_DEALS) as Array<{
    destination: string;
    hotel_key: string;
    now_price: number;
    observed_at: number;
    was_price: number;
  }>;

  const deals: PriceDeal[] = dealRows.map((r) => ({
    destination: r.destination,
    hotel_name: r.hotel_key,
    was_price: Math.round(r.was_price),
    now_price: Math.round(r.now_price),
    drop_pct: Math.round(((r.was_price - r.now_price) / r.was_price) * 100),
    observed_at: r.observed_at,
  }));

  const minRows = db
    .prepare(
      `SELECT destination, MIN(price) AS min_price
       FROM price_history
       WHERE observed_at >= ? AND price > 0
       GROUP BY destination`
    )
    .all(Date.now() - MIN_PRICE_WINDOW_MS) as Array<{ destination: string; min_price: number }>;

  const min_prices: Record<string, number> = {};
  for (const row of minRows) min_prices[row.destination] = Math.round(row.min_price);

  return { deals, min_prices };
}

router.get('/', (_req: Request, res: Response) => {
  const cached = cache.get<DealsPayload>(DEALS_CACHE_KEY);
  if (cached) return res.json(cached);

  try {
    const payload = computeDeals();
    cache.set(DEALS_CACHE_KEY, payload, DEALS_CACHE_TTL_SECONDS);
    return res.json(payload);
  } catch (err: unknown) {
    console.error('[deals] failed:', err instanceof Error ? err.message : err);
    return res.json({ deals: [], min_prices: {} });
  }
});

export default router;
