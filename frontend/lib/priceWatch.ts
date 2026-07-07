'use client';

import { api } from '@/lib/api';
import type { HotelResult } from '../../shared/types';

// Price watch — the re-engagement loop. Watching a hotel stores its current
// price locally; on later visits the watched set is checked against the
// backend's recorded price history and real drops surface as in-app alerts
// (header bell + home strip). No accounts or email — all localStorage.

const STORAGE_KEY = 'voyager:price-watch';
const DROP_THRESHOLD = 0.05; // alert at a ≥5% drop vs the watched price

export interface WatchedHotel {
  id: string;
  name: string;
  destination: string;
  watched_price: number;
  watched_at: number;
}

export interface WatchAlert {
  name: string;
  destination: string;
  watched_price: number;
  current_price: number;
  drop_pct: number;
}

export function readWatched(): WatchedHotel[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeWatched(list: WatchedHotel[]): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* best-effort */
  }
}

export function isWatched(id: string): boolean {
  return readWatched().some((w) => w.id === id);
}

/** Adds or removes a watch. Returns true when the hotel is now watched. */
export function toggleWatch(hotel: HotelResult, destination: string): boolean {
  const list = readWatched();
  const exists = list.some((w) => w.id === hotel.id);
  if (exists) {
    writeWatched(list.filter((w) => w.id !== hotel.id));
    return false;
  }
  writeWatched([
    {
      id: hotel.id,
      name: hotel.name,
      destination,
      watched_price: hotel.price_per_night,
      watched_at: Date.now(),
    },
    ...list,
  ].slice(0, 30));
  return true;
}

/** Re-baselines a watch to the current price (used to acknowledge an alert). */
export function acknowledgeWatch(name: string, destination: string, currentPrice: number): void {
  const key = name.toLowerCase().trim();
  writeWatched(
    readWatched().map((w) =>
      w.name.toLowerCase().trim() === key && w.destination === destination
        ? { ...w, watched_price: currentPrice, watched_at: Date.now() }
        : w
    )
  );
}

/**
 * Checks every watched hotel against the recorded price history and returns
 * the real drops (≥5% below the watched price). Fail-soft: [] on any error.
 */
export async function checkWatchedDrops(): Promise<WatchAlert[]> {
  const watched = readWatched();
  if (!watched.length) return [];

  // One history call per distinct destination.
  const byDestination = new Map<string, WatchedHotel[]>();
  for (const w of watched) {
    const list = byDestination.get(w.destination) ?? [];
    list.push(w);
    byDestination.set(w.destination, list);
  }

  const alerts: WatchAlert[] = [];
  await Promise.all(
    [...byDestination.entries()].map(async ([destination, hotels]) => {
      const history = await api.getPriceHistory(destination, hotels.map((h) => h.name));
      for (const w of hotels) {
        const points = history[w.name.toLowerCase().trim()];
        const latest = points?.[points.length - 1];
        if (!latest || !(w.watched_price > 0)) continue;
        if (latest.price <= w.watched_price * (1 - DROP_THRESHOLD)) {
          alerts.push({
            name: w.name,
            destination,
            watched_price: w.watched_price,
            current_price: latest.price,
            drop_pct: Math.round(((w.watched_price - latest.price) / w.watched_price) * 100),
          });
        }
      }
    })
  );

  return alerts.sort((a, b) => b.drop_pct - a.drop_pct);
}
