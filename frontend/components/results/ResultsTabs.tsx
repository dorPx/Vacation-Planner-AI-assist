'use client';

import { useState, type ReactNode } from 'react';

export interface ResultsTab {
  id: string;
  label: string;
  count: number;
  content: ReactNode;
}

export default function ResultsTabs({ tabs }: { tabs: ResultsTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="flex flex-col">
      <div className="bg-white border-b border-beige-300 sticky top-16 z-30">
        <div className="flex gap-1 px-1">
          {tabs.map((tab) => {
            const isActive = tab.id === active?.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveId(tab.id)}
                className={`relative px-4 py-3 text-sm font-medium transition-colors ${
                  isActive ? 'text-brand-black' : 'text-brand-mid hover:text-brand-black'
                }`}
              >
                {tab.label} <span className="text-xs text-brand-mid">({tab.count})</span>
                {isActive && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-sky-300" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content flows with the document — a nested scroll area here created
          double scrollbars and trapped the wheel mid-page. */}
      <div className="py-6">
        <div key={active?.id} className="animate-tab-fade">
          {active?.content}
        </div>
      </div>
    </div>
  );
}
