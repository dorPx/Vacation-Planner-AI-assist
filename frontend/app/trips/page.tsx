'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import type { TripItinerary } from '../../../shared/types';
import Link from 'next/link';

type TripSummary = Omit<TripItinerary, 'days'> & {
  start_date?: string;
  end_date?: string;
  budget_usd?: number;
  created_at?: string;
};

export default function TripsPage() {
  const [trips, setTrips] = useState<TripSummary[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTrips().then((data) => {
      setTrips(data as TripSummary[]);
      setLoading(false);
    }).catch(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    await api.deleteTrip(id);
    setTrips((t) => t.filter((x) => x.id !== id));
  }

  if (loading) {
    return <div className="text-center py-20 text-slate-400">Loading trips…</div>;
  }

  if (!trips.length) {
    return (
      <div className="text-center py-20">
        <p className="text-2xl mb-4">🌍</p>
        <p className="text-slate-500 mb-4">No trips planned yet.</p>
        <Link href="/" className="text-blue-600 hover:underline font-medium">Plan your first trip →</Link>
      </div>
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-slate-800">My Trips</h1>
        <Link href="/" className="bg-blue-600 text-white text-sm font-medium px-4 py-2 rounded-lg hover:bg-blue-700">
          + New Trip
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
        {trips.map((trip) => (
          <div key={trip.id} className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md transition-shadow">
            <div className="flex items-start justify-between mb-3">
              <div>
                <h2 className="font-semibold text-slate-800 text-lg leading-tight">{trip.name}</h2>
                <p className="text-slate-500 text-sm">{trip.destination}</p>
              </div>
              <span className="bg-blue-50 text-blue-700 text-xs font-medium px-2 py-1 rounded-full capitalize">
                {trip.trip_type}
              </span>
            </div>

            {trip.start_date && (
              <p className="text-xs text-slate-400 mb-1">
                {trip.start_date} → {trip.end_date}
              </p>
            )}
            {trip.budget_usd && (
              <p className="text-xs text-slate-400 mb-4">
                Budget: ${trip.budget_usd.toLocaleString()}
              </p>
            )}

            <div className="flex gap-2">
              <Link
                href={`/trips/${trip.id}`}
                className="flex-1 text-center bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-medium py-1.5 rounded-lg transition-colors"
              >
                View
              </Link>
              <button
                onClick={() => handleDelete(trip.id)}
                className="text-red-400 hover:text-red-600 text-sm px-3 py-1.5 rounded-lg hover:bg-red-50 transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
