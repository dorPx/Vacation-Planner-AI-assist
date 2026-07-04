'use client';

import { useEffect, useState } from 'react';
import { useSearch } from '@/context/SearchContext';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../shared/types';
import { StarRating, CategoryBadge, priceLevelLabel } from '@/components/results/shared';
import type { TimeSlotItem } from './utils';

type Tab = 'hotels' | 'activities' | 'restaurants';

export interface ItemPickerModalProps {
  open: boolean;
  /** The itinerary's destination — used to warn if SearchContext's cached results are for a different place. */
  destination: string;
  onClose: () => void;
  onPick: (item: TimeSlotItem) => void;
}

function destinationsRoughlyMatch(a: string, b: string): boolean {
  if (!a || !b) return true;
  const norm = (s: string) => s.toLowerCase().split(',')[0].trim();
  return norm(a) === norm(b) || norm(a).includes(norm(b)) || norm(b).includes(norm(a));
}

export default function ItemPickerModal({ open, destination, onClose, onPick }: ItemPickerModalProps) {
  const { results, lastParams } = useSearch();
  const [tab, setTab] = useState<Tab>('hotels');
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) setQuery('');
  }, [open]);

  if (!open) return null;

  const cacheMatchesDestination = destinationsRoughlyMatch(destination, lastParams?.destination ?? '');
  const q = query.trim().toLowerCase();

  const hotels = (results?.hotels ?? []).filter((h) => h.name.toLowerCase().includes(q));
  const activities = (results?.activities ?? []).filter(
    (a) => a.name.toLowerCase().includes(q) || a.category.toLowerCase().includes(q)
  );
  const restaurants = (results?.restaurants ?? []).filter(
    (r) => r.name.toLowerCase().includes(q) || r.cuisine.toLowerCase().includes(q)
  );

  function handlePick(item: TimeSlotItem) {
    onPick(item);
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center px-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-beige-300">
          <h3 className="text-base font-semibold text-brand-black">Add to itinerary</h3>
          <button type="button" onClick={onClose} className="text-brand-mid hover:text-brand-black text-lg leading-none">
            ✕
          </button>
        </div>

        <div className="px-5 pt-3">
          <input
            type="text"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search…"
            className="w-full border border-beige-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300"
          />
        </div>

        <div className="flex gap-1 px-5 pt-3 border-b border-beige-200">
          {(['hotels', 'activities', 'restaurants'] as Tab[]).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-3 py-2 text-sm font-medium capitalize transition-colors relative ${
                tab === t ? 'text-brand-black' : 'text-brand-mid hover:text-brand-black'
              }`}
            >
              {t}
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-sky-300" />}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {!results && (
            <p className="text-sm text-brand-mid text-center py-8">
              No cached results yet — run a search from the home page first.
            </p>
          )}

          {results && !cacheMatchesDestination && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-2">
              Your cached results are for &quot;{lastParams?.destination}&quot;, not &quot;{destination}&quot;. Search for{' '}
              {destination} on the home page to populate this list.
            </p>
          )}

          {results && cacheMatchesDestination && tab === 'hotels' && (
            <HotelRows hotels={hotels} onPick={handlePick} />
          )}
          {results && cacheMatchesDestination && tab === 'activities' && (
            <ActivityRows activities={activities} onPick={handlePick} />
          )}
          {results && cacheMatchesDestination && tab === 'restaurants' && (
            <RestaurantRows restaurants={restaurants} onPick={handlePick} />
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyRow() {
  return <p className="text-sm text-brand-mid text-center py-8">No matches.</p>;
}

function HotelRows({ hotels, onPick }: { hotels: HotelResult[]; onPick: (item: TimeSlotItem) => void }) {
  if (!hotels.length) return <EmptyRow />;
  return (
    <>
      {hotels.map((h) => (
        <button
          key={h.id}
          type="button"
          onClick={() => onPick({ kind: 'hotel', item: h })}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-beige-300 hover:bg-beige-100 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-medium text-brand-black">{h.name}</p>
            <StarRating rating={h.rating} reviewCount={h.review_count} />
          </div>
          <span className="text-sky-400 font-semibold text-sm whitespace-nowrap">
            ${h.price_per_night.toFixed(0)}/night
          </span>
        </button>
      ))}
    </>
  );
}

function ActivityRows({ activities, onPick }: { activities: ActivityResult[]; onPick: (item: TimeSlotItem) => void }) {
  if (!activities.length) return <EmptyRow />;
  return (
    <>
      {activities.map((a) => (
        <button
          key={a.id}
          type="button"
          onClick={() => onPick({ kind: 'activity', item: a })}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-beige-300 hover:bg-beige-100 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-medium text-brand-black">{a.name}</p>
            <CategoryBadge label={a.category} />
          </div>
          <span className="text-sky-400 font-semibold text-sm whitespace-nowrap">
            {a.price > 0 ? `$${a.price.toFixed(0)}` : 'Free'}
          </span>
        </button>
      ))}
    </>
  );
}

function RestaurantRows({
  restaurants,
  onPick,
}: {
  restaurants: RestaurantResult[];
  onPick: (item: TimeSlotItem) => void;
}) {
  if (!restaurants.length) return <EmptyRow />;
  return (
    <>
      {restaurants.map((r) => (
        <button
          key={r.id}
          type="button"
          onClick={() => onPick({ kind: 'restaurant', item: r })}
          className="w-full flex items-center justify-between gap-3 p-3 rounded-lg border border-beige-300 hover:bg-beige-100 transition-colors text-left"
        >
          <div>
            <p className="text-sm font-medium text-brand-black">{r.name}</p>
            <CategoryBadge label={r.cuisine} />
          </div>
          <span className="text-brand-mid font-semibold text-sm whitespace-nowrap">
            {priceLevelLabel(r.price_level)}
          </span>
        </button>
      ))}
    </>
  );
}
