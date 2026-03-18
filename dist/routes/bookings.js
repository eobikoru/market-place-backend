import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
import { bookLimiter } from '../middleware/rateLimit.js';
import { createNotification } from '../services/notifications.js';
const COMMISSION_RATE = 0.1;
const CANCEL_FREE_HOURS = 24; // Free cancel if more than 24h before scheduled_at
const router = Router();
router.use(authMiddleware);
router.post('/book', bookLimiter, [
    body('worker_id').isUUID(),
    body('service_category_id').isUUID(),
    body('price').isFloat({ min: 0 }),
    body('address').trim().notEmpty(),
    body('latitude').optional().isFloat(),
    body('longitude').optional().isFloat(),
    body('scheduled_at').isISO8601(),
    body('notes').optional().trim(),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { worker_id, service_category_id, price, address, latitude, longitude, scheduled_at, notes } = req.body;
    const commission = Math.round(price * COMMISSION_RATE * 100) / 100;
    const workerCheck = await pool.query('SELECT id, user_id FROM workers WHERE id = $1 AND service_category_id = $2', [worker_id, service_category_id]);
    if (!workerCheck.rows[0])
        return res.status(400).json({ error: 'Invalid worker or service' });
    const r = await pool.query(`INSERT INTO bookings (user_id, worker_id, service_category_id, price, commission, address, latitude, longitude, scheduled_at, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING id, user_id, worker_id, status, price, commission, address, scheduled_at, payment_status, created_at`, [req.user.id, worker_id, service_category_id, price, commission, address, latitude || null, longitude || null, scheduled_at, notes || null]);
    const row = r.rows[0];
    const workerUser = await pool.query('SELECT user_id FROM workers WHERE id = $1', [worker_id]);
    if (workerUser.rows[0]) {
        const serviceName = await pool.query('SELECT name FROM service_categories WHERE id = $1', [service_category_id]);
        const name = serviceName.rows[0]?.name || 'Service';
        await createNotification(workerUser.rows[0].user_id, 'booking_created', 'New booking', `You have a new ${name} booking. Accept or decline from Appointments.`, row.id, 'booking').catch(() => { });
    }
    return res.status(201).json(row);
});
router.get('/my-bookings', async (req, res) => {
    const r = await pool.query(`SELECT b.id, b.status, b.price, b.commission, b.address, b.scheduled_at, b.completed_at, b.payment_status, b.notes, b.created_at,
            w.id as worker_id, u.name as worker_name, u.avatar_url as worker_avatar, w.rating as worker_rating,
            sc.name as service_name
     FROM bookings b
     JOIN workers w ON w.id = b.worker_id
     JOIN users u ON u.id = w.user_id
     JOIN service_categories sc ON sc.id = b.service_category_id
     WHERE b.user_id = $1
     ORDER BY b.created_at DESC`, [req.user.id]);
    return res.json(r.rows);
});
router.get('/worker-jobs', async (req, res) => {
    const worker = await pool.query('SELECT id FROM workers WHERE user_id = $1', [req.user.id]);
    if (!worker.rows[0])
        return res.json([]);
    const r = await pool.query(`SELECT b.id, b.status, b.price, b.commission, b.address, b.scheduled_at, b.completed_at, b.payment_status, b.notes, b.created_at,
            u.name as customer_name, u.phone as customer_phone,
            sc.name as service_name
     FROM bookings b
     JOIN users u ON u.id = b.user_id
     JOIN service_categories sc ON sc.id = b.service_category_id
     WHERE b.worker_id = $1
     ORDER BY b.created_at DESC`, [worker.rows[0].id]);
    return res.json(r.rows);
});
router.patch('/:id/status', [
    body('status').isIn(['accepted', 'in_progress', 'completed', 'cancelled']),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { id } = req.params;
    const { status } = req.body;
    const booking = await pool.query(`SELECT b.id, b.worker_id, b.user_id, b.status, b.price, b.commission, b.payment_status, b.scheduled_at
       FROM bookings b JOIN workers w ON w.id = b.worker_id WHERE b.id = $1 AND (b.user_id = $2 OR w.user_id = $2)`, [id, req.user.id]);
    const row = booking.rows[0];
    if (!row)
        return res.status(404).json({ error: 'Booking not found' });
    const worker = await pool.query('SELECT user_id FROM workers WHERE id = $1', [row.worker_id]);
    const isWorker = worker.rows[0]?.user_id === req.user.id;
    const allowed = {
        pending: isWorker ? ['accepted', 'cancelled'] : ['cancelled'],
        accepted: ['in_progress', 'cancelled'],
        in_progress: ['completed'],
        completed: [],
        cancelled: [],
    };
    if (!allowed[row.status]?.includes(status)) {
        return res.status(400).json({ error: `Cannot change status from ${row.status} to ${status}` });
    }
    if (status === 'completed') {
        await pool.query('UPDATE bookings SET status = $1, payment_status = $2, completed_at = NOW(), updated_at = NOW() WHERE id = $3', [status, 'paid', id]);
        const workerWallet = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [worker.rows[0].user_id]);
        if (workerWallet.rows[0]) {
            const workerEarnings = row.price - row.commission;
            await pool.query('UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [workerEarnings, workerWallet.rows[0].id]);
            await pool.query('INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, reference_type) VALUES ($1, $2, $3, $4, $5)', [workerWallet.rows[0].id, workerEarnings, 'payout', id, 'booking']);
            await createNotification(worker.rows[0].user_id, 'payout', 'Payment received', `₦${Number(workerEarnings).toLocaleString()} added to your wallet for this job.`, id, 'booking').catch(() => { });
        }
        await createNotification(row.user_id, 'booking_completed', 'Job completed', 'Your booking has been marked complete. You can leave a review from My bookings.', id, 'booking').catch(() => { });
    }
    else if (status === 'cancelled') {
        await pool.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
        await createNotification(isWorker ? row.user_id : worker.rows[0].user_id, 'booking_cancelled', 'Booking cancelled', isWorker ? 'The worker declined or cancelled this booking.' : 'The customer cancelled this booking.', id, 'booking').catch(() => { });
        // Customer cancel: refund if paid and cancelled more than CANCEL_FREE_HOURS before scheduled_at
        if (!isWorker && row.payment_status === 'paid') {
            const scheduledAt = new Date(row.scheduled_at).getTime();
            const hoursUntil = (scheduledAt - Date.now()) / (60 * 60 * 1000);
            if (hoursUntil >= CANCEL_FREE_HOURS) {
                const customerWallet = await pool.query('SELECT id FROM wallets WHERE user_id = $1', [row.user_id]);
                if (customerWallet.rows[0]) {
                    await pool.query('UPDATE wallets SET balance = balance + $1, updated_at = NOW() WHERE id = $2', [row.price, customerWallet.rows[0].id]);
                    await pool.query('INSERT INTO wallet_transactions (wallet_id, amount, type, reference_id, reference_type) VALUES ($1, $2, $3, $4, $5)', [customerWallet.rows[0].id, row.price, 'refund', id, 'booking']);
                    await pool.query('UPDATE bookings SET payment_status = $1, updated_at = NOW() WHERE id = $2', ['refunded', id]);
                }
            }
        }
    }
    else {
        await pool.query('UPDATE bookings SET status = $1, updated_at = NOW() WHERE id = $2', [status, id]);
        if (status === 'accepted') {
            await createNotification(row.user_id, 'booking_accepted', 'Booking accepted', 'Your booking has been accepted by the worker.', id, 'booking').catch(() => { });
        }
    }
    const updated = await pool.query('SELECT * FROM bookings WHERE id = $1', [id]);
    return res.json(updated.rows[0]);
});
router.post('/:id/review', [body('rating').isInt({ min: 1, max: 5 }), body('comment').optional().trim()], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { id } = req.params;
    const { rating, comment } = req.body;
    const b = await pool.query('SELECT id, user_id, worker_id FROM bookings WHERE id = $1 AND status = $2', [id, 'completed']);
    const booking = b.rows[0];
    if (!booking || booking.user_id !== req.user.id) {
        return res.status(404).json({ error: 'Booking not found or not completed' });
    }
    const existing = await pool.query('SELECT id FROM reviews WHERE booking_id = $1', [id]);
    if (existing.rows[0])
        return res.status(409).json({ error: 'Already reviewed' });
    await pool.query('INSERT INTO reviews (booking_id, user_id, worker_id, rating, comment) VALUES ($1, $2, $3, $4, $5)', [id, req.user.id, booking.worker_id, rating, comment || null]);
    return res.status(201).json({ ok: true });
});
export default router;
//# sourceMappingURL=bookings.js.map