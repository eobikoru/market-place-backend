import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { config } from '../config/index.js';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';

const router = Router();

function signToken(userId: string, email: string, role: string) {
  return jwt.sign(
    { userId, email, role },
    config.jwt.secret,
    { expiresIn: config.jwt.expiresIn as jwt.SignOptions['expiresIn'] }
  );
}

router.post(
  '/register',
  [
    body('name').trim().isLength({ min: 2, max: 255 }),
    body('email').isEmail().normalizeEmail(),
    body('phone').optional().trim(),
    body('password').isLength({ min: 8 }),
    body('role').optional().isIn(['customer', 'worker']),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { name, email, phone, password, role = 'customer' } = req.body;
    const passwordHash = await bcrypt.hash(password, 12);

    try {
      const r = await pool.query(
        `INSERT INTO users (name, email, phone, password_hash, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, name, email, phone, role, created_at`,
        [name, email, phone || null, passwordHash, role]
      );
      const user = r.rows[0];
      await pool.query('INSERT INTO wallets (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING', [user.id]);
      const token = signToken(user.id, user.email, user.role);
      return res.status(201).json({ user: { id: user.id, name: user.name, email: user.email, phone: user.phone, role: user.role }, token });
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === '23505') return res.status(409).json({ error: 'Email already registered' });
      throw e;
    }
  }
);

router.post(
  '/login',
  [body('email').isEmail().normalizeEmail(), body('password').exists()],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;
    const r = await pool.query(
      'SELECT id, name, email, phone, password_hash, role, avatar_url FROM users WHERE email = $1',
      [email]
    );
    const user = r.rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const token = signToken(user.id, user.email, user.role);
    delete user.password_hash;
    return res.json({ user, token });
  }
);

router.get('/me', authMiddleware, async (req: AuthRequest, res: Response) => {
  const r = await pool.query(
    `SELECT id, name, email, phone, role, latitude, longitude, avatar_url, created_at
     FROM users WHERE id = $1`,
    [req.user!.id]
  );
  const user = r.rows[0];
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (user.role === 'worker') {
    const w = await pool.query(
      `SELECT w.id, w.bio, w.price_min, w.price_max, w.rating, w.review_count, w.verified, w.id_verified, w.featured, sc.name as service_name, sc.slug as service_slug
       FROM workers w
       JOIN service_categories sc ON sc.id = w.service_category_id
       WHERE w.user_id = $1`,
      [req.user!.id]
    );
    (user as Record<string, unknown>).workerProfile = w.rows;
  }

  const wallet = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user!.id]);
  (user as Record<string, unknown>).walletBalance = wallet.rows[0]?.balance ?? 0;

  return res.json(user);
});

router.patch(
  '/me',
  authMiddleware,
  [
    body('name').optional().trim().isLength({ min: 2, max: 255 }),
    body('phone').optional().trim(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('avatar_url').optional().isURL(),
  ],
  async (req: AuthRequest, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const updates: string[] = [];
    const values: unknown[] = [];
    let i = 1;
    for (const key of ['name', 'phone', 'latitude', 'longitude', 'avatar_url']) {
      if (req.body[key] !== undefined) {
        updates.push(`${key} = $${i++}`);
        values.push(req.body[key]);
      }
    }
    if (updates.length === 0) return res.status(400).json({ error: 'No fields to update' });
    values.push(req.user!.id);
    await pool.query(
      `UPDATE users SET ${updates.join(', ')}, updated_at = NOW() WHERE id = $${i}`,
      values
    );
    return res.json({ ok: true });
  }
);

export default router;
