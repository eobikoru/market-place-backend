import { Router } from 'express';
import { param, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
const router = Router();
router.use(authMiddleware);
router.get('/', async (req, res) => {
    const r = await pool.query(`SELECT id, type, title, body, reference_id, reference_type, read_at, created_at
     FROM notifications WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50`, [req.user.id]);
    return res.json(r.rows);
});
router.patch('/:id/read', [param('id').isUUID()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    await pool.query('UPDATE notifications SET read_at = NOW() WHERE id = $1 AND user_id = $2', [req.params.id, req.user.id]);
    return res.json({ ok: true });
});
export default router;
//# sourceMappingURL=notifications.js.map