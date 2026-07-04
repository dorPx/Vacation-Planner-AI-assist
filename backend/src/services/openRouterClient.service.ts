import axios, { AxiosResponse } from 'axios';
import {
  buildSystemPrompt,
  buildUserMessage,
  type ScrapedData,
} from '../ai/openrouter';

// ---------------------------------------------------------------------------
// Thin OpenRouter client for the supplementary trip-planner feature (Phase 3).
//
// streamItinerary() returns an async generator of content chunks — it never
// buffers the full completion, because the SSE route depends on incremental
// chunks. A primary→fallback model path retries once when the primary model
// fails BEFORE the first token; a mid-stream failure propagates instead
// (silently restarting a half-streamed itinerary would duplicate content).
//
// callOpenRouter() is the shared auth/transport helper — the interest
// classifier reuses it so headers and error semantics live in one place.
// ---------------------------------------------------------------------------

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

const DEFAULT_MODEL = 'anthropic/claude-sonnet-4.5';
const FALLBACK_MODEL = 'anthropic/claude-3.5-sonnet';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CallOpenRouterOptions {
  timeoutMs?: number;
  stream?: boolean;
}

/** Single POST /chat/completions call — shared headers/auth for all OpenRouter callers. */
export function callOpenRouter<T = unknown>(
  body: Record<string, unknown>,
  options: CallOpenRouterOptions = {}
): Promise<AxiosResponse<T>> {
  return axios.post<T>(`${OPENROUTER_BASE}/chat/completions`, body, {
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Vacation Planner',
    },
    timeout: options.timeoutMs,
    responseType: options.stream ? 'stream' : 'json',
  });
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

export interface StreamItineraryArgs {
  destination: string;
  days: number;
  preferences: {
    budget: number;
    start_date: string;
    end_date: string;
    trip_type?: string;
    /** Per-request model from the frontend picker; falls back to OPENROUTER_MODEL. */
    model?: string;
    scraped_data: ScrapedData;
  };
  /** Pre-formatted supplementary block (formatForPrompt) — omitted entirely when absent. */
  supplementaryContext?: string;
}

/** Streams one model's completion; throws on transport/setup errors. */
async function* streamModel(model: string, messages: ChatMessage[]): AsyncGenerator<string> {
  const response = await callOpenRouter({ model, stream: true, messages }, { stream: true });

  let buffer = '';
  for await (const chunk of response.data as AsyncIterable<Buffer>) {
    buffer += chunk.toString('utf8');
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('data:')) continue;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return;

      let json: { choices?: { delta?: { content?: string } }[]; error?: { message?: string } };
      try {
        json = JSON.parse(payload);
      } catch {
        continue; // malformed SSE fragment — same tolerance as the existing engine
      }
      // OpenRouter reports mid-stream provider errors as data events.
      if (json.error) throw new Error(json.error.message ?? 'OpenRouter mid-stream error');
      const content = json.choices?.[0]?.delta?.content;
      if (content) yield content;
    }
  }
}

/**
 * Streams an itinerary as incremental text chunks. Tries the primary model,
 * then the fallback if the primary fails before yielding anything.
 */
export async function* streamItinerary(args: StreamItineraryArgs): AsyncGenerator<string> {
  const primary = args.preferences.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;
  const fallback = process.env.OPENROUTER_FALLBACK_MODEL ?? FALLBACK_MODEL;
  const models = [...new Set([primary, fallback])];

  const systemPrompt = buildSystemPrompt();
  let userMessage = buildUserMessage({
    destination: args.destination,
    budget: args.preferences.budget,
    start_date: args.preferences.start_date,
    end_date: args.preferences.end_date,
    trip_type: args.preferences.trip_type,
    model: primary,
    scraped_data: args.preferences.scraped_data,
  });

  if (args.supplementaryContext) {
    userMessage += `

An external AI trip-planning service also suggested the following ideas for this trip:

${args.supplementaryContext}

Weave in any of these suggestions that genuinely fit the budget, dates, and trip type — use their specific names and locations. Ignore any that don't fit.`;
  }

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userMessage },
  ];

  let lastError: unknown;
  for (const model of models) {
    let yieldedAny = false;
    try {
      for await (const chunk of streamModel(model, messages)) {
        yieldedAny = true;
        yield chunk;
      }
      return;
    } catch (err: unknown) {
      lastError = err;
      // Content already reached the client — a silent retry would duplicate
      // half an itinerary. Surface the error instead.
      if (yieldedAny) throw err;
      console.warn(
        `[openrouter-client] model ${model} failed before first token — ${
          model === models[models.length - 1] ? 'no fallback left' : 'trying fallback'
        }:`,
        err instanceof Error ? err.message : err
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}
