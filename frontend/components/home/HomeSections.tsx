'use client';

import { useSearch } from '@/context/SearchContext';
import WatchAlerts from './WatchAlerts';
import NextTripCard from './NextTripCard';
import DealsStrip from './DealsStrip';
import DestinationGallery from './DestinationGallery';

// The pre-search home body. Every section is data-driven and hides itself
// when empty; the whole block unmounts once a search is running or showing,
// keeping the results view exactly as dense as before.

const STEPS: { title: string; text: string }[] = [
  { title: 'Search once', text: 'One search sweeps Booking.com, Hotels.com, TripAdvisor, Airbnb, LiteAPI and Google — live.' },
  { title: 'Compare real listings', text: 'Honest prices with recorded history, reviews, maps, and side-by-side comparison.' },
  { title: 'Let AI build the days', text: 'Tell the planner a city and a vibe — it drafts a day-by-day trip from real, bookable listings.' },
];

function HowItWorks() {
  return (
    <section aria-label="How Voyager works">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {STEPS.map((step, i) => (
          <div key={step.title} className="bg-white border border-beige-300 rounded-xl p-4">
            <p className="text-xs font-bold text-sky-400 mb-1">Step {i + 1}</p>
            <p className="text-sm font-bold text-brand-black mb-1">{step.title}</p>
            <p className="text-xs text-brand-mid leading-relaxed">{step.text}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function HomeSections() {
  const { results, loading } = useSearch();
  if (results || loading) return null;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
      <WatchAlerts />
      <NextTripCard />
      <DealsStrip />
      <DestinationGallery />
      <HowItWorks />
    </div>
  );
}
