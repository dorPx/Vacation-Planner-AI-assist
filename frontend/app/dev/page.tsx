'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useModel } from '@/context/ModelContext';
import type { ModelOption } from '@/context/ModelContext';
import type { SearchParams } from '../../../shared/types';

const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';
const HEALTH_POLL_MS = 30_000;

interface HealthResponse {
  status: 'ok' | 'degraded' | 'down';
  services: Record<string, boolean>;
  cache_stats: { keys: number; hits: number; misses: number };
  uptime_seconds: number;
  version: string;
}

// Every scraper/data test the dev dashboard can run, keyed by its
// /api/health/test/<key> route.
type ScraperKey =
  | 'apify'
  | 'apify-skyscanner'
  | 'apify-tripadvisor'
  | 'rapidapi-tripadvisor'
  | 'rapidapi-booking'
  | 'rapidapi-flights'
  | 'rapidapi-hotels'
  | 'rapidapi-hotels-com-provider'
  | 'rapidapi-airbnb'
  | 'duffel'
  | 'ignav'
  | 'liteapi'
  | 'google';

// One API/method behind a website — an optional live health flag (a status
// dot from /api/health) and/or a runnable test (/api/health/test/<key>).
interface ApiCheck {
  label: string;
  healthKey?: string;
  testKey?: ScraperKey;
}

// APIs grouped by the WEBSITE the data actually comes from, rather than by
// which vendor API (RapidAPI, Apify, …) fetches it.
interface ProviderGroup {
  website: string;
  checks: ApiCheck[];
}

const PROVIDER_GROUPS: ProviderGroup[] = [
  {
    website: 'Booking.com',
    checks: [
      { label: 'RapidAPI · booking-com15', healthKey: 'rapidapi_booking', testKey: 'rapidapi-booking' },
      { label: 'Apify · booking scraper', healthKey: 'apify', testKey: 'apify' },
    ],
  },
  {
    website: 'LiteAPI',
    checks: [{ label: 'LiteAPI · content + live rates', healthKey: 'liteapi', testKey: 'liteapi' }],
  },
  {
    website: 'TripAdvisor',
    checks: [
      { label: 'RapidAPI · tripadvisor16', healthKey: 'rapidapi_tripadvisor', testKey: 'rapidapi-tripadvisor' },
      { label: 'Apify · maxcopell/tripadvisor', testKey: 'apify-tripadvisor' },
    ],
  },
  {
    website: 'Hotels.com',
    checks: [
      { label: 'RapidAPI · hotels4', healthKey: 'rapidapi_hotels', testKey: 'rapidapi-hotels' },
      { label: 'RapidAPI · hotels-com-provider', healthKey: 'rapidapi_hotels_com_provider', testKey: 'rapidapi-hotels-com-provider' },
    ],
  },
  {
    website: 'Airbnb',
    checks: [{ label: 'RapidAPI · airbnb19', healthKey: 'rapidapi_airbnb', testKey: 'rapidapi-airbnb' }],
  },
  {
    website: 'Google',
    checks: [
      { label: 'Google Places', healthKey: 'google', testKey: 'google' },
      { label: 'RapidAPI · google-flights2', healthKey: 'rapidapi_flights', testKey: 'rapidapi-flights' },
    ],
  },
  {
    website: 'Skyscanner',
    checks: [{ label: 'Apify · flight-price-scraper', testKey: 'apify-skyscanner' }],
  },
  {
    website: 'Duffel',
    checks: [{ label: 'Duffel · flights', healthKey: 'duffel', testKey: 'duffel' }],
  },
  {
    website: 'Ignav',
    checks: [{ label: 'Ignav · flights', healthKey: 'ignav', testKey: 'ignav' }],
  },
  {
    website: 'OpenRouter (AI)',
    checks: [{ label: 'OpenRouter · chat + stream', healthKey: 'openrouter' }],
  },
  {
    website: 'System',
    checks: [
      { label: 'SQLite', healthKey: 'sqlite' },
      { label: 'In-memory cache', healthKey: 'cache' },
    ],
  },
];

// testKey -> its display label, for rendering result blocks.
const TEST_LABELS: Partial<Record<ScraperKey, string>> = Object.fromEntries(
  PROVIDER_GROUPS.flatMap((g) => g.checks.filter((c) => c.testKey).map((c) => [c.testKey, c.label]))
);

function addDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatTime(d: Date | null): string {
  if (!d) return '—';
  return d.toLocaleTimeString();
}

// ---------------------------------------------------------------------------
// Health card
// ---------------------------------------------------------------------------

function HealthCard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [fetchError, setFetchError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function fetchHealth() {
      try {
        const res = await fetch(`${BASE}/api/health`, { cache: 'no-store' });
        const data = (await res.json()) as HealthResponse;
        if (cancelled) return;
        setHealth(data);
        setLastChecked(new Date());
        setFetchError('');
      } catch (err: unknown) {
        if (cancelled) return;
        setFetchError(err instanceof Error ? err.message : 'Health check failed.');
      }
    }

    fetchHealth();
    const interval = setInterval(fetchHealth, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-brand-black">Health Status</h2>
        {health && (
          <span
            className={`text-xs font-semibold px-2 py-0.5 rounded-full capitalize ${
              health.status === 'ok'
                ? 'bg-emerald-100 text-emerald-700'
                : health.status === 'degraded'
                  ? 'bg-amber-100 text-amber-700'
                  : 'bg-red-100 text-red-700'
            }`}
          >
            {health.status}
          </span>
        )}
      </div>

      {fetchError && <p className="text-xs text-red-600 mb-2">{fetchError}</p>}

      {!health ? (
        <p className="text-sm text-brand-mid">Checking…</p>
      ) : (
        <div className="space-y-3">
          {PROVIDER_GROUPS.map((group) => {
            const checks = group.checks.filter((c) => c.healthKey && c.healthKey in health.services);
            if (!checks.length) return null;
            return (
              <div key={group.website}>
                <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-mid mb-0.5">{group.website}</p>
                {checks.map((c) => {
                  const ok = health.services[c.healthKey!];
                  return (
                    <div key={c.healthKey} className="flex items-center justify-between text-sm py-1 pl-1">
                      <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${ok ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <span className="text-brand-dark">{c.label}</span>
                      </div>
                      <span className="text-xs text-brand-mid">{formatTime(lastChecked)}</span>
                    </div>
                  );
                })}
              </div>
            );
          })}
          <div className="pt-3 mt-1 border-t border-beige-200 text-xs text-brand-mid space-y-1">
            <p>Uptime: {health.uptime_seconds}s</p>
            <p>Version: {health.version}</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Cache inspector
// ---------------------------------------------------------------------------

function CacheInspectorCard({ healthRef }: { healthRef: HealthResponse | null }) {
  if (!healthRef) {
    return (
      <div className="bg-white border border-beige-300 rounded-xl p-5">
        <h2 className="text-sm font-semibold text-brand-black mb-4">Cache Inspector</h2>
        <p className="text-sm text-brand-mid">Waiting for health check…</p>
      </div>
    );
  }

  const { keys, hits, misses } = healthRef.cache_stats;
  const total = hits + misses;
  const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : '0.0';

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-brand-black mb-4">Cache Inspector</h2>
      <div className="grid grid-cols-3 gap-3 text-center">
        <div>
          <p className="text-2xl font-bold text-sky-400">{keys}</p>
          <p className="text-xs text-brand-mid">Keys cached</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-sky-400">{hitRate}%</p>
          <p className="text-xs text-brand-mid">Hit rate</p>
        </div>
        <div>
          <p className="text-2xl font-bold text-sky-400">{hits}/{misses}</p>
          <p className="text-xs text-brand-mid">Hits / Misses</p>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Test search form
// ---------------------------------------------------------------------------

function TestSearchCard() {
  const [params, setParams] = useState<SearchParams>({
    destination: 'Paris',
    checkin: addDays(7),
    checkout: addDays(14),
    budget_min: 0,
    budget_max: 5000,
  });
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState('');

  async function runSearch() {
    setLoading(true);
    setResponse('');
    try {
      const data = await api.search(params);
      setResponse(JSON.stringify(data, null, 2));
    } catch (err: unknown) {
      setResponse(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }, null, 2));
    } finally {
      setLoading(false);
    }
  }

  const inputClass = 'w-full border border-beige-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-sky-300';

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-brand-black mb-4">Test Search</h2>
      <div className="grid grid-cols-2 gap-3 mb-3">
        <div>
          <label className="block text-xs text-brand-mid mb-1">Destination</label>
          <input
            value={params.destination}
            onChange={(e) => setParams({ ...params, destination: e.target.value })}
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs text-brand-mid mb-1">Check-in</label>
            <input type="date" value={params.checkin} onChange={(e) => setParams({ ...params, checkin: e.target.value })} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs text-brand-mid mb-1">Check-out</label>
            <input type="date" value={params.checkout} onChange={(e) => setParams({ ...params, checkout: e.target.value })} className={inputClass} />
          </div>
        </div>
        <div>
          <label className="block text-xs text-brand-mid mb-1">Budget min</label>
          <input
            type="number"
            value={params.budget_min}
            onChange={(e) => setParams({ ...params, budget_min: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
        <div>
          <label className="block text-xs text-brand-mid mb-1">Budget max</label>
          <input
            type="number"
            value={params.budget_max}
            onChange={(e) => setParams({ ...params, budget_max: Number(e.target.value) })}
            className={inputClass}
          />
        </div>
      </div>

      <button
        type="button"
        onClick={runSearch}
        disabled={loading}
        className="bg-sky-300 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {loading ? 'Running…' : 'Run test search'}
      </button>

      {response && (
        <pre className="mt-4 bg-beige-50 border border-beige-200 rounded-lg p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
          {response}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scraper test buttons
// ---------------------------------------------------------------------------

function ScraperTestsCard() {
  const [loadingKey, setLoadingKey] = useState<ScraperKey | null>(null);
  const [results, setResults] = useState<Partial<Record<ScraperKey, unknown>>>({});

  async function runTest(key: ScraperKey) {
    setLoadingKey(key);
    try {
      const res = await fetch(`${BASE}/api/health/test/${key}?destination=Paris`, { cache: 'no-store' });
      const data = await res.json();
      setResults((prev) => ({ ...prev, [key]: data }));
    } catch (err: unknown) {
      setResults((prev) => ({ ...prev, [key]: { error: err instanceof Error ? err.message : String(err) } }));
    } finally {
      setLoadingKey(null);
    }
  }

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-brand-black mb-1">Scraper Tests</h2>
      <p className="text-xs text-brand-mid mb-4">Grouped by the website each API pulls from.</p>

      <div className="space-y-3">
        {PROVIDER_GROUPS.map((group) => {
          const tests = group.checks.filter((c) => c.testKey);
          if (!tests.length) return null;
          return (
            <div key={group.website}>
              <p className="text-[11px] font-semibold uppercase tracking-wide text-brand-mid mb-1.5">{group.website}</p>
              <div className="flex flex-wrap gap-2">
                {tests.map((c) => (
                  <button
                    key={c.testKey}
                    type="button"
                    onClick={() => runTest(c.testKey!)}
                    disabled={loadingKey === c.testKey}
                    className="border border-beige-300 hover:bg-beige-100 disabled:opacity-50 text-xs font-medium text-brand-black px-3 py-1.5 rounded-lg transition-colors"
                  >
                    {loadingKey === c.testKey ? 'Testing…' : c.label}
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {(Object.keys(results) as ScraperKey[]).map(
        (key) =>
          results[key] !== undefined && (
            <div key={key} className="mt-3">
              <p className="text-xs font-semibold text-brand-mid mb-1">{TEST_LABELS[key] ?? key} result</p>
              <pre className="bg-beige-50 border border-beige-200 rounded-lg p-3 text-xs overflow-auto max-h-64 whitespace-pre-wrap">
                {JSON.stringify(results[key], null, 2)}
              </pre>
            </div>
          )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stream test
// ---------------------------------------------------------------------------

function StreamTestCard() {
  const { selectedModel } = useModel();
  const [streaming, setStreaming] = useState(false);
  const [output, setOutput] = useState('');
  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => abortRef.current?.();
  }, []);

  function runStream() {
    abortRef.current?.();
    setOutput('');
    setStreaming(true);

    abortRef.current = api.streamRecommend(
      {
        destination: 'Paris',
        budget: 2000,
        dates: { start: addDays(7), end: addDays(14) },
        model: selectedModel,
      },
      {
        onChunk: (text) => setOutput((prev) => prev + text),
        onDone: () => setStreaming(false),
        onError: (msg) => {
          setOutput((prev) => `${prev}\n\n[ERROR] ${msg}`);
          setStreaming(false);
        },
      }
    );
  }

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5">
      <h2 className="text-sm font-semibold text-brand-black mb-1">AI Stream Test</h2>
      <p className="text-xs text-brand-mid mb-4">Using model: {selectedModel}</p>
      <button
        type="button"
        onClick={runStream}
        disabled={streaming}
        className="bg-sky-300 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
      >
        {streaming ? 'Streaming…' : 'Test AI stream'}
      </button>

      {output && (
        <pre className="mt-4 bg-beige-50 border border-beige-200 rounded-lg p-3 text-xs overflow-auto max-h-96 whitespace-pre-wrap">
          {output}
          {streaming && <span className="inline-block w-1.5 h-3 bg-brand-mid/60 animate-pulse ml-0.5" />}
        </pre>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Model list
// ---------------------------------------------------------------------------

function ModelListCard() {
  const [models, setModels] = useState<ModelOption[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .getModels()
      .then(setModels)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Could not load models.'));
  }, []);

  return (
    <div className="bg-white border border-beige-300 rounded-xl p-5 lg:col-span-2">
      <h2 className="text-sm font-semibold text-brand-black mb-4">Models ({models?.length ?? 0})</h2>
      {error && <p className="text-xs text-red-600">{error}</p>}
      {!models && !error && <p className="text-sm text-brand-mid">Loading…</p>}
      {models && (
        <div className="overflow-x-auto max-h-80">
          <table className="min-w-full text-xs">
            <thead className="sticky top-0 bg-white">
              <tr className="text-left text-brand-mid border-b border-beige-200">
                <th className="py-2 pr-4">ID</th>
                <th className="py-2 pr-4">Name</th>
                <th className="py-2 pr-4">Context</th>
                <th className="py-2 pr-4">Prompt $</th>
                <th className="py-2 pr-4">Completion $</th>
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.id} className="border-b border-beige-100">
                  <td className="py-1.5 pr-4 text-brand-dark whitespace-nowrap">{m.id}</td>
                  <td className="py-1.5 pr-4 text-brand-dark">{m.name}</td>
                  <td className="py-1.5 pr-4 text-brand-mid">{m.context_length.toLocaleString()}</td>
                  <td className="py-1.5 pr-4 text-brand-mid">{m.pricing.prompt}</td>
                  <td className="py-1.5 pr-4 text-brand-mid">{m.pricing.completion}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

function DevDashboard() {
  const [health, setHealth] = useState<HealthResponse | null>(null);

  // A second light poll just to feed cache_stats to the inspector card
  // without making HealthCard responsible for sharing its internal state.
  useEffect(() => {
    let cancelled = false;
    async function fetchHealth() {
      try {
        const res = await fetch(`${BASE}/api/health`, { cache: 'no-store' });
        const data = (await res.json()) as HealthResponse;
        if (!cancelled) setHealth(data);
      } catch {
        // HealthCard already surfaces the error — this poll just feeds cache stats.
      }
    }
    fetchHealth();
    const interval = setInterval(fetchHealth, HEALTH_POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-brand-black mb-6">Dev Dashboard</h1>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <HealthCard />
        <CacheInspectorCard healthRef={health} />
        <TestSearchCard />
        <ScraperTestsCard />
        <StreamTestCard />
        <ModelListCard />
      </div>
    </div>
  );
}

export default function DevPage() {
  if (process.env.NODE_ENV !== 'development') {
    return (
      <div className="max-w-3xl mx-auto px-4 py-20 text-center text-sm text-brand-mid">
        The dev dashboard is only available in development.
      </div>
    );
  }
  return <DevDashboard />;
}
