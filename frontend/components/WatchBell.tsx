'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checkWatchedDrops } from '@/lib/priceWatch';

// Header bell — badge shows how many watched hotels have really dropped in
// price since they were watched. Links home, where the alerts strip has the
// details. Renders as a plain bell (no badge) when nothing dropped.

export default function WatchBell() {
  const [dropCount, setDropCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    checkWatchedDrops().then((alerts) => {
      if (!cancelled) setDropCount(alerts.length);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Link
      href="/"
      aria-label={
        dropCount > 0
          ? `${dropCount} watched hotel${dropCount === 1 ? '' : 's'} dropped in price — see details`
          : 'Price watch — no drops right now'
      }
      title={dropCount > 0 ? `${dropCount} price drop${dropCount === 1 ? '' : 's'} on watched hotels` : 'Price watch'}
      className="relative flex items-center justify-center w-8 h-8 rounded-lg border border-beige-300 bg-white text-brand-mid hover:text-brand-black hover:border-brand-mid transition-colors"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
      {dropCount > 0 && (
        <span className="absolute -top-1.5 -right-1.5 min-w-[1.1rem] h-[1.1rem] px-1 inline-flex items-center justify-center bg-emerald-500 text-[#fff] text-[10px] font-bold rounded-full">
          {dropCount}
        </span>
      )}
    </Link>
  );
}
