'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import { useWeather, weatherGlyph } from '@/components/WeatherStrip';
import type { TripSummary } from '../../../shared/types';

// "Your next trip" — the personal reason to come back. Shows the nearest
// upcoming saved trip with a countdown, forecast (when inside the window),
// packing progress, and quick actions. Hidden when there's no upcoming trip.

interface PackingStored {
  list?: { categories?: { items: string[] }[] };
  checked?: string[];
}

function packingProgress(tripId: string): { done: number; total: number } | null {
  try {
    const raw = window.localStorage.getItem(`voyager:packing:${tripId}`);
    if (!raw) return null;
    const stored = JSON.parse(raw) as PackingStored;
    const total = stored.list?.categories?.reduce((n, c) => n + c.items.length, 0) ?? 0;
    if (!total) return null;
    return { done: stored.checked?.length ?? 0, total };
  } catch {
    return null;
  }
}

function daysUntil(dateStr: string): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${dateStr}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export default function NextTripCard() {
  const [trip, setTrip] = useState<TripSummary | null>(null);
  const [packing, setPacking] = useState<{ done: number; total: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.itinerary
      .list()
      .then((trips) => {
        if (cancelled) return;
        const upcoming = trips
          .filter((t) => t.start_date && daysUntil(t.start_date) >= 0)
          .sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
        if (upcoming) {
          setTrip(upcoming);
          setPacking(packingProgress(upcoming.id));
        }
      })
      .catch(() => {
        /* no trips — section hides */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const weather = useWeather(trip?.destination, trip?.start_date, trip?.end_date);

  if (!trip) return null;

  const days = daysUntil(trip.start_date);
  const countdown = days === 0 ? 'Today!' : days === 1 ? 'Tomorrow!' : `${days} days to go`;

  return (
    <section aria-label="Your next trip">
      <div className="bg-gradient-to-r from-sky-500 to-sky-400 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[rgba(255,255,255,0.8)] text-xs font-semibold uppercase tracking-wide mb-0.5">Your next trip</p>
          <p className="text-[#fff] text-2xl font-extrabold leading-tight">
            {countdown} <span className="font-semibold">· {trip.destination}</span>
          </p>
          <p className="text-[rgba(255,255,255,0.85)] text-sm mt-0.5">
            {trip.start_date} → {trip.end_date}
            {packing && ` · Packed ${packing.done}/${packing.total}`}
          </p>
          {weather.length > 0 && (
            <p className="text-[rgba(255,255,255,0.9)] text-sm mt-1.5" aria-label="Forecast">
              {weather.slice(0, 5).map((w) => (
                <span key={w.date} className="mr-3 whitespace-nowrap">
                  {weatherGlyph(w.weather_code).icon} {w.temp_max_c}°
                </span>
              ))}
            </p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            href={`/trips/${trip.id}`}
            className="bg-white text-brand-black hover:bg-beige-100 text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Open trip
          </Link>
          <a
            href={api.itinerary.exportIcsUrl(trip.id)}
            className="border border-[rgba(255,255,255,0.6)] text-[#fff] hover:bg-[rgba(255,255,255,0.15)] text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
          >
            Calendar
          </a>
        </div>
      </div>
    </section>
  );
}
