'use client';

import { useEffect, useRef } from 'react';
import type { SearchParams, HotelResult } from '../../../shared/types';
import { showToast } from './toast';

const POLL_INTERVAL_MS = 60_000;
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface PriceChange {
  id: string;
  old_price: number;
  new_price: number;
  source: string;
}

/**
 * Polls /api/search/live-prices every 60s for the current search params and,
 * when any hotel price changes, calls onPriceChange with the updated hotel
 * list and fires a toast per changed hotel. Uses refs throughout so the
 * interval closure always sees the latest params/hotels without restarting.
 */
export function usePricePolling(
  params: SearchParams | null,
  hotels: HotelResult[],
  onPriceChange: (updatedHotels: HotelResult[], changes: PriceChange[]) => void
): void {
  const paramsRef = useRef(params);
  const hotelsRef = useRef(hotels);
  const onPriceChangeRef = useRef(onPriceChange);
  const rateLimitToastShownRef = useRef(false);

  useEffect(() => {
    paramsRef.current = params;
  }, [params]);

  useEffect(() => {
    hotelsRef.current = hotels;
  }, [hotels]);

  useEffect(() => {
    onPriceChangeRef.current = onPriceChange;
  }, [onPriceChange]);

  useEffect(() => {
    if (!params?.destination || !params.checkin || !params.checkout) return;

    const tick = async () => {
      const currentParams = paramsRef.current;
      if (!currentParams?.destination || !currentParams.checkin || !currentParams.checkout) return;

      try {
        const qs = new URLSearchParams({
          destination: currentParams.destination,
          checkin: currentParams.checkin,
          checkout: currentParams.checkout,
        });
        const res = await fetch(`${BASE}/api/search/live-prices?${qs.toString()}`, { cache: 'no-store' });

        if (res.status === 429) {
          if (!rateLimitToastShownRef.current) {
            rateLimitToastShownRef.current = true;
            showToast('Rate limit hit — results are cached, try again in 60 seconds');
          }
          return;
        }
        rateLimitToastShownRef.current = false;

        if (!res.ok) return;

        const data: { price_changes: PriceChange[] } = await res.json();
        if (!data.price_changes?.length) return;

        const currentHotels = hotelsRef.current;
        const byId = new Map(currentHotels.map((h) => [h.id, h]));
        let didUpdate = false;

        const updated = currentHotels.map((h) => {
          const change = data.price_changes.find((c) => c.id === h.id);
          if (change) {
            didUpdate = true;
            return { ...h, price_per_night: change.new_price };
          }
          return h;
        });

        if (didUpdate) {
          onPriceChangeRef.current(updated, data.price_changes);
          for (const change of data.price_changes) {
            const hotel = byId.get(change.id);
            if (hotel) showToast(`Price updated for ${hotel.name}`);
          }
        }
      } catch {
        // Polling failures shouldn't disrupt the UI — just skip this tick.
      }
    };

    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.destination, params?.checkin, params?.checkout]);
}
