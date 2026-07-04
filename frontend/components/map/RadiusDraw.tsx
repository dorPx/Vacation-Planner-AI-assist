'use client';

import { useEffect, useRef, useState } from 'react';
import { useMap } from '@vis.gl/react-google-maps';
import { useSearch } from '@/context/SearchContext';

const DEFAULT_RADIUS_METERS = 5000;

function metersToKm(meters: number): number {
  return Math.round((meters / 1000) * 10) / 10;
}

/**
 * Radius-filter circle tool. Google deprecated DrawingManager (it's an empty
 * stub class as of Maps JS API 3.65+ — no constructor, no methods), so this
 * uses the still-fully-supported alternative Google's own docs now point to:
 * an editable/draggable google.maps.Circle. Click "Draw radius", then click
 * the map to place a circle; drag its edge to resize, drag the circle itself
 * to move it. Renders its own trigger button (top-left) since there's no
 * automatic "draw mode" cursor without DrawingManager.
 */
export default function RadiusDraw() {
  const map = useMap();
  const { updateParams, lastParams } = useSearch();
  const circleRef = useRef<google.maps.Circle | null>(null);
  const [armed, setArmed] = useState(false);

  function syncFromCircle(circle: google.maps.Circle) {
    const center = circle.getCenter();
    if (!center) return;
    updateParams({ lat: center.lat(), lng: center.lng(), radius_km: metersToKm(circle.getRadius()) });
  }

  // Arm/disarm the "click map to place a circle" listener.
  useEffect(() => {
    if (!map || !armed) return undefined;

    const clickListener = map.addListener('click', (e: google.maps.MapMouseEvent) => {
      if (!e.latLng) return;

      circleRef.current?.setMap(null);

      const circle = new google.maps.Circle({
        map,
        center: e.latLng,
        radius: DEFAULT_RADIUS_METERS,
        editable: true,
        draggable: true,
        fillColor: '#85B7EB',
        fillOpacity: 0.3,
        strokeColor: '#185FA5',
        strokeWeight: 2,
      });
      circleRef.current = circle;

      circle.addListener('radius_changed', () => syncFromCircle(circle));
      circle.addListener('center_changed', () => syncFromCircle(circle));
      syncFromCircle(circle);

      setArmed(false);
    });

    return () => google.maps.event.removeListener(clickListener);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, armed]);

  // When the radius filter is cleared elsewhere (the "Clear radius" button in
  // TravelMap), drop the drawn circle from the map too.
  useEffect(() => {
    if (!lastParams?.radius_km) {
      circleRef.current?.setMap(null);
      circleRef.current = null;
    }
  }, [lastParams?.radius_km]);

  return (
    <button
      type="button"
      onClick={() => setArmed((v) => !v)}
      className={`absolute top-3 left-3 z-10 text-xs font-semibold px-3 py-1.5 rounded-lg shadow border transition-colors ${
        armed
          ? 'bg-sky-300 text-white border-sky-300'
          : 'bg-white hover:bg-beige-100 text-brand-black border-beige-300'
      }`}
    >
      {armed ? 'Click map to place…' : 'Draw radius'}
    </button>
  );
}
