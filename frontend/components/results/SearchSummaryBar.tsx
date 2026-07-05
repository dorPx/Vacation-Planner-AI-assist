'use client';

import { useEffect, useState } from 'react';
import { useSearch } from '@/context/SearchContext';

// Appears once the user scrolls past the hero: a compact, sticky recap of the
// active search with an "Edit" jump back to the search form. Serves the
// results-first / one-scroll principles — the search context stays reachable
// without scrolling all the way up manually.

const SHOW_AFTER_PX = 320;

export default function SearchSummaryBar({ stayCount }: { stayCount: number }) {
  const { lastParams } = useSearch();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > SHOW_AFTER_PX);
    }
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!lastParams) return null;

  const guests = (lastParams.adults ?? 2) + (lastParams.children ?? 0);

  function edit() {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Focus after the smooth scroll so the field is ready to type into.
    window.setTimeout(() => {
      document.getElementById('destination-input')?.focus();
    }, 400);
  }

  return (
    <div
      className={`fixed top-16 inset-x-0 z-40 bg-white/95 backdrop-blur border-b border-beige-300 shadow-sm transition-all duration-200 ${
        visible ? 'translate-y-0 opacity-100' : '-translate-y-4 opacity-0 pointer-events-none'
      }`}
      aria-hidden={!visible}
    >
      <div className="max-w-7xl mx-auto px-4 h-11 flex items-center justify-between gap-3">
        <p className="min-w-0 truncate text-sm text-brand-dark">
          <span className="font-semibold text-brand-black">{lastParams.destination.split(',')[0]}</span>
          <span className="text-brand-mid">
            {' · '}
            {lastParams.checkin} → {lastParams.checkout}
            {' · '}
            {guests} guest{guests === 1 ? '' : 's'}
            {' · '}
            {stayCount} stay{stayCount === 1 ? '' : 's'}
          </span>
        </p>
        <button
          type="button"
          onClick={edit}
          className="shrink-0 text-xs font-semibold text-sky-500 hover:text-sky-400 border border-beige-300 hover:border-sky-300 rounded-lg px-3 py-1.5 transition-colors"
        >
          Edit search
        </button>
      </div>
    </div>
  );
}
