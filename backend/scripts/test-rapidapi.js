#!/usr/bin/env node
/**
 * Dev-only smoke test for the supplementary AI trip planner (Phase 2).
 *
 * Run from backend/:  node scripts/test-rapidapi.js
 * (wraps ts-node so the TypeScript services are exercised directly — no build step)
 *
 * Proves three things:
 *  1. The interest classifier maps non-obvious free text onto the closed vocabulary
 *     (LLM path + deterministic fallback shown side by side).
 *  2. fetchDetailedPlan returns a real plan from the live API.
 *  3. An identical second call is served from NodeCache (no network — see the
 *     "[trip-planner] cache hit" log line and the ~0ms timing).
 *
 * Note: NodeCache is in-memory, so the cache proof is two calls in ONE process;
 * re-running the script starts cold again.
 */
require('ts-node').register({ transpileOnly: true });
require('dotenv/config');

const { classifyInterests, fallbackClassify } = require('../src/services/interestClassifier.service');
const { fetchDetailedPlan } = require('../src/services/rapidApiTripPlanner.service');

// Real generation takes ~6-20s; the production default (5s) is intentionally
// tight for the SSE path, so this dev script opts into a patient timeout.
const DEV_TIMEOUT = { timeoutMs: 45_000 };

async function main() {
  const freeText = ['foodie', 'want to chill'];

  console.log(`1) classifyInterests(${JSON.stringify(freeText)})`);
  let t = Date.now();
  const interests = await classifyInterests(freeText);
  console.log(`   LLM path      → ${JSON.stringify(interests)}  (${Date.now() - t}ms)`);
  console.log(`   fallback path → ${JSON.stringify(fallbackClassify(freeText))}  (substring matching only)`);

  console.log('\n2) fetchDetailedPlan({ destination: "Lisbon", days: 3, interests }) — first call (network)');
  t = Date.now();
  const plan = await fetchDetailedPlan({ destination: 'Lisbon', days: 3, interests }, DEV_TIMEOUT);
  const firstMs = Date.now() - t;
  if (!plan) {
    console.log(`   → null after ${firstMs}ms (fail-soft path — check key/quota/timeout)`);
    process.exit(1);
  }
  console.log(`   → plan received in ${firstMs}ms`);
  console.log(`   effective interests: ${JSON.stringify(plan.interests)}`);
  for (const day of plan.itinerary) {
    console.log(`   Day ${day.day}: ${day.activities.length} activities`);
    for (const a of day.activities.slice(0, 3)) {
      console.log(`     ${a.time}  ${a.activity}  @ ${a.location}`);
    }
    if (day.activities.length > 3) console.log(`     … +${day.activities.length - 3} more`);
  }

  console.log('\n3) identical call again — expecting NodeCache hit, no network');
  t = Date.now();
  const plan2 = await fetchDetailedPlan({ destination: 'Lisbon', days: 3, interests }, DEV_TIMEOUT);
  const secondMs = Date.now() - t;
  const identical = JSON.stringify(plan2) === JSON.stringify(plan);
  console.log(`   → returned in ${secondMs}ms, payload identical: ${identical}`);
  console.log(`\n${secondMs < 50 && identical ? 'PASS' : 'CHECK LOGS'}: second call served from cache`);
}

main().catch((err) => {
  console.error('test script failed:', err);
  process.exit(1);
});
