'use client';

import { useEffect, useRef } from 'react';
import { APIProvider, Map, useMap, useMapsLibrary } from '@vis.gl/react-google-maps';
import { MarkerClusterer } from '@googlemaps/markerclusterer';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../shared/types';
import { useSearch } from '@/context/SearchContext';
import { useMapSync } from './useMapSync';
import RadiusDraw from './RadiusDraw';

const GOOGLE_MAPS_API_KEY = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ?? '';

type MarkerKind = 'hotel' | 'activity' | 'restaurant';

const MARKER_STYLE: Record<MarkerKind, { bg: string; svg: string }> = {
  hotel: {
    bg: '#378ADD',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M3 21h18M5 21V8l7-5 7 5v13M9 21v-6h6v6"/></svg>',
  },
  activity: {
    bg: '#16a34a',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M5 21V4l13 4-13 4"/></svg>',
  },
  restaurant: {
    bg: '#f97316',
    svg: '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M7 3v8M5 3v4a2 2 0 0 0 4 0V3M17 3v18M17 3a3 3 0 0 0-3 3v4h6"/></svg>',
  },
};

function escapeHtml(text: string): string {
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildPinElement(kind: MarkerKind): HTMLDivElement {
  const { bg, svg } = MARKER_STYLE[kind];
  const el = document.createElement('div');
  el.style.cssText = `background:${bg};width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 1px 4px rgba(0,0,0,0.4);border:2px solid white;`;
  el.innerHTML = svg;
  return el;
}

function hotelPopup(h: HotelResult): string {
  const priceLine =
    h.price_per_night > 0
      ? `<p style="margin:0 0 2px;color:#378ADD;font-weight:700;">$${h.price_per_night.toFixed(0)}/night</p>`
      : '';
  const dealLink = h.booking_url
    ? `<a href="${escapeHtml(h.booking_url)}" target="_blank" rel="noopener noreferrer" style="color:#185FA5;font-weight:600;">View Deal</a>`
    : '';
  return `<div style="font-family:inherit;min-width:160px;">
    <p style="font-weight:600;margin:0 0 4px;">${escapeHtml(h.name)}</p>
    ${priceLine}
    <p style="margin:0 0 6px;color:#5F5E5A;font-size:12px;">${h.rating.toFixed(1)}★ (${h.review_count})</p>
    ${dealLink}
  </div>`;
}

function activityPopup(a: ActivityResult): string {
  return `<div style="font-family:inherit;min-width:160px;">
    <p style="font-weight:600;margin:0 0 4px;">${escapeHtml(a.name)}</p>
    <p style="margin:0 0 2px;color:#378ADD;font-weight:700;">${a.price > 0 ? `$${a.price.toFixed(0)}` : 'Free'}</p>
    <p style="margin:0;color:#5F5E5A;font-size:12px;">${a.rating.toFixed(1)}★ · ${escapeHtml(a.category)}</p>
  </div>`;
}

function restaurantPopup(r: RestaurantResult): string {
  return `<div style="font-family:inherit;min-width:160px;">
    <p style="font-weight:600;margin:0 0 4px;">${escapeHtml(r.name)}</p>
    <p style="margin:0 0 2px;color:#5F5E5A;">${'$'.repeat(Math.max(1, Math.min(4, r.price_level)))}</p>
    <p style="margin:0;color:#5F5E5A;font-size:12px;">${r.rating.toFixed(1)}★ · ${escapeHtml(r.cuisine)}</p>
  </div>`;
}

interface MarkerLayerProps {
  hotels: HotelResult[];
  activities: ActivityResult[];
  restaurants: RestaurantResult[];
}

function MarkerLayer({ hotels, activities, restaurants }: MarkerLayerProps) {
  const map = useMap();
  const markerLib = useMapsLibrary('marker');
  const { lastParams } = useSearch();
  const { registerMarker, unregisterMarker, handleMarkerClick } = useMapSync();
  const clustererRef = useRef<MarkerClusterer | null>(null);
  const infoWindowRef = useRef<google.maps.InfoWindow | null>(null);

  useEffect(() => {
    if (!map || !markerLib) return undefined;

    if (!infoWindowRef.current) {
      infoWindowRef.current = new google.maps.InfoWindow();
    }

    clustererRef.current?.clearMarkers();
    clustererRef.current = new MarkerClusterer({ map });

    const ids: string[] = [];
    const bounds = new google.maps.LatLngBounds();
    let hasPoints = false;

    function addMarker(id: string, lat: number, lng: number, kind: MarkerKind, popupHtml: string) {
      if (!lat && !lng) return;

      const marker = new google.maps.marker.AdvancedMarkerElement({
        position: { lat, lng },
        content: buildPinElement(kind),
      });

      marker.addListener('gmp-click', () => {
        infoWindowRef.current?.setContent(popupHtml);
        infoWindowRef.current?.open({ map, anchor: marker });
        handleMarkerClick(id);
      });

      clustererRef.current?.addMarker(marker);
      registerMarker(id, marker);
      ids.push(id);
      bounds.extend({ lat, lng });
      hasPoints = true;
    }

    hotels.forEach((h) => addMarker(h.id, h.lat, h.lng, 'hotel', hotelPopup(h)));
    activities.forEach((a) => addMarker(a.id, a.lat, a.lng, 'activity', activityPopup(a)));
    restaurants.forEach((r) => addMarker(r.id, r.lat, r.lng, 'restaurant', restaurantPopup(r)));

    // Don't fight the user's drawn radius viewport with an auto fit.
    if (!lastParams?.radius_km) {
      if (hasPoints) {
        map.fitBounds(bounds, 40);
      } else {
        map.setCenter({ lat: 20, lng: 0 });
        map.setZoom(2);
      }
    }

    return () => {
      ids.forEach((id) => unregisterMarker(id));
      clustererRef.current?.clearMarkers();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, markerLib, hotels, activities, restaurants]);

  return null;
}

export interface TravelMapProps {
  hotels: HotelResult[];
  activities: ActivityResult[];
  restaurants: RestaurantResult[];
}

export default function TravelMap({ hotels, activities, restaurants }: TravelMapProps) {
  const { lastParams, clearRadiusFilter } = useSearch();
  const hasRadius = !!lastParams?.radius_km;

  return (
    <div className="relative w-full h-full rounded-xl overflow-hidden border border-beige-300">
      <APIProvider apiKey={GOOGLE_MAPS_API_KEY}>
        <Map
          mapId="DEMO_MAP_ID"
          defaultCenter={{ lat: 20, lng: 0 }}
          defaultZoom={2}
          gestureHandling="greedy"
          disableDefaultUI={false}
          style={{ width: '100%', height: '100%' }}
        >
          <MarkerLayer hotels={hotels} activities={activities} restaurants={restaurants} />
          <RadiusDraw />
        </Map>
      </APIProvider>

      {hasRadius && (
        <button
          type="button"
          onClick={() => clearRadiusFilter()}
          className="absolute top-3 right-3 z-10 bg-white hover:bg-beige-100 text-brand-black text-xs font-semibold px-3 py-1.5 rounded-lg shadow border border-beige-300 transition-colors"
        >
          Clear radius
        </button>
      )}
    </div>
  );
}
