import axios from 'axios';
import type { Response } from 'express';
import { cache } from '../db';
import type { HotelResult, ActivityResult, RestaurantResult } from '../../../shared/types';

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';
const MODELS_CACHE_KEY = 'ai-engine:models';
const MODELS_CACHE_TTL_SECONDS = 60 * 60; // 1 hour

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ScrapedData {
  hotels?: HotelResult[];
  activities?: ActivityResult[];
  restaurants?: RestaurantResult[];
}

export interface StreamItineraryParams {
  destination: string;
  budget: number;
  start_date: string;
  end_date: string;
  model: string;
  scraped_data: ScrapedData;
  trip_type?: string;
}

export interface RandomTripParams {
  budget: number;
  start_date: string;
  end_date: string;
  model: string;
}

export interface RandomTripResult {
  destination: string;
  trip_type: string;
  rationale: string;
}

export interface ModelOption {
  id: string;
  name: string;
  context_length: number;
  pricing: { prompt: string; completion: string };
}

interface OpenRouterModel {
  id: string;
  name?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { modality?: string; input_modalities?: string[]; output_modalities?: string[] };
  supported_parameters?: string[];
}

// ---------------------------------------------------------------------------
// Destination pool
// ---------------------------------------------------------------------------

type BudgetTier = 'under_1000' | '1000_3000' | 'over_3000';

const DESTINATION_POOL: Record<BudgetTier, string[]> = {
  under_1000: ['Bangkok', 'Lisbon', 'Prague', 'Chiang Mai', 'Mexico City', 'Tbilisi', 'Medellín', 'Belgrade', 'Hanoi', 'Oaxaca'],
  '1000_3000': ['Barcelona', 'Tokyo', 'Bali', 'Marrakech', 'Reykjavik', 'Cape Town', 'Buenos Aires', 'Istanbul', 'Kyoto', 'Lima'],
  over_3000: ['Paris', 'Maldives', 'Santorini', 'Swiss Alps', 'Amalfi Coast', 'Patagonia', 'New Zealand', 'Bora Bora', 'Seychelles', 'Safari Kenya'],
};

const TRIP_TYPES = ['budget_adventure', 'luxury_escape', 'cultural_immersion', 'beach_retreat', 'city_explorer'] as const;
type TripType = (typeof TRIP_TYPES)[number];

function budgetTier(budget: number): BudgetTier {
  if (budget < 1000) return 'under_1000';
  if (budget <= 3000) return '1000_3000';
  return 'over_3000';
}

// ---------------------------------------------------------------------------
// Prompt builders
// ---------------------------------------------------------------------------

export function buildSystemPrompt(): string {
  return `You are an expert travel planner with over 20 years of experience designing unforgettable, budget-conscious trips for clients all over the world.

Your job is to build a detailed day-by-day itinerary that fits EXACTLY within the traveler's stated budget — do not exceed it, and try not to leave significant amounts unspent.

You will be given real, currently available pricing data for hotels, activities, and restaurants that was scraped moments ago. You MUST reference this actual scraped data wherever relevant (use the real names, prices, and ratings provided) rather than inventing generic options. Only fall back to your own knowledge when the scraped data doesn't cover something you need.

Format your entire response using this exact structure for every day:

## Day N — <date>

**Morning**
<activities, with costs>

**Afternoon**
<activities, with costs>

**Evening**
<dinner / nightlife / activities, with costs>

**Daily Cost: $X**

At the very end of the itinerary, include:

## Grand Total: $X

Whenever you recommend an option (hotel, activity, or restaurant) that offers exceptional value relative to its price and rating, tag it inline with [BEST VALUE].`;
}

function topByRating<T extends { rating: number }>(items: T[] = [], n: number): T[] {
  return [...items].sort((a, b) => b.rating - a.rating).slice(0, n);
}

export function diffDaysInclusive(start: string, end: string): number {
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return Math.max(1, Math.round(ms / 86400000) + 1);
}

export function buildUserMessage(params: StreamItineraryParams): string {
  const { destination, budget, start_date, end_date, trip_type, scraped_data } = params;
  const numDays = diffDaysInclusive(start_date, end_date);

  const topHotels = topByRating(scraped_data.hotels, 5);
  const topActivities = topByRating(scraped_data.activities, 10);
  const topRestaurants = topByRating(scraped_data.restaurants, 5);

  return `Plan a trip to ${destination}.

Total budget: $${budget} USD (must fit exactly within this amount)
Dates: ${start_date} to ${end_date} (${numDays} day${numDays === 1 ? '' : 's'})
Trip type: ${trip_type ?? 'leisure'}

Here is real, currently available pricing data scraped for this destination. Use these actual names, prices, and ratings in your recommendations wherever they fit:

Top hotels by rating:
${JSON.stringify(topHotels, null, 2)}

Top activities by rating:
${JSON.stringify(topActivities, null, 2)}

Top restaurants by rating:
${JSON.stringify(topRestaurants, null, 2)}

Build the full ${numDays}-day itinerary now, following the required Day/Morning/Afternoon/Evening/Daily Cost format, tagging best-value picks with [BEST VALUE], and ending with the Grand Total.`;
}

// ---------------------------------------------------------------------------
// Engine
// ---------------------------------------------------------------------------

export class OpenRouterEngine {
  private get apiKey(): string {
    return process.env.OPENROUTER_API_KEY ?? '';
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'Vacation Planner',
    };
  }

  // -------------------------------------------------------------------------
  // 1. streamItinerary
  // -------------------------------------------------------------------------

  async streamItinerary(params: StreamItineraryParams, res: Response): Promise<void> {
    const systemPrompt = buildSystemPrompt();
    const userMessage = buildUserMessage(params);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    try {
      const upstream = await axios.post(
        `${OPENROUTER_BASE}/chat/completions`,
        {
          model: params.model,
          stream: true,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userMessage },
          ],
        },
        {
          headers: this.headers(),
          responseType: 'stream',
        }
      );

      let buffer = '';

      await new Promise<void>((resolve) => {
        upstream.data.on('data', (chunk: Buffer) => {
          buffer += chunk.toString('utf8');
          const lines = buffer.split('\n');
          buffer = lines.pop() ?? '';

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith('data:')) continue;
            const payload = trimmed.slice(5).trim();

            if (payload === '[DONE]') {
              res.write('data: [DONE]\n\n');
              continue;
            }

            try {
              const json = JSON.parse(payload);
              const content = json.choices?.[0]?.delta?.content;
              if (content) {
                res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
              }
            } catch {
              // ignore malformed SSE fragments
            }
          }
        });

        upstream.data.on('end', () => {
          res.write('data: [DONE]\n\n');
          res.end();
          resolve();
        });

        upstream.data.on('error', (err: Error) => {
          res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
          res.end();
          resolve();
        });
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      res.write(`data: ${JSON.stringify({ error: message })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
    }
  }

  // -------------------------------------------------------------------------
  // 2. generateRandomTrip
  // -------------------------------------------------------------------------

  async generateRandomTrip(params: RandomTripParams): Promise<RandomTripResult> {
    const tier = budgetTier(params.budget);
    const tripType: TripType = TRIP_TYPES[Math.floor(Math.random() * TRIP_TYPES.length)];
    const pool = DESTINATION_POOL[tier];
    const destination = pool[Math.floor(Math.random() * pool.length)];

    const numDays = diffDaysInclusive(params.start_date, params.end_date);

    const rationale = await this.generateRationale({
      destination,
      tripType,
      budget: params.budget,
      numDays,
      model: params.model,
    });

    return { destination, trip_type: tripType, rationale };
  }

  private async generateRationale(opts: {
    destination: string;
    tripType: string;
    budget: number;
    numDays: number;
    model: string;
  }): Promise<string> {
    const { destination, tripType, budget, numDays, model } = opts;

    try {
      const response = await axios.post(
        `${OPENROUTER_BASE}/chat/completions`,
        {
          model,
          stream: false,
          messages: [
            {
              role: 'system',
              content:
                'You are an expert travel planner. Respond with exactly two sentences explaining why a destination and trip type fit a given budget and trip length. No preamble, no extra commentary — just the two sentences.',
            },
            {
              role: 'user',
              content: `Destination: ${destination}\nTrip type: ${tripType}\nBudget: $${budget} USD\nTrip length: ${numDays} day${numDays === 1 ? '' : 's'}\n\nWrite exactly two sentences explaining why this destination and trip type fit this budget.`,
            },
          ],
        },
        { headers: this.headers(), timeout: 20_000 }
      );

      const text: string = response.data?.choices?.[0]?.message?.content ?? '';
      return text.trim();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[ai-engine] generateRationale failed:', message);
      return `${destination} is a great fit for a ${tripType.replace('_', ' ')} trip within a $${budget} budget over ${numDays} day${numDays === 1 ? '' : 's'}.`;
    }
  }

  // -------------------------------------------------------------------------
  // 3. getAvailableModels
  // -------------------------------------------------------------------------

  async getAvailableModels(): Promise<ModelOption[]> {
    const cached = cache.get<ModelOption[]>(MODELS_CACHE_KEY);
    if (cached) return cached;

    const response = await axios.get(`${OPENROUTER_BASE}/models`, {
      headers: { Authorization: `Bearer ${this.apiKey}` },
      timeout: 15_000,
    });

    const rawModels: OpenRouterModel[] = response.data?.data ?? [];

    const chatModels = rawModels.filter((m) => {
      // Chat-capable means text OUT. The old check tested the whole modality
      // string for 'text', which passed "text->audio" models (Google's Lyria
      // music model topped the free list and became the default planner —
      // confirmed live). Parse the output side of "in->out" explicitly.
      const modality = m.architecture?.modality ?? '';
      const outputModalities = m.architecture?.output_modalities ?? [];
      if (outputModalities.length > 0) return outputModalities.includes('text');
      if (modality.includes('->')) return (modality.split('->')[1] ?? '').includes('text');
      return modality === '' || modality.includes('text');
    });

    const models: ModelOption[] = chatModels.map((m) => ({
      id: m.id,
      name: m.name ?? m.id,
      context_length: m.context_length ?? 0,
      pricing: {
        prompt: m.pricing?.prompt ?? '0',
        completion: m.pricing?.completion ?? '0',
      },
    }));

    models.sort((a, b) => {
      const aFree = a.pricing.prompt === '0';
      const bFree = b.pricing.prompt === '0';
      if (aFree !== bFree) return aFree ? -1 : 1;
      return b.context_length - a.context_length;
    });

    cache.set(MODELS_CACHE_KEY, models, MODELS_CACHE_TTL_SECONDS);
    return models;
  }
}

export const aiEngine = new OpenRouterEngine();
