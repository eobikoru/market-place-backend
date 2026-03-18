import { Router, Request, Response } from 'express';
import { query, body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { authMiddleware, requireRole, AuthRequest } from '../middleware/auth.js';

const router = Router();

router.get(
  '/',
  [
    query('location').optional(),
    query('lat').optional().isFloat(),
    query('lng').optional().isFloat(),
    query('service').optional().isUUID(),
    query('min_rating').optional().isFloat({ min: 0, max: 5 }),
    query('max_price').optional().isFloat({ min: 0 }),
    query('verified').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 50 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const lat = req.query.lat ? parseFloat(req.query.lat as string) : null;
    const lng = req.query.lng ? parseFloat(req.query.lng as string) : null;
    const serviceId = (req.query.service as string) || null;
    const minRating = req.query.min_rating ? parseFloat(req.query.min_rating as string) : null;
    const maxPrice = req.query.max_price ? parseFloat(req.query.max_price as string) : null;
    const verified = req.query.verified === 'true' ? true : req.query.verified === 'false' ? false : null;
    const limit = Math.min(parseInt((req.query.limit as string) || '20', 10), 50);
    const offset = parseInt((req.query.offset as string) || '0', 10);

    let sql = `
      SELECT w.id, w.user_id, w.bio, w.price_min, w.price_max, w.rating, w.review_count, w.verified, w.featured,
             u.name, u.avatar_url, u.latitude, u.longitude,
             sc.name as service_name, sc.slug as service_slug
      FROM workers w
      JOIN users u ON u.id = w.user_id
      JOIN service_categories sc ON sc.id = w.service_category_id
      WHERE w.id_verified = true
    `;
    const params: unknown[] = [];
    let idx = 1;

    if (serviceId) {
      sql += ` AND w.service_category_id = $${idx++}`;
      params.push(serviceId);
    }
    if (minRating != null) {
      sql += ` AND w.rating >= $${idx++}`;
      params.push(minRating);
    }
    if (maxPrice != null) {
      sql += ` AND (w.price_min <= $${idx} OR w.price_max <= $${idx})`;
      params.push(maxPrice);
      idx++;
    }
    if (verified === true) {
      sql += ` AND w.verified = true`;
    }

    sql += ` ORDER BY w.featured DESC, w.rating DESC NULLS LAST`;
    sql += ` LIMIT $${idx++} OFFSET $${idx}`;
    params.push(limit, offset);

    const r = await pool.query(sql, params);
    let rows = r.rows;

    if (lat != null && lng != null && rows.length > 0) {
      rows = rows.map((row) => {
        const wLat = parseFloat(row.latitude);
        const wLng = parseFloat(row.longitude);
        const dist = haversineKm(lat, lng, wLat, wLng);
        return { ...row, distance_km: Math.round(dist * 100) / 100 };
      });
      rows.sort((a, b) => (a.distance_km ?? 999) - (b.distance_km ?? 999));
    }

    return res.json(rows);
  }
);

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

router.get('/:id', async (req: Request, res: Response) => {
  const r = await pool.query(
    `SELECT w.id, w.user_id, w.bio, w.price_min, w.price_max, w.rating, w.review_count, w.verified, w.featured,
            u.name, u.avatar_url, u.phone, u.latitude, u.longitude,
            sc.name as service_name, sc.slug as service_slug
     FROM workers w
     JOIN users u ON u.id = w.user_id
     JOIN service_categories sc ON sc.id = w.service_category_id
     WHERE w.id = $1`,
    [req.params.id]
  );
  const worker = r.rows[0];
  if (!worker) return res.status(404).json({ error: 'Worker not found' });

  const reviews = await pool.query(
    `SELECT r.rating, r.comment, r.created_at, u.name as user_name
     FROM reviews r JOIN users u ON u.id = r.user_id
     WHERE r.worker_id = $1 ORDER BY r.created_at DESC LIMIT 10`,
    [req.params.id]
  );
  (worker as Record<string, unknown>).reviews = reviews.rows;
  return res.json(worker);
});

router.post(
  '/apply',
  authMiddleware,
  requireRole('worker'),
  [
    body('service_category_id').isUUID(),
    body('bio').optional().trim(),
    body('price_min').isFloat({ min: 0 }),
    body('price_max').optional().isFloat({ min: 0 }),
    body('id_document_url').optional().isURL(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { service_category_id, bio, price_min, price_max, id_document_url } = req.body;
    try {
      const r = await pool.query(
        `INSERT INTO workers (user_id, service_category_id, bio, price_min, price_max, id_document_url)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (user_id, service_category_id) DO UPDATE SET
           bio = EXCLUDED.bio, price_min = EXCLUDED.price_min, price_max = EXCLUDED.price_max,
           id_document_url = COALESCE(EXCLUDED.id_document_url, workers.id_document_url), updated_at = NOW()
         RETURNING id, user_id, service_category_id, bio, price_min, price_max, rating, verified`,
        [req.user!.id, service_category_id, bio || null, price_min, price_max || null, id_document_url || null]
      );
      return res.status(201).json(r.rows[0]);
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === '23503') return res.status(400).json({ error: 'Invalid service category' });
      throw e;
    }
  }
);

export default router;
