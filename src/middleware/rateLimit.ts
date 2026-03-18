import rateLimit from 'express-rate-limit';
import { config } from '../config/index.js';

const windowMs = 15 * 60 * 1000; // 15 minutes
const maxAuth = config.env === 'production' ? 10 : 100;
const maxBook = config.env === 'production' ? 20 : 100;

export const authLimiter = rateLimit({
  windowMs,
  max: maxAuth,
  message: { error: 'Too many attempts. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

export const bookLimiter = rateLimit({
  windowMs,
  max: maxBook,
  message: { error: 'Too many booking requests. Try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
