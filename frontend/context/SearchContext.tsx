'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import type { HotelResult, ActivityResult, FlightResult, RestaurantResult, SearchParams } from '../../shared/types';
import { api, ApiError } from '@/lib/api';

export interface SearchResults {
  hotels: HotelResult[];
  activities: ActivityResult[];
  flights: FlightResult[];
  restaurants: RestaurantResult[];
  cached: boolean;
  cache_age_minutes: number;
}

export type SortOption = 'best_value' | 'price_asc' | 'price_desc' | 'rating' | 'distance';

/** Review-score buckets on the 10-point scale (ratings are stored 0-5; score = rating × 2). */
export type ReviewScoreBucket = 9 | 8 | 7 | 6;

export interface ResultFilters {
  priceMin: number;
  priceMax: number;
  /**
   * Selected review-score buckets ("Wonderful: 9+", "Very good: 8+", ...).
   * Booking.com semantics: each bucket means "score X and up", so multiple
   * selections resolve to the lowest selected threshold. Empty = no filter.
   */
  reviewScores: ReviewScoreBucket[];
  amenities: string[];
  /** Source labels to show, e.g. "Booking.com" — empty array means no filter (show all) */
  sources: string[];
  sortBy: SortOption;
}

export const DEFAULT_FILTERS: ResultFilters = {
  priceMin: 0,
  // Unbounded by default — a fixed cap would silently hide legitimately
  // expensive hotels from a fresh result set. The sidebar clamps the slider
  // to the result set's real price bounds.
  priceMax: Number.MAX_SAFE_INTEGER,
  reviewScores: [],
  amenities: [],
  sources: [],
  sortBy: 'best_value',
};

interface SearchContextValue {
  results: SearchResults | null;
  setResults: (results: SearchResults | null) => void;
  loading: boolean;
  setLoading: (loading: boolean) => void;
  error: string;
  setError: (error: string) => void;
  /** Non-fatal "still showing what we have" message, e.g. a 503 from a scraper. */
  banner: string | null;
  setBanner: (banner: string | null) => void;
  /** The SearchParams used for the most recent search — drives live price polling and the map. */
  lastParams: SearchParams | null;
  setLastParams: (params: SearchParams | null) => void;
  /** Merges partial params into lastParams and re-runs the search — used by the map's radius draw tool. */
  updateParams: (partial: Partial<SearchParams>) => Promise<void>;
  /** Drops lat/lng/radius_km and re-runs the search. */
  clearRadiusFilter: () => Promise<void>;
  /** id of the hotel currently hovered in the results list — drives map marker bounce highlight. */
  hoveredHotelId: string | null;
  setHoveredHotelId: (id: string | null) => void;
  /** Client-side filters applied to the cached results — never trigger a re-fetch. */
  filters: ResultFilters;
  setFilters: (filters: ResultFilters) => void;
}

const SearchContext = createContext<SearchContextValue | undefined>(undefined);

export function SearchProvider({ children }: { children: ReactNode }) {
  const [results, setResultsState] = useState<SearchResults | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [banner, setBanner] = useState<string | null>(null);
  const [lastParams, setLastParams] = useState<SearchParams | null>(null);
  const [hoveredHotelId, setHoveredHotelId] = useState<string | null>(null);
  const [filters, setFilters] = useState<ResultFilters>(DEFAULT_FILTERS);

  // A brand-new result set resets filters to their defaults — a stale
  // "$50-$80" price filter from a prior destination would otherwise silently
  // hide every hotel in a fresh, more expensive search.
  const setResults = useCallback((next: SearchResults | null) => {
    setResultsState(next);
    setFilters(DEFAULT_FILTERS);
  }, []);

  const runSearch = useCallback(
    async (params: SearchParams) => {
      setError('');
      setBanner(null);
      setLoading(true);
      try {
        const data = await api.search(params);
        setResults(data);
        setLastParams(params);
      } catch (err: unknown) {
        if (err instanceof ApiError) {
          if (err.status === 429) {
            // Toast already shown by lib/api.ts — leave existing results/lastParams untouched.
            return;
          }
          if (err.status === 503 && results) {
            setBanner(
              `Live prices temporarily unavailable — showing cached results from ${results.cache_age_minutes} minute${
                results.cache_age_minutes === 1 ? '' : 's'
              } ago.`
            );
            return;
          }
        }
        setError(err instanceof Error ? err.message : 'Search failed.');
      } finally {
        setLoading(false);
      }
    },
    [results, setResults]
  );

  const updateParams = useCallback(
    async (partial: Partial<SearchParams>) => {
      if (!lastParams) return;
      await runSearch({ ...lastParams, ...partial });
    },
    [lastParams, runSearch]
  );

  const clearRadiusFilter = useCallback(async () => {
    if (!lastParams) return;
    const { lat: _lat, lng: _lng, radius_km: _radiusKm, ...rest } = lastParams;
    await runSearch(rest);
  }, [lastParams, runSearch]);

  return (
    <SearchContext.Provider
      value={{
        results,
        setResults,
        loading,
        setLoading,
        error,
        setError,
        banner,
        setBanner,
        lastParams,
        setLastParams,
        updateParams,
        clearRadiusFilter,
        hoveredHotelId,
        setHoveredHotelId,
        filters,
        setFilters,
      }}
    >
      {children}
    </SearchContext.Provider>
  );
}

export function useSearch(): SearchContextValue {
  const ctx = useContext(SearchContext);
  if (!ctx) throw new Error('useSearch must be used within a SearchProvider');
  return ctx;
}
