// Small UI primitives + formatting helpers shared across the results cards.

export function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="w-8 h-8 border-2 border-sky-200 border-t-sky-400 rounded-full animate-spin" />
      {label && <p className="text-sm text-brand-mid">{label}</p>}
    </div>
  );
}

export function StarRating({ rating, reviewCount }: { rating: number; reviewCount?: number }) {
  const full = Math.round(rating);
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span className="text-sky-300">
        {'★'.repeat(Math.min(full, 5))}
        {'☆'.repeat(Math.max(0, 5 - full))}
      </span>
      <span className="text-brand-mid">{rating.toFixed(1)}</span>
      {typeof reviewCount === 'number' && reviewCount > 0 && (
        <span className="text-brand-mid">({reviewCount.toLocaleString()})</span>
      )}
    </span>
  );
}

const CATEGORY_PALETTE = [
  { bg: 'bg-sky-100', text: 'text-sky-500' },
  { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  { bg: 'bg-amber-100', text: 'text-amber-700' },
  { bg: 'bg-purple-100', text: 'text-purple-700' },
  { bg: 'bg-pink-100', text: 'text-pink-700' },
  { bg: 'bg-orange-100', text: 'text-orange-700' },
  { bg: 'bg-teal-100', text: 'text-teal-700' },
];

/** Deterministically maps an arbitrary category/cuisine string to a stable color pair. */
export function categoryColor(label: string): { bg: string; text: string } {
  let hash = 0;
  for (let i = 0; i < label.length; i++) {
    hash = (hash * 31 + label.charCodeAt(i)) % CATEGORY_PALETTE.length;
  }
  return CATEGORY_PALETTE[Math.abs(hash) % CATEGORY_PALETTE.length];
}

export function CategoryBadge({ label }: { label: string }) {
  const { bg, text } = categoryColor(label);
  return (
    <span className={`inline-block ${bg} ${text} text-[10px] font-medium px-2 py-0.5 rounded-full whitespace-nowrap`}>
      {label}
    </span>
  );
}

export function priceLevelLabel(level: number): string {
  return '$'.repeat(Math.max(1, Math.min(4, Math.round(level))));
}

export function formatDuration(minutes: number): string {
  if (!minutes) return '';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `${h}h ${m}m` : `${h}h`;
}

export function formatTime(isoOrTime: string): string {
  if (!isoOrTime) return '—';
  const d = new Date(isoOrTime);
  if (Number.isNaN(d.getTime())) return isoOrTime;
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ---------------------------------------------------------------------------
// Amenity icons — minimal inline SVGs, keyed by fuzzy-matched amenity text.
// ---------------------------------------------------------------------------

function WifiIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M5 12.5a11 11 0 0 1 14 0" />
      <path d="M8.5 16a6 6 0 0 1 7 0" />
      <path d="M12 19.5h.01" />
    </svg>
  );
}
function PoolIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 17c1.5 1 3 1 4.5 0s3-1 4.5 0 3 1 4.5 0 3-1 4.5 0" />
      <path d="M6 13V6a2 2 0 0 1 2-2h2v9" />
      <path d="M14 13V8a1 1 0 0 1 1-1h3" />
    </svg>
  );
}
function GymIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4 8v8M2 10v4M20 8v8M22 10v4M7 12h10" />
    </svg>
  );
}
function BreakfastIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M3 8h13a3 3 0 0 1 0 6h-1" />
      <path d="M3 8v6a4 4 0 0 0 4 4h4a4 4 0 0 0 4-4V8" />
      <path d="M6 2c0 1-1 1-1 2s1 1 1 2M10 2c0 1-1 1-1 2s1 1 1 2" />
    </svg>
  );
}
function ParkingIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="4" y="3" width="16" height="18" rx="2" />
      <path d="M9 16V7h3a3 3 0 0 1 0 6H9" />
    </svg>
  );
}
function PetIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="6" cy="9" r="1.6" />
      <circle cx="11" cy="6" r="1.6" />
      <circle cx="16" cy="9" r="1.6" />
      <circle cx="18.5" cy="13.5" r="1.6" />
      <path d="M8 19c-1.5-3 1-5 3.5-5s5 2 3.5 5c-1 2-6 2-7 0Z" />
    </svg>
  );
}
function DotIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="12" cy="12" r="4" />
    </svg>
  );
}

const AMENITY_ICON_MAP: Array<{ match: RegExp; icon: () => JSX.Element }> = [
  { match: /wi[\s-]?fi|internet/i, icon: WifiIcon },
  { match: /pool/i, icon: PoolIcon },
  { match: /gym|fitness/i, icon: GymIcon },
  { match: /breakfast/i, icon: BreakfastIcon },
  { match: /park/i, icon: ParkingIcon },
  { match: /pet/i, icon: PetIcon },
];

export function amenityIcon(label: string) {
  const found = AMENITY_ICON_MAP.find((entry) => entry.match.test(label));
  return found ? found.icon : DotIcon;
}

export function AmenityChip({ label }: { label: string }) {
  const Icon = amenityIcon(label);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-brand-mid bg-beige-100 px-2 py-1 rounded-md">
      <Icon />
      {label}
    </span>
  );
}
