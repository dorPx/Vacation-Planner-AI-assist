'use client';

import { useMemo } from 'react';
import { classifyLine } from './utils';

export { Spinner } from '@/components/results/shared';

const CONFETTI_COLORS = ['#378ADD', '#85B7EB', '#16a34a', '#f59e0b', '#D9CDB8', '#0C447C'];

export function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 28 }).map((_, i) => ({
        left: Math.random() * 100,
        delay: Math.random() * 0.4,
        duration: 1.4 + Math.random() * 0.8,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: Math.random() * 360,
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="confetti-piece"
          style={{
            left: `${p.left}%`,
            backgroundColor: p.color,
            animationDelay: `${p.delay}s`,
            animationDuration: `${p.duration}s`,
            transform: `rotate(${p.rotate}deg)`,
          }}
        />
      ))}
    </div>
  );
}

function renderInline(text: string, keyPrefix: string) {
  const parts = text.split(/(\[BEST VALUE\])/g);
  return parts.map((part, i) =>
    part === '[BEST VALUE]' ? (
      <span
        key={`${keyPrefix}-${i}`}
        className="inline-block bg-sky-100 text-sky-500 text-xs font-semibold px-1.5 py-0.5 rounded mx-1 align-middle"
      >
        {part}
      </span>
    ) : (
      <span key={`${keyPrefix}-${i}`}>{part}</span>
    )
  );
}

export function StreamedMarkdown({ text, streaming }: { text: string; streaming: boolean }) {
  const lines = text.split('\n');

  return (
    <div>
      {lines.map((line, idx) => {
        const classified = classifyLine(line);

        if (classified.type === 'blank') return <div key={idx} className="h-2" />;

        if (classified.type === 'day-header') {
          return (
            <p key={idx} className="text-lg font-bold text-brand-black mt-5 mb-1">
              {renderInline(classified.cleanedText, `${idx}`)}
            </p>
          );
        }

        if (classified.type === 'cost') {
          return (
            <p key={idx} className="text-emerald-600 font-semibold text-sm">
              {renderInline(classified.cleanedText, `${idx}`)}
            </p>
          );
        }

        return (
          <p key={idx} className="text-sm text-brand-dark leading-relaxed">
            {renderInline(classified.cleanedText, `${idx}`)}
          </p>
        );
      })}
      {streaming && (
        <span className="inline-block w-1.5 h-4 bg-brand-mid/60 align-middle animate-pulse ml-0.5" />
      )}
    </div>
  );
}
