'use client';

import type { RestaurantResult } from '../../../shared/types';
import { StarRating, CategoryBadge, priceLevelLabel } from './shared';
import { showToast } from './toast';

export default function RestaurantCard(props: RestaurantResult) {
  const { name, cuisine, price_level, rating } = props;

  return (
    <div className="bg-white rounded-xl border-[0.5px] border-beige-300 p-3 flex flex-col gap-2 hover:shadow-lg transition-shadow">
      <div className="flex items-start justify-between gap-2">
        <CategoryBadge label={cuisine} />
        <span className="text-sm font-semibold text-brand-mid">{priceLevelLabel(price_level)}</span>
      </div>

      <p className="text-sm font-medium text-brand-black leading-snug">{name}</p>

      <StarRating rating={rating} />

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
