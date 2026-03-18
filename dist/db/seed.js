import bcrypt from 'bcryptjs';
import { pool } from './pool.js';
async function seed() {
    const hash = await bcrypt.hash('admin123', 12);
    await pool.query(`INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4)
     ON CONFLICT (email) DO NOTHING`, ['Admin', 'admin@helpme.local', hash, 'admin']);
    const categories = [
        { name: 'Plumbing', slug: 'plumbing' },
        { name: 'Electrical', slug: 'electrical' },
        { name: 'Cleaning', slug: 'cleaning' },
        { name: 'Tutoring', slug: 'tutoring' },
        { name: 'Tailoring', slug: 'tailoring' },
        { name: 'Mechanics', slug: 'mechanics' },
        { name: 'Painting', slug: 'painting' },
    ];
    for (const c of categories) {
        await pool.query(`INSERT INTO service_categories (name, slug) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING`, [c.name, c.slug]);
    }
    console.log('Seed done.');
    await pool.end();
}
seed().catch((e) => {
    console.error(e);
    process.exit(1);
});
//# sourceMappingURL=seed.js.map