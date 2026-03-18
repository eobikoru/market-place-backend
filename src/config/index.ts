import 'dotenv/config';

const required = (key: string): string => {
  const v = process.env[key];
  if (!v && process.env.NODE_ENV === 'production') throw new Error(`Missing env: ${key}`);
  return v || '';
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  apiPrefix: process.env.API_PREFIX || '/api/v1',
  database: {
    url: process.env.DATABASE_URL || 'postgresql://localhost:5432/helpme',
  },
  jwt: {
    secret: required('JWT_SECRET') || 'dev-secret-change-in-production',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
  },
  cors: {
    origins: (process.env.CORS_ORIGINS || 'http://localhost:3000').split(',').map((o) => o.trim()),
  },
  paystack: {
    secretKey: process.env.PAYSTACK_SECRET_KEY || '',
    publicKey: process.env.PAYSTACK_PUBLIC_KEY || '',
  },
  mapbox: {
    token: process.env.MAPBOX_ACCESS_TOKEN || '',
  },
} as const;
