import axios from 'axios';

// Thin wrapper over Apify's run-sync-get-dataset-items endpoint. Runs an actor
// to completion and returns its dataset rows. Bounded by both the Apify-side
// `timeout` (so the platform stops billing) and an axios timeout slightly
// beyond it. Fail-soft: any error (no key, timeout, actor failure) returns [].

const APIFY_BASE = 'https://api.apify.com/v2/acts';

export async function runApifyActor<T = Record<string, unknown>>(
  actorSlug: string,
  input: Record<string, unknown>,
  opts: { timeoutMs: number }
): Promise<T[]> {
  const token = process.env.APIFY_API_KEY;
  if (!token) return [];

  const apifyTimeoutSecs = Math.ceil(opts.timeoutMs / 1000);
  try {
    const res = await axios.post<T[]>(
      `${APIFY_BASE}/${actorSlug}/run-sync-get-dataset-items?token=${token}&timeout=${apifyTimeoutSecs}`,
      input,
      {
        headers: { 'Content-Type': 'application/json' },
        // Give axios a little slack over the Apify-side timeout.
        timeout: opts.timeoutMs + 5_000,
      }
    );
    return Array.isArray(res.data) ? res.data : [];
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[apify:${actorSlug}] run failed:`, msg);
    return [];
  }
}
