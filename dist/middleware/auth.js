import jwt from 'jsonwebtoken';
import { config } from '../config/index.js';
import { pool } from '../db/pool.js';
export function authMiddleware(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        req.user = { id: decoded.userId, email: decoded.email, role: decoded.role };
        next();
    }
    catch {
        return res.status(401).json({ error: 'Invalid or expired token' });
    }
}
export function requireRole(...roles) {
    return (req, res, next) => {
        if (!req.user)
            return res.status(401).json({ error: 'Unauthorized' });
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        next();
    };
}
export async function optionalAuth(req, res, next) {
    const header = req.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : null;
    if (!token) {
        return next();
    }
    try {
        const decoded = jwt.verify(token, config.jwt.secret);
        const r = await pool.query('SELECT id, email, role FROM users WHERE id = $1', [decoded.userId]);
        if (r.rows[0])
            req.user = { id: r.rows[0].id, email: r.rows[0].email, role: r.rows[0].role };
    }
    catch {
        // ignore
    }
    next();
}
//# sourceMappingURL=auth.js.map