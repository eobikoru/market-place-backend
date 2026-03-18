import { Request, Response, NextFunction } from 'express';
import { config } from '../config/index.js';

export function errorHandler(
  err: Error & { statusCode?: number },
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const status = err.statusCode || 500;
  const message = status === 500 && config.env === 'production' ? 'Internal server error' : err.message;
  if (status === 500) console.error(err);
  res.status(status).json({ error: message });
}
