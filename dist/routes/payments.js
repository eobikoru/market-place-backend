import { Router } from 'express';
import { body, validationResult } from 'express-validator';
import { pool } from '../db/pool.js';
import { authMiddleware } from '../middleware/auth.js';
const router = Router();
router.use(authMiddleware);
router.post('/pay', [
    body('booking_id').isUUID(),
    body('reference').optional().trim(), // Paystack/Flutterwave reference after callback
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const { booking_id, reference } = req.body;
    const booking = await pool.query('SELECT id, user_id, price, payment_status FROM bookings WHERE id = $1', [booking_id]);
    const b = booking.rows[0];
    if (!b)
        return res.status(404).json({ error: 'Booking not found' });
    if (b.user_id !== req.user.id)
        return res.status(403).json({ error: 'Forbidden' });
    if (b.payment_status === 'paid')
        return res.status(400).json({ error: 'Already paid' });
    if (reference) {
        await pool.query('UPDATE bookings SET payment_status = $1, updated_at = NOW() WHERE id = $2', ['paid', booking_id]);
        return res.json({ ok: true, payment_status: 'paid' });
    }
    return res.json({
        ok: true,
        message: 'In production, initialize Paystack/Flutterwave and return payment URL',
        booking_id,
        amount: b.price,
        payment_url: process.env.PAYSTACK_PUBLIC_KEY ? '/pay/initialize' : null,
    });
});
router.post('/withdraw', [body('amount').isFloat({ min: 1 })], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
        return res.status(400).json({ errors: errors.array() });
    const amount = parseFloat(req.body.amount);
    const r = await pool.query('SELECT id, balance FROM wallets WHERE user_id = $1', [req.user.id]);
    const wallet = r.rows[0];
    if (!wallet)
        return res.status(400).json({ error: 'No wallet' });
    if (parseFloat(wallet.balance) < amount) {
        return res.status(400).json({ error: 'Insufficient balance' });
    }
    await pool.query('UPDATE wallets SET balance = balance - $1, updated_at = NOW() WHERE id = $2', [amount, wallet.id]);
    await pool.query('INSERT INTO wallet_transactions (wallet_id, amount, type, metadata) VALUES ($1, $2, $3, $4)', [wallet.id, -amount, 'withdrawal', JSON.stringify({ requested_at: new Date().toISOString() })]);
    return res.json({
        ok: true,
        message: 'Withdrawal requested. In production, integrate with bank/Paystack transfer.',
        new_balance: parseFloat(wallet.balance) - amount,
    });
});
router.get('/wallet', async (req, res) => {
    const r = await pool.query('SELECT balance FROM wallets WHERE user_id = $1', [req.user.id]);
    const wallet = r.rows[0];
    const balance = wallet ? parseFloat(wallet.balance) : 0;
    return res.json({ balance });
});
export default router;
//# sourceMappingURL=payments.js.map