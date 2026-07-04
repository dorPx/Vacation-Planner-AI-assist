import { Router, Request, Response } from 'express';
import { db } from '../db';
import { TripItinerary } from '../../../shared/types';

const router = Router();

// GET /api/trips  — list all saved trips
router.get('/', (_req: Request, res: Response) => {
  const trips = db.prepare(`
    SELECT id, name, destination, start_date, end_date, budget_usd, trip_type, created_at
    FROM trips ORDER BY created_at DESC
  `).all();
  return res.json(trips);
});

// GET /api/trips/:id  — get full trip with itinerary
router.get('/:id', (req: Request, res: Response) => {
  const row = db.prepare('SELECT * FROM trips WHERE id = ?').get(req.params.id) as
    | { itinerary_json: string; [k: string]: unknown }
    | undefined;
  if (!row) return res.status(404).json({ error: 'Trip not found' });
  const itinerary: TripItinerary = JSON.parse(row.itinerary_json);
  return res.json(itinerary);
});

// DELETE /api/trips/:id
router.delete('/:id', (req: Request, res: Response) => {
  db.prepare('DELETE FROM trips WHERE id = ?').run(req.params.id);
  return res.json({ success: true });
});

export default router;
