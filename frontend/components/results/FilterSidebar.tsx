'use client';

import { useMemo } from 'react';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { useSearch, DEFAULT_FILTERS, type ReviewScoreBucket } from '@/context/SearchContext';
import {
  AMENITY_LABELS,
  SOURCE_LABELS,
  REVIEW_SCORE_BUCKETS,
  countFilterOptions,
  countActiveFilters,
} from './filters';

function CheckRow({
  label,
  checked,
  count,
  onToggle,
}: {
  label: string;
  checked: boolean;
  count: number;
  onToggle: () => void;
}) {
  // Zero-count unchecked options are dead ends — booking.com greys them out.
  const dead = count === 0 && !checked;
  return (
    <label
      className={`flex items-center gap-2 py-1 text-sm ${
        dead ? 'text-brand-mid/60 cursor-default' : 'text-brand-dark cursor-pointer'
      }`}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        disabled={dead}
        className="accent-sky-400 w-4 h-4 shrink-0 disabled:opacity-40"
      />
      <span className="flex-1 min-w-0 truncate">{label}</span>
      <span className={`text-xs tabular-nums ${dead ? 'text-brand-mid/60' : 'text-brand-mid'}`}>{count}</span>
    </label>
  );
}

function FilterGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-4 border-t border-beige-200 first:border-t-0">
      <p className="text-sm font-bold text-brand-black mb-2">{title}</p>
      {children}
    </div>
  );
}

function PriceRangeSlider({
  bounds,
  valueMin,
  valueMax,
  onChange,
}: {
  bounds: { min: number; max: number };
  valueMin: number;
  valueMax: number;
  onChange: (min: number, max: number) => void;
}) {
  const span = Math.max(1, bounds.max - bounds.min);
  const percentMin = ((valueMin - bounds.min) / span) * 100;
  const percentMax = ((valueMax - bounds.min) / span) * 100;

  return (
    <div className="relative h-5 flex items-center">
      <div className="absolute inset-x-0 h-1.5 bg-beige-200 rounded-full" />
      <div
        className="absolute h-1.5 bg-sky-300 rounded-full"
        style={{ left: `${percentMin}%`, right: `${100 - percentMax}%` }}
      />
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        value={valueMin}
        onChange={(e) => onChange(Math.min(Number(e.target.value), valueMax - 1), valueMax)}
        className="range-thumb absolute w-full appearance-none bg-transparent"
        aria-label="Minimum price"
      />
      <input
        type="range"
        min={bounds.min}
        max={bounds.max}
        value={valueMax}
        onChange={(e) => onChange(valueMin, Math.max(Number(e.target.value), valueMin + 1))}
        className="range-thumb absolute w-full appearance-none bg-transparent"
        aria-label="Maximum price"
      />
    </div>
  );
}

/** Booking.com's signature "Show on map" tile above the filter box. */
function MapPreviewTile() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = searchParams.get('map') === '1';
  if (showMap) return null;

  function openMap() {
    const params = new URLSearchParams(searchParams.toString());
    params.set('map', '1');
    router.push(`${pathname}?${params.toString()}`, { scroll: false });
  }

  return (
    <div className="relative overflow-hidden rounded-xl border border-beige-300 bg-sky-100 h-24 mb-3">
      {/* Stylized map background: streets + water, no fake data implied */}
      <svg className="absolute inset-0 w-full h-full text-sky-200" viewBox="0 0 280 96" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
        <rect width="280" height="96" fill="#EAF3FC" />
        <path d="M0 70 Q70 55 140 68 T280 62 V96 H0 Z" fill="#B5D4F4" opacity="0.7" />
        <g stroke="#FFFFFF" strokeWidth="3">
          <path d="M20 0 V96 M75 0 V96 M130 0 V80 M195 0 V96 M250 0 V96" />
          <path d="M0 22 H280 M0 48 H190" />
        </g>
        <g fill="#185FA5">
          <circle cx="75" cy="22" r="4" />
          <circle cx="195" cy="48" r="4" />
          <circle cx="130" cy="60" r="4" />
        </g>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <button
          type="button"
          onClick={openMap}
          className="bg-sky-400 hover:bg-sky-500 text-white text-sm font-semibold px-4 py-2 rounded-lg shadow transition-colors"
        >
          Show on map
        </button>
      </div>
    </div>
  );
}

function SidebarContent() {
  const { results, filters, setFilters } = useSearch();
  const hotels = useMemo(() => results?.hotels ?? [], [results]);

  const priceBounds = useMemo(() => {
    const prices = hotels.map((h) => h.price_per_night).filter((p) => p > 0);
    if (!prices.length) return { min: 0, max: 2000 };
    return { min: Math.floor(Math.min(...prices)), max: Math.ceil(Math.max(...prices)) };
  }, [hotels]);

  const counts = useMemo(() => countFilterOptions(hotels, filters), [hotels, filters]);
  const activeCount = countActiveFilters(filters, priceBounds);

  function update(partial: Partial<typeof filters>) {
    setFilters({ ...filters, ...partial });
  }

  function toggleScore(bucket: ReviewScoreBucket) {
    update({
      reviewScores: filters.reviewScores.includes(bucket)
        ? filters.reviewScores.filter((b) => b !== bucket)
        : [...filters.reviewScores, bucket],
    });
  }

  function toggleAmenity(a: string) {
    update({ amenities: filters.amenities.includes(a) ? filters.amenities.filter((x) => x !== a) : [...filters.amenities, a] });
  }

  function toggleSource(s: string) {
    update({ sources: filters.sources.includes(s) ? filters.sources.filter((x) => x !== s) : [...filters.sources, s] });
  }

  // Hide amenity rows that no hotel in this result set could ever satisfy —
  // most sources don't report amenities, and a column of dead "0" rows reads
  // as broken rather than filterable.
  const availableAmenities = AMENITY_LABELS.filter((a) => counts.amenities[a] > 0 || filters.amenities.includes(a));
  const availableSources = SOURCE_LABELS.filter((s) => counts.sources[s] > 0 || filters.sources.includes(s));

  return (
    <div className="bg-white border border-beige-300 rounded-xl overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-beige-300 bg-beige-50">
        <h2 className="text-sm font-bold text-brand-black">Filter by:</h2>
        {activeCount > 0 && (
          <button
            type="button"
            onClick={() => setFilters({ ...DEFAULT_FILTERS, priceMin: priceBounds.min, priceMax: priceBounds.max, sortBy: filters.sortBy })}
            className="text-xs font-medium text-sky-400 hover:text-sky-500 hover:underline transition-colors"
          >
            Clear all ({activeCount})
          </button>
        )}
      </div>

      <FilterGroup title="Your budget (per night)">
        <p className="text-sm text-brand-dark mb-2 tabular-nums">
          ${Math.max(filters.priceMin, priceBounds.min).toLocaleString()} – $
          {Math.min(filters.priceMax, priceBounds.max).toLocaleString()}
          {filters.priceMax >= priceBounds.max ? '+' : ''}
        </p>
        <PriceRangeSlider
          bounds={priceBounds}
          valueMin={Math.max(filters.priceMin, priceBounds.min)}
          valueMax={Math.min(filters.priceMax, priceBounds.max)}
          onChange={(min, max) => update({ priceMin: min, priceMax: max })}
        />
      </FilterGroup>

      <FilterGroup title="Review score">
        {REVIEW_SCORE_BUCKETS.map(({ bucket, label }) => (
          <CheckRow
            key={bucket}
            label={label}
            checked={filters.reviewScores.includes(bucket)}
            count={counts.reviewScores[bucket]}
            onToggle={() => toggleScore(bucket)}
          />
        ))}
      </FilterGroup>

      {availableAmenities.length > 0 && (
        <FilterGroup title="Amenities">
          {availableAmenities.map((a) => (
            <CheckRow
              key={a}
              label={a}
              checked={filters.amenities.includes(a)}
              count={counts.amenities[a]}
              onToggle={() => toggleAmenity(a)}
            />
          ))}
        </FilterGroup>
      )}

      <FilterGroup title="Source">
        {availableSources.map((s) => (
          <CheckRow
            key={s}
            label={s}
            checked={filters.sources.includes(s)}
            count={counts.sources[s]}
            onToggle={() => toggleSource(s)}
          />
        ))}
      </FilterGroup>
    </div>
  );
}

export default function FilterSidebar({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <>
      {/* Desktop: in-flow rail, sticky inside the results row. */}
      <aside className="hidden lg:block w-[270px] shrink-0">
        <div className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto pr-0.5">
          <MapPreviewTile />
          <SidebarContent />
        </div>
      </aside>

      {/* Mobile: slide-in drawer */}
      {open && (
        <div className="lg:hidden fixed inset-0 z-[70]">
          <div className="absolute inset-0 bg-black/40" onClick={onClose} />
          <div className="absolute left-0 top-0 bottom-0 w-[300px] bg-beige-50 shadow-2xl overflow-y-auto">
            <div className="flex items-center justify-between px-4 py-3 border-b border-beige-300 bg-white">
              <span className="text-sm font-bold text-brand-black">Filters</span>
              <button
                type="button"
                onClick={onClose}
                aria-label="Close filters"
                className="text-brand-mid hover:text-brand-black text-lg leading-none w-8 h-8 flex items-center justify-center"
              >
                ✕
              </button>
            </div>
            <div className="p-3">
              <SidebarContent />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
