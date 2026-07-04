import { Router, Request, Response } from 'express';
import { aiEngine } from '../ai/openrouter';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  try {
    const models = await aiEngine.getAvailableModels();
    return res.json(models);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return res.status(500).json({ error: message });
  }
});

export default router;
