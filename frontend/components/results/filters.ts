import type { HotelResult } from '../../../shared/types';
import type { ResultFilters, ReviewScoreBucket } from '@/context/SearchContext';

// Mirrors the fuzzy amenity matching already used for AmenityChip icons in
// shared.tsx, extended with the extra labels the filter sidebar exposes.
const AMENITY_MATCHERS: Record<string, RegExp> = {
  WiFi: /wi[\s-]?fi|internet/i,
  Pool: /pool/i,
  Gym: /gym|fitness/i,
  'Free Breakfast': /breakfast/i,
  Parking: /park/i,
  'Pet-friendly': /pet/i,
  'Air Conditioning': /air.?condition|a\/c/i,
  Spa: /spa/i,
  Restaurant: /restaurant/i,
};

export const AMENITY_LABELS = Object.keys(AMENITY_MATCHERS);

export const SOURCE_LABELS = ['Booking.com', 'TripAdvisor', 'Hotels.com', 'Hotels.com Provider', 'Airbnb', 'Google'];

/** Booking.com's review-score vocabulary, mapped onto our 0-5 ratings (score = rating × 2). */
export const REVIEW_SCORE_BUCKETS: { bucket: ReviewScoreBucket; label: string }[] = [
  { bucket: 9, label: 'Wonderful: 9+' },
  { bucket: 8, label: 'Very good: 8+' },
  { bucket: 7, label: 'Good: 7+' },
  { bucket: 6, label: 'Pleasant: 6+' },
];

function hotelHasAmenity(hotel: HotelResult, label: string): boolean {
  const matcher = AMENITY_MATCHERS[label];
  if (!matcher) return false;
  return hotel.amenities.some((a) => matcher.test(a));
}

function sourceIs(source: string, label: string): boolean {
  const s = source.toLowerCase();
  if (label === 'Booking.com') return s.includes('booking');
  if (label === 'TripAdvisor') return s.includes('tripadvisor');
  if (label === 'Hotels.com Provider') return s.includes('hotels.com-provider');
  if (label === 'Hotels.com') return s.includes('hotels.com') && !s.includes('hotels.com-provider');
  if (label === 'Airbnb') return s.includes('airbnb');
  if (label === 'Google') return s.includes('google');
  return false;
}

function sourceMatches(source: string, selected: string[]): boolean {
  if (selected.length === 0) return true;
  return selected.some((label) => sourceIs(source, label));
}

/** Lowest selected threshold wins — "8+" ∪ "9+" is everything scoring 8 and up. */
function minScoreThreshold(buckets: ReviewScoreBucket[]): number {
  return buckets.length ? Math.min(...buckets) : 0;
}

function scoreMatches(rating: number, buckets: ReviewScoreBucket[]): boolean {
  const threshold = minScoreThreshold(buckets);
  return threshold === 0 || rating * 2 >= threshold;
}

// Filter groups, separable so per-option counts can be computed with "all
// OTHER groups applied" — booking.com's count semantics: the number next to
// "Pool" answers "how many results if I check Pool, keeping my other filters".
interface GroupMatch {
  price: boolean;
  score: boolean;
  amenities: boolean;
  sources: boolean;
}

function groupMatch(h: HotelResult, filters: ResultFilters): GroupMatch {
  return {
    price: !(h.price_per_night > 0 && (h.price_per_night < filters.priceMin || h.price_per_night > filters.priceMax)),
    score: scoreMatches(h.rating, filters.reviewScores),
    amenities: filters.amenities.length === 0 || filters.amenities.every((a) => hotelHasAmenity(h, a)),
    sources: sourceMatches(h.source, filters.sources),
  };
}

function matchesAll(m: GroupMatch): boolean {
  return m.price && m.score && m.amenities && m.sources;
}

function matchesAllExcept(m: GroupMatch, except: keyof GroupMatch): boolean {
  return (Object.keys(m) as (keyof GroupMatch)[]).every((k) => k === except || m[k]);
}

/** Per-option counts for the sidebar, each computed with the other groups' filters applied. */
export interface FilterCounts {
  reviewScores: Record<ReviewScoreBucket, number>;
  amenities: Record<string, number>;
  sources: Record<string, number>;
}

export function countFilterOptions(hotels: HotelResult[], filters: ResultFilters): FilterCounts {
  const counts: FilterCounts = {
    reviewScores: { 9: 0, 8: 0, 7: 0, 6: 0 },
    amenities: Object.fromEntries(AMENITY_LABELS.map((a) => [a, 0])),
    sources: Object.fromEntries(SOURCE_LABELS.map((s) => [s, 0])),
  };

  for (const h of hotels) {
    const m = groupMatch(h, filters);

    if (matchesAllExcept(m, 'score')) {
      for (const { bucket } of REVIEW_SCORE_BUCKETS) {
        if (h.rating * 2 >= bucket) counts.reviewScores[bucket]++;
      }
    }
    if (matchesAllExcept(m, 'amenities')) {
      for (const a of AMENITY_LABELS) {
        if (hotelHasAmenity(h, a)) counts.amenities[a]++;
      }
    }
    if (matchesAllExcept(m, 'sources')) {
      for (const s of SOURCE_LABELS) {
        if (sourceIs(h.source, s)) counts.sources[s]++;
      }
    }
  }

  return counts;
}

export function countActiveFilters(filters: ResultFilters, priceBounds: { min: number; max: number }): number {
  let n = 0;
  if (filters.priceMin > priceBounds.min || filters.priceMax < priceBounds.max) n++;
  n += filters.reviewScores.length + filters.amenities.length + filters.sources.length;
  return n;
}

export function filterHotels(hotels: HotelResult[], filters: ResultFilters): HotelResult[] {
  const filtered = hotels.filter((h) => matchesAll(groupMatch(h, filters)));

  const sorted = [...filtered];
  // Hotels with no price data (price_per_night === 0, e.g. Google Places
  // results) sort to the END for both price directions — "$0" leading a
  // cheapest-first list reads as broken.
  const priceOrUnknown = (h: HotelResult, direction: 1 | -1) =>
    h.price_per_night > 0 ? h.price_per_night * direction : Number.MAX_SAFE_INTEGER;
  switch (filters.sortBy) {
    case 'price_asc':
      sorted.sort((a, b) => priceOrUnknown(a, 1) - priceOrUnknown(b, 1));
      break;
    case 'price_desc':
      sorted.sort((a, b) => priceOrUnknown(a, -1) - priceOrUnknown(b, -1));
      break;
    case 'rating':
      sorted.sort((a, b) => b.rating - a.rating);
      break;
    case 'best_value':
      sorted.sort((a, b) => {
        const valueA = a.price_per_night > 0 ? a.rating / a.price_per_night : 0;
        const valueB = b.price_per_night > 0 ? b.rating / b.price_per_night : 0;
        return valueB - valueA;
      });
      break;
  }

  return sorted;
}

/** Applies the review-score + source filters generically to activities/restaurants, which share those fields with hotels. */
export function filterByRatingAndSource<T extends { rating: number; source: string }>(
  items: T[],
  filters: ResultFilters
): T[] {
  return items.filter((item) => {
    if (!scoreMatches(item.rating, filters.reviewScores)) return false;
    if (!sourceMatches(item.source, filters.sources)) return false;
    return true;
  });
}
