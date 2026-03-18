import { pool } from '../db/pool.js';

export type NotificationType =
  | 'booking_created'
  | 'booking_accepted'
  | 'booking_cancelled'
  | 'booking_completed'
  | 'payout';

export async function createNotification(
  userId: string,
  type: NotificationType,
  title: string,
  body: string | null,
  referenceId?: string,
  referenceType?: string
): Promise<void> {
  await pool.query(
    `INSERT INTO notifications (user_id, type, title, body, reference_id, reference_type)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [userId, type, title, body ?? null, referenceId ?? null, referenceType ?? null]
  );
}
