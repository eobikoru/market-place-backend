import { Router, Request, Response } from 'express';
import { pool } from '../db/pool.js';
import { optionalAuth } from '../middleware/auth.js';

const router = Router();

router.get('/', optionalAuth, async (_req: Request, res: Response) => {
  const r = await pool.query(
    'SELECT id, name, slug, description, icon_url, created_at FROM service_categories ORDER BY name'
  );
  return res.json(r.rows);
});

router.get('/:id', optionalAuth, async (req: Request, res: Response) => {
  const { id } = req.params;
  const r = await pool.query(
    'SELECT id, name, slug, description, icon_url, created_at FROM service_categories WHERE id = $1',
    [id]
  );
  const row = r.rows[0];
  if (!row) return res.status(404).json({ error: 'Service not found' });
  return res.json(row);
});

export default router;
