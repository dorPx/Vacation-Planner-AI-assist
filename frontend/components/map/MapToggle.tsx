'use client';

import { useRouter, usePathname, useSearchParams } from 'next/navigation';

export default function MapToggle() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const showMap = searchParams.get('map') === '1';

  function toggle() {
    const params = new URLSearchParams(searchParams.toString());
    if (showMap) {
      params.delete('map');
    } else {
      params.set('map', '1');
    }
    const qs = params.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className="text-xs font-medium border border-beige-300 bg-white hover:bg-beige-100 text-brand-black px-3 py-1.5 rounded-lg transition-colors"
    >
      {showMap ? 'Hide map' : 'Show map'}
    </button>
  );
}
