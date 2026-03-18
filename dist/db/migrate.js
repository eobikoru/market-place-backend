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
    await pool.end();
}
migrate().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=migrate.js.map