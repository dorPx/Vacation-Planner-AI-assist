# RapidAPI "AI Trip Planner" — verified schema (Phase 0)

Captured live against the real API on **2026-07-03** (not assumed from docs).

## Endpoint

```
POST https://ai-trip-planner.p.rapidapi.com/detailed-plan
Headers:
  X-RapidAPI-Key:  <RAPIDAPI_KEY>
  X-RapidAPI-Host: ai-trip-planner.p.rapidapi.com
  Content-Type:    application/json
```

Note: `GET /?days=&destination=` also exists (simpler shape, `{time, description}`
activities, no interests/budget/travelMode support). This feature uses `POST /detailed-plan`.

## Request body

```json
{
  "days": 3,
  "destination": "Lisbon",
  "interests": ["cuisine", "relaxation"],
  "budget": "medium",
  "travelMode": "walking"
}
```

- `interests` is a **closed vocabulary** (see below). Any unknown token fails the whole
  request with HTTP 400 `{"error":"Invalid interests provided."}`.
- `interests: []` is accepted — the API falls back to its default set
  (`art, history, architecture, cuisine, scenic views`) and echoes the effective set back.
- `budget` / `travelMode` are also validated (invalid values → HTTP 400). Known-good values:
  `budget: "medium"`, `travelMode: "walking"`. Other enum members not yet enumerated.

## Closed interests vocabulary (empirically probed, one token per request)

Valid: `art`, `history`, `architecture`, `cuisine`, `scenic views`, `museums`, `beaches`,
`shopping`, `relaxation`, `hiking`, `wildlife`, `photography`

Rejected: `food`, `culture`, `nature`, `adventure`, `nightlife`, `wellness`, `sports`,
`family`, `parks`, `entertainment`, `music`, `local cuisine`

(There may be more valid tokens; this list is what probing confirmed. Re-verify before
adding tokens to `TRIP_PLANNER_INTERESTS` in `interestClassifier.service.ts`.)

## Response shape

```json
{
  "plan": {
    "days": 1,
    "destination": "Lisbon",
    "budget": "medium",
    "travelMode": "walking",
    "interests": ["art", "history", "architecture", "cuisine", "scenic views"],
    "itinerary": [
      {
        "day": 1,
        "activities": [
          { "time": "08:30", "activity": "Breakfast at a traditional Portuguese bakery", "location": "Pastéis de Belém" },
          { "time": "10:00", "activity": "Visit the Jerónimos Monastery", "location": "Mosteiro dos Jerónimos" }
        ]
      }
    ]
  }
}
```

## Quota & latency (drives the cache TTL)

- Plan limit from `x-ratelimit-*` headers on 2026-07-03: **5,000 requests/month**
  (≈166/day). Cache TTL set to 6h in `rapidApiTripPlanner.service.ts` accordingly.
- Generation latency observed: **~6–20s** for real plans (1–3 days). A 5s request timeout
  will abort most cold (uncached) calls — see the timeout note in the service.
