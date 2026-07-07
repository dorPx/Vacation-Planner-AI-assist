'use client';

import { useEffect, useState } from 'react';
import { useCurrency } from '@/context/CurrencyContext';
import { checkWatchedDrops, acknowledgeWatch, type WatchAlert } from '@/lib/priceWatch';
import { titleCase, searchUrl } from './shared';

// "Since your last visit" — real drops on hotels the visitor chose to watch.
// Checked against recorded price history on load; hidden when nothing dropped.

export default function WatchAlerts() {
  const [alerts, setAlerts] = useState<WatchAlert[]>([]);
  const { format } = useCurrency();

  useEffect(() => {
    let cancelled = false;
    checkWatchedDrops().then((found) => {
      if (!cancelled) setAlerts(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  if (!alerts.length) return null;

  function dismiss(alert: WatchAlert) {
    acknowledgeWatch(alert.name, alert.destination, alert.current_price);
    setAlerts((prev) => prev.filter((a) => a !== alert));
  }

  return (
    <section aria-label="Price drops on hotels you watch">
      <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
        <h2 className="text-sm font-bold text-emerald-800 mb-2">
          🔔 Since your last visit — {alerts.length} watched hotel{alerts.length === 1 ? '' : 's'} dropped
        </h2>
        <ul className="space-y-1.5">
          {alerts.map((alert) => (
            <li key={`${alert.destination}-${alert.name}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
              <span className="font-semibold text-emerald-900">{titleCase(alert.name)}</span>
              <span className="text-emerald-800">
                {format(alert.watched_price)} → <span className="font-bold">{format(alert.current_price)}</span>
                <span className="text-emerald-600 font-semibold"> (−{alert.drop_pct}%)</span>
              </span>
              <a
                href={searchUrl(titleCase(alert.destination))}
                className="text-sky-500 font-semibold hover:underline"
              >
                Search {titleCase(alert.destination.split(',')[0])} →
              </a>
              <button
                type="button"
                onClick={() => dismiss(alert)}
                className="text-xs text-emerald-700 hover:text-emerald-900 underline"
              >
                Dismiss
              </button>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
