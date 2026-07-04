'use client';

import type { ActivityResult } from '../../../shared/types';
import { StarRating, CategoryBadge } from './shared';
import { showToast } from './toast';

export default function ActivityCard(props: ActivityResult) {
  const { name, category, price, rating, duration_hours, description } = props;

  return (
    <div className="bg-white rounded-xl border-[0.5px] border-beige-300 p-3 flex flex-col gap-2 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <CategoryBadge label={category} />
        <span className="text-sm font-semibold text-sky-400 whitespace-nowrap">
          {price > 0 ? `$${price.toFixed(0)}` : 'Free'}
        </span>
      </div>

      <p className="text-sm font-medium text-brand-black leading-snug">{name}</p>

      <div className="flex items-center justify-between text-xs text-brand-mid">
        <span>{duration_hours}h</span>
        <StarRating rating={rating} />
      </div>

      {description && (
        <p
          className="text-xs text-brand-mid leading-relaxed"
          style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
        >
          {description}
        </p>
      )}

      <button
        type="button"
        onClick={() => showToast(`Added ${name} to itinerary`)}
        className="mt-1 w-full bg-beige-100 hover:bg-beige-200 text-brand-black text-xs font-semibold py-2 rounded-lg transition-colors"
      >
        Add to itinerary
      </button>
    </div>
  );
}
