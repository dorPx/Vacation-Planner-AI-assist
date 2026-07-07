'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useCurrency } from '@/context/CurrencyContext';
import { searchUrl } from './shared';

// Destination inspiration — the emotional driver every travel site leads
// with, kept honest with a live "from $X/night" floor when we've actually
// recorded prices there. Images are static Unsplash hotlinks (keyless).

interface Destination {
  name: string;
  tagline: string;
  image: string;
}

const IMG = (id: string) => `https://images.unsplash.com/${id}?auto=format&fit=crop&w=800&q=60`;

const DESTINATIONS: Destination[] = [
  { name: 'Paris, France', tagline: 'Cafés, museums, golden light', image: IMG('photo-1502602898657-3e91760cbb34') },
  { name: 'Tokyo, Japan', tagline: 'Neon nights, quiet shrines', image: IMG('photo-1540959733332-eab4deabeeaf') },
  { name: 'Rome, Italy', tagline: 'Two thousand years per block', image: IMG('photo-1552832230-c0197dd311b5') },
  { name: 'Barcelona, Spain', tagline: 'Gaudí, beaches, late dinners', image: IMG('photo-1583422409516-2895a77efded') },
  { name: 'New York, USA', tagline: 'The city that fits every mood', image: IMG('photo-1496442226666-8d4d0e62e6e9') },
  { name: 'Lisbon, Portugal', tagline: 'Hills, tiles, pastel sunsets', image: IMG('photo-1585208798174-6cedd86e019a') },
  { name: 'Bali, Indonesia', tagline: 'Rice terraces to reef dives', image: IMG('photo-1537996194471-e657df975ab4') },
  { name: 'Kyoto, Japan', tagline: 'Temples, gardens, tea houses', image: IMG('photo-1493976040374-85c8e12f0c0e') },
];

export default function DestinationGallery() {
  const [minPrices, setMinPrices] = useState<Record<string, number>>({});
  const { format } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    api.getDeals().then(({ min_prices }) => {
      if (!cancelled) setMinPrices(min_prices);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Explore destinations">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-xl font-bold text-brand-black">Where to next?</h2>
        <p className="text-xs text-brand-mid">Live starting prices, updated as we scrape.</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {DESTINATIONS.map((d) => {
          const from = minPrices[d.name.toLowerCase()];
          const city = d.name.split(',')[0];
          return (
            <a
              key={d.name}
              href={searchUrl(d.name)}
              aria-label={`Search hotels in ${city}`}
              className="group relative rounded-xl overflow-hidden h-44 sm:h-52 block focus-visible:ring-2 focus-visible:ring-sky-300"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={d.image}
                alt={city}
                loading="lazy"
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
              {/* Literal whites: the themed `white` token goes dark in dark mode,
                  but text on a photo must stay white in both themes. */}
              <div className="absolute inset-x-0 bottom-0 p-3">
                <p className="text-[#fff] font-bold leading-tight">{city}</p>
                <p className="text-[rgba(255,255,255,0.8)] text-xs leading-snug">{d.tagline}</p>
                {from ? (
                  <p className="text-emerald-300 text-xs font-semibold mt-1">from {format(from)}/night</p>
                ) : (
                  <p className="text-[rgba(255,255,255,0.75)] text-xs font-medium mt-1 group-hover:text-[#fff]">Search live prices →</p>
                )}
              </div>
            </a>
          );
        })}
      </div>
    </section>
  );
}
