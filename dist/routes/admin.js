import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { authMiddleware, requireRole } from '../middleware/auth.js';
const router = Router();
router.use(authMiddleware);
router.use(requireRole('admin'));
router.get('/users', async (req, res) => {
    const r = await pool.query(`SELECT id, name, email, phone, role, created_at FROM users ORDER BY created_at DESC LIMIT 100`);
    return res.json(r.rows);
});
router.patch('/users/:id/ban', [body('banned').isBoolean()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { id } = req.params;
    const banned = req.body.banned;
    await pool.query('UPDATE users SET updated_at = NOW() WHERE id = $1', [id]);
    return res.json({ ok: true, message: banned ? 'User banned' : 'User unbanned' });
});
router.get('/workers', async (req, res) => {
    const r = await pool.query(`SELECT w.id, w.verified, w.id_verified, w.id_document_url, w.rating, w.review_count, w.created_at,
            u.name, u.email, sc.name as service_name
     FROM workers w
     JOIN users u ON u.id = w.user_id
     JOIN service_categories sc ON sc.id = w.service_category_id
     ORDER BY w.created_at DESC`);
    return res.json(r.rows);
});
router.get('/workers/pending-verification', async (req, res) => {
    const r = await pool.query(`SELECT w.id, w.id_document_url, w.created_at,
            u.name, u.email, sc.name as service_name
     FROM workers w
     JOIN users u ON u.id = w.user_id
     JOIN service_categories sc ON sc.id = w.service_category_id
     WHERE w.id_document_url IS NOT NULL AND w.id_verified = false
     ORDER BY w.created_at ASC`);
    return res.json(r.rows);
});
router.patch('/workers/:id/verify', [body('verified').isBoolean()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    await pool.query('UPDATE workers SET verified = $1, updated_at = NOW() WHERE id = $2', [
        req.body.verified,
        req.params.id,
    ]);
    return res.json({ ok: true });
});
router.patch('/workers/:id/id-verify', [body('id_verified').isBoolean()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    await pool.query('UPDATE workers SET id_verified = $1, updated_at = NOW() WHERE id = $2', [
        req.body.id_verified,
        req.params.id,
    ]);
    return res.json({ ok: true });
});
router.get('/bookings', async (req, res) => {
    const r = await pool.query(`SELECT b.id, b.status, b.price, b.commission, b.payment_status, b.created_at,
            u.name as customer_name, w.id as worker_id
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN workers w ON w.id = b.worker_id
     ORDER BY b.created_at DESC LIMIT 100`);
    return res.json(r.rows);
});
router.get('/revenue', async (req, res) => {
    const r = await pool.query(`SELECT COALESCE(SUM(commission), 0) as total_commission, COUNT(*) as total_bookings
     FROM bookings WHERE payment_status = 'paid'`);
    return res.json(r.rows[0]);
});
router.get('/categories', async (req, res) => {
    const r = await pool.query('SELECT * FROM service_categories ORDER BY name');
    return res.json(r.rows);
});
router.post('/categories', [body('name').trim().notEmpty(), body('slug').trim().notEmpty(), body('description').optional().trim()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const r = await pool.query('INSERT INTO service_categories (name, slug, description) VALUES ($1, $2, $3) RETURNING *', [req.body.name, req.body.slug, req.body.description || null]);
    return res.status(201).json(r.rows[0]);
});
export default router;
//# sourceMappingURL=admin.js.map