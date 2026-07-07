'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useCurrency } from '@/context/CurrencyContext';
import { titleCase, searchUrl } from './shared';
import type { PriceDeal } from '../../../shared/types';

// "Deals right now" — real recorded price drops from the price_history table.
// Honest urgency: every number here was actually observed on a scrape. The
// whole section hides when no drops are recorded yet (fresh installs).

export default function DealsStrip() {
  const [deals, setDeals] = useState<PriceDeal[]>([]);
  const { format } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    api.getDeals().then(({ deals }) => {
      if (!cancelled) setDeals(deals);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!deals.length) return null;

  return (
    <section aria-label="Price drops we've recorded">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold text-brand-black">Deals right now</h2>
        <p className="text-xs text-brand-mid">Real price drops we&apos;ve recorded — not marketing.</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {deals.map((deal) => (
          <a
            key={`${deal.destination}-${deal.hotel_name}`}
            href={searchUrl(titleCase(deal.destination))}
            className="group bg-white border border-beige-300 rounded-xl p-4 hover:shadow-lg hover:border-emerald-300 transition-all"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-700 text-xs font-bold px-2 py-0.5 rounded-full">
                ↓ {deal.drop_pct}%
              </span>
              <span className="text-xs text-brand-mid truncate">{titleCase(deal.destination.split(',')[0])}</span>
            </div>
            <p className="text-sm font-semibold text-brand-black leading-snug line-clamp-2 mb-1.5">
              {titleCase(deal.hotel_name)}
            </p>
            <p className="text-sm">
              <span className="text-brand-mid line-through mr-1.5">{format(deal.was_price)}</span>
              <span className="font-bold text-emerald-600">{format(deal.now_price)}</span>
              <span className="text-xs text-brand-mid"> /night</span>
            </p>
            <p className="text-xs font-semibold text-sky-400 group-hover:underline mt-2">Search {titleCase(deal.destination.split(',')[0])} →</p>
          </a>
        ))}
      </div>
    </section>
  );
}
