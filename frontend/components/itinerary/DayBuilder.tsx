'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import {
  TIME_SLOTS,
  dayCost,
  tripCost,
  emptyDay,
  addDays,
  type DayBuilderDay,
  type TimeSlot,
  type TimeSlotItem,
} from './utils';
import { priceLevelLabel } from '@/components/results/shared';
import ItemPickerModal from './ItemPickerModal';

interface DayBuilderProps {
  days: DayBuilderDay[];
  onChange: (days: DayBuilderDay[]) => void;
  destination: string;
  onSave: () => void;
  saving: boolean;
  savedId: string | null;
  onExportPdf: () => void;
  onExportJson: () => void;
}

interface DragRef {
  dayIndex: number;
  slot: TimeSlot;
  index: number;
}

const SLOT_LABELS: Record<TimeSlot, string> = {
  morning: 'Morning',
  afternoon: 'Afternoon',
  evening: 'Evening',
};

function describeSlotItem(slotItem: TimeSlotItem): { label: string; price: string } {
  if (slotItem.kind === 'hotel') {
    return { label: `🏨 ${slotItem.item.name}`, price: `$${slotItem.item.price_per_night.toFixed(0)}/night` };
  }
  if (slotItem.kind === 'activity') {
    return { label: slotItem.item.name, price: slotItem.item.price > 0 ? `$${slotItem.item.price.toFixed(0)}` : 'Free' };
  }
  return { label: slotItem.item.name, price: priceLevelLabel(slotItem.item.price_level) };
}

export default function DayBuilder({
  days,
  onChange,
  destination,
  onSave,
  saving,
  savedId,
  onExportPdf,
  onExportJson,
}: DayBuilderProps) {
  const [pickerTarget, setPickerTarget] = useState<{ dayIndex: number; slot: TimeSlot } | null>(null);
  const dragRef = useRef<DragRef | null>(null);

  function addDay() {
    const last = days[days.length - 1];
    const nextDate = last?.date ? addDays(last.date, 1) : '';
    onChange([...days, emptyDay(days.length + 1, nextDate)]);
  }

  function removeDay(index: number) {
    const next = days.filter((_, i) => i !== index).map((d, i) => ({ ...d, day: i + 1 }));
    onChange(next);
  }

  function applyPick(target: { dayIndex: number; slot: TimeSlot }, item: TimeSlotItem) {
    const next = days.map((day, i) => {
      if (i !== target.dayIndex) return day;

      // A day can only ever have one hotel — strip any existing hotel from
      // every slot before adding a new one, so the data model can never hold
      // two (which toItineraryDay would otherwise silently collapse to one).
      const strip = (items: TimeSlotItem[]) => (item.kind === 'hotel' ? items.filter((s) => s.kind !== 'hotel') : items);

      return {
        ...day,
        morning: strip(day.morning),
        afternoon: strip(day.afternoon),
        evening: strip(day.evening),
        [target.slot]: [...strip(day[target.slot]), item],
      };
    });
    onChange(next);
  }

  function removeSlotItem(dayIndex: number, slot: TimeSlot, itemIndex: number) {
    const next = days.map((day, i) =>
      i === dayIndex ? { ...day, [slot]: day[slot].filter((_, idx) => idx !== itemIndex) } : day
    );
    onChange(next);
  }

  function handleDrop(dayIndex: number, slot: TimeSlot, dropIndex: number) {
    const drag = dragRef.current;
    dragRef.current = null;
    if (!drag || drag.dayIndex !== dayIndex || drag.slot !== slot || drag.index === dropIndex) return;

    const next = days.map((day, i) => {
      if (i !== dayIndex) return day;
      const list = [...day[slot]];
      const [moved] = list.splice(drag.index, 1);
      list.splice(dropIndex, 0, moved);
      return { ...day, [slot]: list };
    });
    onChange(next);
  }

  const totalCost = tripCost(days);

  return (
    <div className="pb-28">
      <div className="space-y-4">
        {days.map((day, dayIndex) => (
          <div key={dayIndex} className="bg-white rounded-xl border border-beige-300 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 bg-beige-100 border-b border-beige-300">
              <p className="font-semibold text-brand-black">
                Day {day.day} {day.date ? `— ${day.date}` : ''}
              </p>
              <button
                type="button"
                onClick={() => removeDay(dayIndex)}
                className="text-xs font-medium text-brand-mid hover:text-red-600 transition-colors"
              >
                Delete
              </button>
            </div>

            <div className="p-4 space-y-4">
              {TIME_SLOTS.map((slot) => (
                <div key={slot}>
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-brand-mid">{SLOT_LABELS[slot]}</p>
                    <button
                      type="button"
                      onClick={() => setPickerTarget({ dayIndex, slot })}
                      className="text-xs font-medium text-sky-400 hover:text-sky-500 transition-colors"
                    >
                      + Add
                    </button>
                  </div>

                  {day[slot].length === 0 ? (
                    <p className="text-xs text-brand-mid italic">Nothing added yet</p>
                  ) : (
                    <div className="space-y-1.5">
                      {day[slot].map((slotItem, itemIndex) => {
                        const { label, price } = describeSlotItem(slotItem);
                        return (
                          <div
                            key={itemIndex}
                            draggable
                            onDragStart={() => {
                              dragRef.current = { dayIndex, slot, index: itemIndex };
                            }}
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={() => handleDrop(dayIndex, slot, itemIndex)}
                            className="flex items-center justify-between bg-beige-100 rounded-lg px-3 py-2 cursor-grab active:cursor-grabbing"
                          >
                            <span className="text-sm text-brand-dark truncate">{label}</span>
                            <div className="flex items-center gap-2 flex-shrink-0">
                              <span className="text-xs text-sky-400 font-medium">{price}</span>
                              <button
                                type="button"
                                onClick={() => removeSlotItem(dayIndex, slot, itemIndex)}
                                className="text-brand-mid hover:text-red-600 text-sm"
                              >
                                ✕
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="px-4 py-3 bg-beige-50 border-t border-beige-200 text-sm font-semibold text-brand-black">
              Estimated cost: ${dayCost(day).toLocaleString()}
            </div>
          </div>
        ))}

        <button
          type="button"
          onClick={addDay}
          className="w-full border-2 border-dashed border-beige-300 rounded-xl py-4 text-sm font-medium text-brand-mid hover:border-sky-300 hover:text-sky-400 transition-colors"
        >
          + Add day
        </button>
      </div>

      <div className="fixed bottom-0 inset-x-0 z-40 bg-white border-t border-beige-300 shadow-2xl">
        <div className="max-w-7xl mx-auto px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-brand-mid">Total trip cost</p>
            <p className="text-2xl font-bold text-sky-400">${totalCost.toLocaleString()}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* /trips predates the sky/beige design refresh — restyle separately, this is a known inconsistency, not an oversight */}
            <Link href="/trips" className="text-sm font-medium text-brand-mid hover:text-brand-black px-3 py-2">
              Load saved trip
            </Link>
            <button
              type="button"
              onClick={onExportJson}
              disabled={!savedId}
              title={savedId ? undefined : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={onExportPdf}
              disabled={!savedId}
              title={savedId ? undefined : 'Save the itinerary first'}
              className="text-sm font-medium text-brand-black border border-beige-300 hover:bg-beige-100 disabled:opacity-40 disabled:cursor-not-allowed px-3 py-2 rounded-lg transition-colors"
            >
              Export PDF
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={saving}
              className="bg-sky-300 hover:bg-sky-400 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {saving ? 'Saving…' : savedId ? 'Saved ✓' : 'Save itinerary'}
            </button>
          </div>
        </div>
      </div>

      <ItemPickerModal
        open={pickerTarget !== null}
        destination={destination}
        onClose={() => setPickerTarget(null)}
        onPick={(item) => {
          if (pickerTarget) applyPick(pickerTarget, item);
        }}
      />
    </div>
  );
}
