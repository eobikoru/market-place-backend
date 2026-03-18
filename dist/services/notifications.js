import { pool } from '../db/pool.js';
export async function createNotification(userId, type, title, body, referenceId, referenceType) {
    await pool.query(`INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6)`, [userId, type, title, body ?? null, referenceId ?? null, referenceType ?? null]);
}
//# sourceMappingURL=notifications.js.map