// Helpers shared by the home-page sections.

/** price_history stores lowercased names — restore display casing. */
export function titleCase(text: string): string {
  return text.replace(/\b\p{L}/gu, (c) => c.toUpperCase());
}

function isoDatePlus(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * URL that runs a search on load (SearchBar rehydrates from these params).
 * Full navigation on purpose — it re-mounts the search with fresh state.
 */
export function searchUrl(destination: string, checkinOffsetDays = 21, nights = 3): string {
  const checkin = isoDatePlus(checkinOffsetDays);
  const checkout = isoDatePlus(checkinOffsetDays + nights);
  return `/?destination=${encodeURIComponent(destination)}&checkin=${checkin}&checkout=${checkout}`;
}
