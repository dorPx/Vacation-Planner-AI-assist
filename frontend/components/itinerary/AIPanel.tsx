'use client';

import { useEffect, useRef, useState } from 'react';
import { api } from '@/lib/api';
import { useSearch } from '@/context/SearchContext';
import { useModel } from '@/context/ModelContext';
import ModelPicker from '@/components/ModelPicker';
import { Spinner, Confetti, StreamedMarkdown } from './shared';
import { parseDayCount, seedDates, emptyDay, type DayBuilderDay } from './utils';

interface AIPanelProps {
  onAdopt: (seed: { destination: string; tripType: string; days: DayBuilderDay[] }) => void;
}

interface RandomResult {
  destination: string;
  trip_type: string;
  rationale: string;
}

const inputClass =
  'w-full bg-white border border-beige-300 rounded-lg px-3 py-2 text-sm text-brand-black placeholder:text-brand-mid focus:outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300';

export default function AIPanel({ onAdopt }: AIPanelProps) {
  const { lastParams } = useSearch();
  const { selectedModel } = useModel();

  const [destination, setDestination] = useState(lastParams?.destination ?? '');
  const [budget, setBudget] = useState(lastParams?.budget_max ? String(lastParams.budget_max) : '');
  const [startDate, setStartDate] = useState(lastParams?.checkin ?? '');
  const [endDate, setEndDate] = useState(lastParams?.checkout ?? '');
  const [tripType, setTripType] = useState('leisure');

  const [streaming, setStreaming] = useState(false);
  const [streamDone, setStreamDone] = useState(false);
  const [streamedText, setStreamedText] = useState('');
  const [streamError, setStreamError] = useState('');

  const [randomLoading, setRandomLoading] = useState(false);
  const [randomResult, setRandomResult] = useState<RandomResult | null>(null);

  const abortRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.();
    };
  }, []);

  function startStream(destOverride?: string, typeOverride?: string) {
    const dest = destOverride ?? destination;
    const type = typeOverride ?? tripType;

    if (!dest || !budget || !startDate || !endDate) {
      setStreamError('Please fill in destination, budget, and both dates.');
      return;
    }

    abortRef.current?.();
    setRandomResult(null);
    setStreamedText('');
    setStreamDone(false);
    setStreamError('');
    setStreaming(true);

    abortRef.current = api.streamRecommend(
      {
        destination: dest,
        budget: Number(budget),
        dates: { start: startDate, end: endDate },
        model: selectedModel,
        trip_type: type,
      },
      {
        onChunk: (text) => setStreamedText((prev) => prev + text),
        onDone: () => {
          setStreaming(false);
          setStreamDone(true);
        },
        onError: () => {
          // Any failure from the stream itself (network drop, OpenRouter/model
          // failure, malformed response) — show one friendly, actionable
          // message rather than surfacing the raw backend error text.
          setStreaming(false);
          setStreamError('AI planner is unavailable — try a different model.');
        },
      }
    );
  }

  async function handleSurpriseMe() {
    if (!budget || !startDate || !endDate) {
      setStreamError('Please fill in budget and both dates first.');
      return;
    }
    setStreamError('');
    setRandomLoading(true);
    setRandomResult(null);
    setStreamedText('');
    setStreamDone(false);

    try {
      const result = await api.randomTrip({
        budget: Number(budget),
        dates: { start: startDate, end: endDate },
        model: selectedModel,
      });
      setRandomResult(result);
      setDestination(result.destination);
      setTripType(result.trip_type);
    } catch (err: unknown) {
      setStreamError(err instanceof Error ? err.message : 'Could not generate a surprise trip.');
    } finally {
      setRandomLoading(false);
    }
  }

  function handleLetsGo() {
    if (!randomResult) return;
    startStream(randomResult.destination, randomResult.trip_type);
  }

  function handleClear() {
    abortRef.current?.();
    setStreamedText('');
    setStreamDone(false);
    setStreaming(false);
    setStreamError('');
    setRandomResult(null);
  }

  function handleAdopt() {
    const numDays = parseDayCount(streamedText);
    const dates = seedDates(startDate, numDays);
    const seededDays: DayBuilderDay[] = dates.map((date, i) => emptyDay(i + 1, date));
    onAdopt({ destination, tripType, days: seededDays });
  }

  return (
    <div className="bg-white rounded-2xl border border-beige-300 shadow-sm flex flex-col">
      <div className="px-5 py-4 border-b border-beige-300 space-y-2">
        <h2 className="text-base font-semibold text-brand-black">AI Planner</h2>
        <ModelPicker />
      </div>

      <div className="p-5 space-y-3 border-b border-beige-200">
        <div>
          <label className="block text-xs font-medium text-brand-mid mb-1">Destination</label>
          <input
            value={destination}
            onChange={(e) => setDestination(e.target.value)}
            placeholder="e.g. Lisbon, Portugal"
            className={inputClass}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-1">Budget (USD)</label>
            <input
              type="number"
              min={0}
              value={budget}
              onChange={(e) => setBudget(e.target.value)}
              placeholder="2000"
              className={inputClass}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-1">Trip type</label>
            <input value={tripType} onChange={(e) => setTripType(e.target.value)} className={inputClass} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-1">Start date</label>
            <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className={inputClass} />
          </div>
          <div>
            <label className="block text-xs font-medium text-brand-mid mb-1">End date</label>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} />
          </div>
        </div>

        {streamError && <p className="text-xs text-red-600">{streamError}</p>}

        <div className="flex gap-2 pt-1">
          <button
            type="button"
            onClick={() => startStream()}
            disabled={streaming || randomLoading}
            className="flex-1 bg-sky-300 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            {streaming ? 'Planning…' : 'Plan my trip'}
          </button>
          <button
            type="button"
            onClick={handleSurpriseMe}
            disabled={streaming || randomLoading}
            className="flex-1 border border-brand-black text-brand-black hover:bg-beige-100 disabled:opacity-50 text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            Surprise me
          </button>
        </div>
      </div>

      <div className="p-5 max-h-[60vh] overflow-y-auto">
        {randomLoading && <Spinner label="Finding your perfect trip…" />}

        {randomResult && !streaming && !streamedText && (
          <div className="relative overflow-hidden bg-gradient-to-br from-sky-100 to-beige-100 rounded-2xl p-6 text-center border border-sky-200">
            <Confetti />
            <p className="text-2xl font-extrabold text-brand-black relative z-10">{randomResult.destination}</p>
            <span className="inline-block mt-2 bg-white text-sky-400 text-xs font-semibold px-2.5 py-1 rounded-full capitalize relative z-10">
              {randomResult.trip_type.replace(/_/g, ' ')}
            </span>
            <p className="text-sm text-brand-dark mt-3 relative z-10">{randomResult.rationale}</p>
            <p className="text-xs text-emerald-700 font-medium mt-2 relative z-10">
              ✓ Fits comfortably within your ${Number(budget || 0).toLocaleString()} budget
            </p>
            <button
              type="button"
              onClick={handleLetsGo}
              className="relative z-10 mt-4 bg-brand-black text-white text-sm font-semibold px-5 py-2.5 rounded-lg hover:bg-brand-dark transition-colors"
            >
              Let&apos;s go!
            </button>
          </div>
        )}

        {(streaming || streamedText) && <StreamedMarkdown text={streamedText} streaming={streaming} />}

        {!randomLoading && !randomResult && !streaming && !streamedText && (
          <p className="text-sm text-brand-mid text-center py-10">
            Fill in the trip details above and hit &quot;Plan my trip&quot; to get an AI-built itinerary.
          </p>
        )}
      </div>

      {streamedText && (
        <div className="p-5 border-t border-beige-300 space-y-2">
          <button
            type="button"
            onClick={handleAdopt}
            disabled={!streamDone}
            className="w-full bg-sky-300 hover:bg-sky-400 disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors"
          >
            Save this itinerary
          </button>
          <p className="text-[11px] text-brand-mid text-center">Adds this plan to your day-by-day builder on the left</p>
          <button
            type="button"
            onClick={handleClear}
            className="w-full text-xs font-medium text-brand-mid hover:text-brand-black transition-colors"
          >
            Clear
          </button>
        </div>
      )}
    </div>
  );
}
