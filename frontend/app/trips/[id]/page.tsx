'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TripItinerary } from '../../../../shared/types';
import ItineraryView from '@/components/ItineraryView';
import ChatPanel from '@/components/ChatPanel';
import Link from 'next/link';

export default function TripDetailPage({ params }: { params: { id: string } }) {
  const [itinerary, setItinerary] = useState<TripItinerary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api.getTrip(params.id)
      .then(setItinerary)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [params.id]);

  if (loading) return <div className="text-center py-20 text-slate-400">Loading…</div>;
  if (error) return <div className="text-center py-20 text-red-500">{error}</div>;
  if (!itinerary) return null;

  return (
    <div className="flex gap-6 h-[calc(100vh-120px)]">
      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center gap-4 mb-6">
          <Link href="/trips" className="text-sm text-blue-600 hover:underline">← My Trips</Link>
          <h1 className="text-2xl font-bold text-slate-800">{itinerary.name}</h1>
        </div>
        <ItineraryView itinerary={itinerary} />
      </div>
      <div className="w-96 flex-shrink-0">
        <ChatPanel context={JSON.stringify({ destination: itinerary.destination, totalCost: itinerary.total_cost })} />
      </div>
    </div>
  );
}
