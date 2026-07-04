import { Router, Request, Response } from 'express';
import axios from 'axios';
import { db } from '../db';
import { TripItinerary, SearchParams } from '../../../shared/types';

const router = Router();

// POST /api/ai/plan  — generate a full itinerary via OpenRouter
router.post('/plan', async (req: Request, res: Response) => {
  const body = req.body as {
    params: SearchParams;
    name: string;
    budget_usd: number;
    hotels?: unknown[];
    flights?: unknown[];
    activities?: unknown[];
    restaurants?: unknown[];
  };

  const { params, name, budget_usd, hotels = [], flights = [], activities = [], restaurants = [] } = body;

  const systemPrompt = `You are an expert travel planner. Given destination data, create a detailed day-by-day vacation itinerary.
Always respond with a valid JSON object matching the TripItinerary structure.`;

  const userPrompt = `Plan a ${params.trip_type ?? 'leisure'} trip to ${params.destination} from ${params.checkin} to ${params.checkout}.
Budget: $${budget_usd} USD total.

Available hotels (pick the best fit):
${JSON.stringify(hotels.slice(0, 5), null, 2)}

Available flights:
${JSON.stringify(flights.slice(0, 3), null, 2)}

Available activities:
${JSON.stringify(activities.slice(0, 10), null, 2)}

Available restaurants:
${JSON.stringify(restaurants.slice(0, 10), null, 2)}

Respond ONLY with a JSON object with this structure:
{
  "id": "<uuid>",
  "name": "${name}",
  "destination": "${params.destination}",
  "trip_type": "${params.trip_type ?? 'leisure'}",
  "total_cost": <number>,
  "days": [
    {
      "day": 1,
      "date": "<YYYY-MM-DD>",
      "hotel": <hotel object or null>,
      "activities": [<activity objects>],
      "meals": [<restaurant objects>],
      "estimated_cost": <number>
    }
  ]
}`;

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Vacation Planner',
        },
      }
    );

    const content = response.data.choices?.[0]?.message?.content ?? '{}';
    const itinerary: TripItinerary = JSON.parse(content);
    if (!itinerary.id) itinerary.id = generateId();

    // Persist trip to SQLite
    db.prepare(`
      INSERT OR REPLACE INTO trips (id, name, destination, start_date, end_date, budget_usd, trip_type, itinerary_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      itinerary.id,
      itinerary.name,
      itinerary.destination,
      params.checkin,
      params.checkout,
      budget_usd,
      itinerary.trip_type,
      JSON.stringify(itinerary),
      new Date().toISOString()
    );

    return res.json(itinerary);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

// POST /api/ai/chat  — conversational refinement
router.post('/chat', async (req: Request, res: Response) => {
  const { messages, context } = req.body as {
    messages: { role: string; content: string }[];
    context?: string;
  };

  try {
    const response = await axios.post(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        model: 'anthropic/claude-3.5-sonnet',
        messages: [
          {
            role: 'system',
            content: `You are a helpful AI vacation planning assistant. ${context ? `Current trip context: ${context}` : ''}`,
          },
          ...messages,
        ],
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'Vacation Planner',
        },
      }
    );

    return res.json({ message: response.data.choices?.[0]?.message?.content ?? '' });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

function generateId(): string {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

export default router;
