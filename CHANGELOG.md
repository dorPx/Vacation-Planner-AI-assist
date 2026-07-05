# Changelog

## Unreleased

### Added — "Load more" hotel pagination
- A **Load more hotels** button at the bottom of the hotel list fetches the next
  Booking.com results page (20 hotels per page, same "top picks" ordering and
  occupancy as the original search), annotates distance from center, and merges
  them into the current results — preserving active filters and sort, deduplicating
  by id and name. When a page returns nothing new, the button is replaced with
  "You've seen all available hotels for this search." Backed by a new
  `POST /api/search/more` endpoint (cached 3h, fail-soft: errors read as
  "no more results", never a 5xx).

### Added — 5 more UX improvements (search speed, clarity, resilience)
- **Keyboard-navigable destination search.** The autocomplete dropdown is now fully
  operable with the keyboard — arrow keys move the highlight, Enter selects, Escape
  closes — with proper ARIA combobox semantics (WCAG 2.1 AA).
- **Popular-destination quick chips.** New visitors see one-click city chips on the
  hero to start a search instantly; returning visitors see their recent searches
  instead. Both clear away once results are showing.
- **Retry on a failed search.** A network or provider error now shows a "Try again"
  button that re-runs the search, instead of dead-ending.
- **Source attribution.** The results header names the providers that actually
  contributed ("Comparing across Booking.com · Google …") — honest-data transparency.
- **Sticky search summary.** Scrolling into results reveals a compact bar with the
  active search (destination · dates · guests · count) and an "Edit" jump back to the
  search form.

### Added — 5 UX improvements
- **Shareable & refresh-safe searches.** The active search (destination, dates,
  occupancy) is written to the URL, so a search survives a page reload and can be
  bookmarked or shared. Opening such a URL rehydrates the form and re-runs the
  search automatically. The browser tab title reflects the destination.
- **Active filter chips.** Every applied filter (price range, review-score bucket,
  amenity, source) appears as a removable chip above the results, with a "Clear all"
  shortcut. When filters hide every hotel, a clear empty state with a one-click
  "Clear all filters" recovery replaces the silent blank list.
- **Save / favorite hotels.** A heart on each hotel card saves it to a wishlist
  persisted in the browser (localStorage). A "♥ Saved (n)" toggle in the results
  header filters the list to saved hotels; favorites survive reloads and new searches.
- **Recent searches.** Your last few searches appear as one-click chips under the
  search bar to re-run instantly (persisted locally, deduplicated).
- **Accessibility & motion.** Keyboard-visible `:focus-visible` rings on all controls
  (WCAG 2.1 AA 2.4.7), and every animation now honors the OS "reduce motion" setting
  (WCAG 2.1 AA 2.3.3).

## Earlier
- Hotel ranking: booking.com-style "top picks" blend (rating + price + distance),
  a "Distance from center" sort, distance shown on cards, and a fetch order that
  returns the top-recommended 20 hotels rather than the most expensive.
- Initial public release: travel meta-search + AI itinerary builder.
