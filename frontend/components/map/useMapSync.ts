'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSearch } from '@/context/SearchContext';

type AdvancedMarker = google.maps.marker.AdvancedMarkerElement;

/**
 * Bridges the results list and the Google Map:
 * - register/unregisterMarker let TravelMap keep a live id -> AdvancedMarkerElement registry
 * - hovering a HotelCard (via SearchContext.hoveredHotelId) bounce-highlights its marker
 * - clicking a marker scrolls the matching card (#hotel-card-{id}) into view
 */
export function useMapSync() {
  const { hoveredHotelId } = useSearch();
  const markersRef = useRef<Map<string, AdvancedMarker>>(new Map());

  const registerMarker = useCallback((id: string, marker: AdvancedMarker) => {
    markersRef.current.set(id, marker);
  }, []);

  const unregisterMarker = useCallback((id: string) => {
    markersRef.current.delete(id);
  }, []);

  useEffect(() => {
    if (!hoveredHotelId) return undefined;
    const marker = markersRef.current.get(hoveredHotelId);
    const el = marker?.content as HTMLElement | undefined;
    if (!el) return undefined;

    el.classList.add('marker-bounce');
    return () => {
      el.classList.remove('marker-bounce');
    };
  }, [hoveredHotelId]);

  const handleMarkerClick = useCallback((id: string) => {
    document.getElementById(`hotel-card-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, []);

  return { markersRef, registerMarker, unregisterMarker, handleMarkerClick };
}
