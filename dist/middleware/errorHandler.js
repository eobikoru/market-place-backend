import { config } from '../config/index.js';
export function errorHandler(err, _req, res, _next) {
    const status = err.statusCode || 500;
    const message = status === 500 && config.env === 'production' ? 'Internal server error' : err.message;
    if (status === 500)
        console.error(err);
    res.status(status).json({ error: message });
}
//# sourceMappingURL=errorHandler.js.map