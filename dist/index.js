import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from './config/index.js';
import { errorHandler } from './middleware/errorHandler.js';
import authRoutes from './routes/auth.js';
import servicesRoutes from './routes/services.js';
import workersRoutes from './routes/workers.js';
import bookingsRoutes from './routes/bookings.js';
import paymentsRoutes from './routes/payments.js';
import adminRoutes from './routes/admin.js';
const app = express();
if (config.env === 'production') {
    // Ensure correct client IP / protocol when behind a proxy (Render/Nginx/Cloudflare/etc.)
    app.set('trust proxy', 1);
}
app.use(helmet());
app.use(cors({
    origin(origin, cb) {
        // Non-browser requests (cron, server-to-server, some mobile clients) may not send Origin.
        if (!origin)
            return cb(null, true);
        if (config.cors.origins.includes(origin))
            return cb(null, true);
        return cb(new Error(`CORS blocked origin: ${origin}`));
    },
    credentials: true,
}));
app.use(express.json());
app.get('/health', (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));
app.use(`${config.apiPrefix}/auth`, authRoutes);
app.use(`${config.apiPrefix}/services`, servicesRoutes);
app.use(`${config.apiPrefix}/workers`, workersRoutes);
app.use(`${config.apiPrefix}/bookings`, bookingsRoutes);
app.use(`${config.apiPrefix}/payments`, paymentsRoutes);
app.use(`${config.apiPrefix}/admin`, adminRoutes);
app.use(errorHandler);
const server = app.listen(config.port, () => {
    console.log(`HelpMe API listening on port ${config.port} (${config.env})`);
});
function shutdown() {
    server.close(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
//# sourceMappingURL=index.js.map