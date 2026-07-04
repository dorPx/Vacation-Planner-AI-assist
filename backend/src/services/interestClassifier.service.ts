import { callOpenRouter } from './openRouterClient.service';

// ---------------------------------------------------------------------------
// Maps free-text traveler interests ("foodie", "want to chill") onto the
// RapidAPI AI Trip Planner's CLOSED interests vocabulary. The API rejects the
// entire request (400 "Invalid interests provided.") if any token is outside
// the vocabulary, so everything sent upstream must come from this list.
//
// Supplementary feature — this module never throws. LLM classification is
// attempted first (cheap classifier model via OpenRouter); any failure falls
// back to deterministic substring matching. An empty result is safe: the API
// accepts interests: [] and applies its own defaults.
// ---------------------------------------------------------------------------

// Empirically verified against the live API on 2026-07-03 — see
// docs/rapidapi-trip-planner-schema.md for the probe results. Do not add
// tokens without re-verifying: one invalid token 400s the whole request.
export const TRIP_PLANNER_INTERESTS = [
  'art',
  'history',
  'architecture',
  'cuisine',
  'scenic views',
  'museums',
  'beaches',
  'shopping',
  'relaxation',
  'hiking',
  'wildlife',
  'photography',
] as const;

export type TripPlannerInterest = (typeof TRIP_PLANNER_INTERESTS)[number];

const VALID_INTERESTS = new Set<string>(TRIP_PLANNER_INTERESTS);

// The API's own default set is 5 tokens — sending more over-constrains the plan.
const MAX_INTERESTS = 5;

// Supplementary path: a slow classifier must never stall itinerary generation.
const CLASSIFIER_TIMEOUT_MS = 5_000;

// ---------------------------------------------------------------------------
// Deterministic fallback — substring matching against common traveler phrasing
// ---------------------------------------------------------------------------

const FALLBACK_SYNONYMS: Record<TripPlannerInterest, string[]> = {
  cuisine: ['cuisine', 'food', 'eat', 'restaurant', 'culinary', 'gastro', 'wine'],
  relaxation: ['relax', 'chill', 'unwind', 'spa', 'rest', 'laid back', 'laid-back'],
  beaches: ['beach', 'coast', 'seaside', 'swim'],
  museums: ['museum', 'galler', 'exhibit'],
  art: ['art', 'design', 'street art'],
  history: ['history', 'historic', 'ancient', 'heritage', 'ruins'],
  architecture: ['architecture', 'cathedral', 'castle', 'palace'],
  'scenic views': ['view', 'scenic', 'lookout', 'panorama', 'sunset', 'viewpoint'],
  shopping: ['shop', 'market', 'boutique', 'mall'],
  hiking: ['hik', 'trek', 'trail', 'outdoors', 'nature walk'],
  wildlife: ['wildlife', 'animal', 'safari', 'bird', 'aquarium', 'zoo'],
  photography: ['photo', 'instagram', 'camera'],
};

/** Pure substring fallback — exported so the test script can show both paths. */
export function fallbackClassify(phrases: string[]): TripPlannerInterest[] {
  const text = phrases.join(' ').toLowerCase();
  const matched = TRIP_PLANNER_INTERESTS.filter((interest) =>
    FALLBACK_SYNONYMS[interest].some((syn) => text.includes(syn))
  );
  return matched.slice(0, MAX_INTERESTS);
}

// ---------------------------------------------------------------------------
// LLM classifier (primary path)
// ---------------------------------------------------------------------------

async function classifyWithLlm(phrases: string[]): Promise<TripPlannerInterest[] | null> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) return null;

  try {
    const response = await callOpenRouter<{ choices?: { message?: { content?: string } }[] }>(
      {
        model: process.env.OPENROUTER_CLASSIFIER_MODEL ?? 'anthropic/claude-haiku-4.5',
        messages: [
          {
            role: 'system',
            content: `You map a traveler's free-text interests onto a closed vocabulary. The ONLY allowed tokens are: ${TRIP_PLANNER_INTERESTS.join(
              ', '
            )}. Respond with a JSON object {"interests": [...]} containing only allowed tokens that genuinely match the traveler's intent (0-${MAX_INTERESTS} tokens). Never invent tokens outside the list.`,
          },
          { role: 'user', content: `Traveler interests: ${JSON.stringify(phrases)}` },
        ],
        response_format: { type: 'json_object' },
        max_tokens: 200,
      },
      { timeoutMs: CLASSIFIER_TIMEOUT_MS }
    );

    const content: string = response.data.choices?.[0]?.message?.content ?? '';
    // Some models wrap JSON in markdown fences despite response_format.
    const jsonText = content.replace(/^\s*```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '');
    const parsed = JSON.parse(jsonText) as { interests?: unknown } | unknown[];
    const raw = Array.isArray(parsed) ? parsed : (parsed as { interests?: unknown }).interests;
    if (!Array.isArray(raw)) return null;

    // The model can still hallucinate — only vocabulary tokens survive.
    const filtered = raw
      .filter((t): t is string => typeof t === 'string')
      .map((t) => t.toLowerCase().trim())
      .filter((t): t is TripPlannerInterest => VALID_INTERESTS.has(t));
    return filtered.slice(0, MAX_INTERESTS);
  } catch (err: unknown) {
    console.error('[interest-classifier] LLM classification failed, using fallback:', err instanceof Error ? err.message : err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Maps free text onto the trip planner's closed vocabulary. Never throws.
 * Returns [] when nothing maps — safe, since the API substitutes its defaults.
 */
export async function classifyInterests(freeText: string | string[]): Promise<TripPlannerInterest[]> {
  const phrases = (Array.isArray(freeText) ? freeText : [freeText]).map((s) => s.trim()).filter(Boolean);
  if (phrases.length === 0) return [];

  // Free text that is already a vocabulary token skips the LLM entirely.
  const direct = phrases.map((p) => p.toLowerCase()).filter((p): p is TripPlannerInterest => VALID_INTERESTS.has(p));
  if (direct.length === phrases.length) return [...new Set(direct)].slice(0, MAX_INTERESTS);

  const llm = await classifyWithLlm(phrases);
  const picked = llm && llm.length > 0 ? llm : fallbackClassify(phrases);
  return [...new Set(picked)].slice(0, MAX_INTERESTS);
}
