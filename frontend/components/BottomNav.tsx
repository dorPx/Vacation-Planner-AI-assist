'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function SearchIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
function MapIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18 3 21V6l6-3 6 3 6-3v15l-6 3-6-3Z" />
      <path d="M9 3v15M15 6v15" />
    </svg>
  );
}
function ItineraryIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M3 10h18M8 2v4M16 2v4" />
    </svg>
  );
}
function SavedIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 21 12 16l-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16Z" />
    </svg>
  );
}

interface NavItem {
  href: string;
  label: string;
  icon: () => JSX.Element;
  isActive: (pathname: string, isMapOn: boolean) => boolean;
}

const ITEMS: NavItem[] = [
  { href: '/', label: 'Search', icon: SearchIcon, isActive: (p, mapOn) => p === '/' && !mapOn },
  { href: '/?map=1', label: 'Map', icon: MapIcon, isActive: (p, mapOn) => p === '/' && mapOn },
  { href: '/itinerary', label: 'Itinerary', icon: ItineraryIcon, isActive: (p) => p.startsWith('/itinerary') },
  { href: '/trips', label: 'Saved', icon: SavedIcon, isActive: (p) => p.startsWith('/trips') },
];

function BottomNavInner() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const isMapOn = searchParams.get('map') === '1';

  return (
    <nav className="lg:hidden fixed bottom-0 inset-x-0 z-50 bg-white border-t border-beige-300 flex items-stretch">
      {ITEMS.map((item) => {
        const active = item.isActive(pathname, isMapOn);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`flex-1 flex flex-col items-center justify-center gap-1 py-2.5 transition-colors ${
              active ? 'text-sky-300' : 'text-brand-mid'
            }`}
          >
            <item.icon />
            <span className="text-[10px] font-medium">{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export default function BottomNav() {
  return (
    <Suspense fallback={null}>
      <BottomNavInner />
    </Suspense>
  );
}
