import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pool } from './pool.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

async function migrate() {
  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf-8');
  await pool.query(sql);
  console.log('Schema applied.');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS notifications (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(50) NOT NULL,
      title VARCHAR(255) NOT NULL,
      body TEXT,
      reference_id UUID,
      reference_type VARCHAR(50),
      read_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id)');
  await pool.query('CREATE INDEX IF NOT EXISTS idx_notifications_created ON notifications(created_at DESC)');
  console.log('Notifications table applied.');

  try {
    await pool.query(`ALTER TABLE users ADD COLUMN terms_accepted_at TIMESTAMPTZ`);
    console.log('Users.terms_accepted_at applied.');
  } catch (e: unknown) {
    const err = e as { code?: string };
    if (err.code !== '42701') throw e; // 42701 = column already exists
  }

  await pool.end();
}

migrate().catch((e) => {
  console.error(e);
  process.exit(1);
});
