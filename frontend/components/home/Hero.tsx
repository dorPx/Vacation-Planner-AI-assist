'use client';

import { useEffect, useState } from 'react';
import SearchBar from '@/components/SearchBar';
import { useSearch } from '@/context/SearchContext';

// Full-bleed photographic hero — the one-obvious-action pattern every major
// travel site converges on: emotional destination imagery, a headline that
// states the value, and the search front and center. Collapses to a compact
// band once results are showing so the page stays results-first.

const HERO_IMAGES = [
  // Santorini blue domes
  'https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?auto=format&fit=crop&w=1800&q=70',
  // Tropical beach
  'https://images.unsplash.com/photo-1507525428034-b723cf961d3e?auto=format&fit=crop&w=1800&q=70',
  // Dolomites lake
  'https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?auto=format&fit=crop&w=1800&q=70',
  // Kyoto pagoda at dusk
  'https://images.unsplash.com/photo-1545569341-9eb8b30979d9?auto=format&fit=crop&w=1800&q=70',
];

const TRUST_BADGES = ['6+ sources compared live', 'Prices never marked up', 'Real recorded price drops'];

export default function Hero() {
  const { results, loading } = useSearch();
  const compact = Boolean(results) || loading;

  // Rotate per visit — picked after mount so server and first client render
  // agree (no hydration mismatch), then the image cross-fades in.
  const [image, setImage] = useState(HERO_IMAGES[0]);
  useEffect(() => {
    setImage(HERO_IMAGES[Math.floor(Math.random() * HERO_IMAGES.length)]);
  }, []);

  return (
    <section className={`relative w-full transition-all ${compact ? 'py-6' : 'py-14 sm:py-24'}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={image}
        alt=""
        aria-hidden="true"
        className="absolute inset-0 w-full h-full object-cover"
      />
      {/* Dark scrim for WCAG-AA text contrast over any photo, both themes. */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/45 to-black/30" />

      <div className="relative max-w-5xl mx-auto px-4 text-center">
        {!compact && (
          <>
            <h1 className="text-4xl sm:text-5xl font-extrabold text-[#fff] tracking-tight mb-3 [text-wrap:balance] drop-shadow">
              Every price. One search.
            </h1>
            <p className="text-base sm:text-lg text-[rgba(255,255,255,0.9)] mb-8 max-w-2xl mx-auto [text-wrap:balance]">
              Live hotel, flight and activity prices from Booking.com, TripAdvisor, Google and more —
              compared honestly, never marked up.
            </p>
          </>
        )}

        <SearchBar />

        {!compact && (
          <ul className="mt-5 flex flex-wrap items-center justify-center gap-x-6 gap-y-2" aria-label="Why Voyager">
            {TRUST_BADGES.map((badge) => (
              <li key={badge} className="flex items-center gap-1.5 text-sm font-medium text-[rgba(255,255,255,0.9)]">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
                  <path d="m5 13 4 4L19 7" />
                </svg>
                {badge}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
