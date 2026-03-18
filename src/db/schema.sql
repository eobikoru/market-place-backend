-- HelpMe Marketplace Schema
-- Run this once to create tables (or use migrate.ts)

-- Roles enum
CREATE TYPE user_role AS ENUM ('customer', 'worker', 'admin');
CREATE TYPE booking_status AS ENUM ('pending', 'accepted', 'in_progress', 'completed', 'cancelled');
CREATE TYPE payment_status AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- Users
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  phone VARCHAR(50),
  password_hash VARCHAR(255) NOT NULL,
  role user_role NOT NULL DEFAULT 'customer',
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_users_location ON users(latitude, longitude) WHERE latitude IS NOT NULL;

-- Service categories (admin-managed)
CREATE TABLE IF NOT EXISTS service_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(100) NOT NULL UNIQUE,
  slug VARCHAR(100) NOT NULL UNIQUE,
  description TEXT,
  icon_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Workers (extends users)
CREATE TABLE IF NOT EXISTS workers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  service_category_id UUID NOT NULL REFERENCES service_categories(id),
  bio TEXT,
  price_min DECIMAL(12, 2) NOT NULL DEFAULT 0,
  price_max DECIMAL(12, 2),
  rating DECIMAL(3, 2) DEFAULT 0,
  review_count INT DEFAULT 0,
  verified BOOLEAN DEFAULT FALSE,
  id_verified BOOLEAN DEFAULT FALSE,
  id_document_url TEXT,
  featured BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, service_category_id)
);

CREATE INDEX idx_workers_category ON workers(service_category_id);
CREATE INDEX idx_workers_verified ON workers(verified);
CREATE INDEX idx_workers_rating ON workers(rating DESC);

-- Wallets
CREATE TABLE IF NOT EXISTS wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  balance DECIMAL(14, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Bookings
CREATE TABLE IF NOT EXISTS bookings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  service_category_id UUID NOT NULL REFERENCES service_categories(id),
  status booking_status NOT NULL DEFAULT 'pending',
  price DECIMAL(12, 2) NOT NULL,
  commission DECIMAL(12, 2) NOT NULL DEFAULT 0,
  address TEXT NOT NULL,
  latitude DECIMAL(10, 8),
  longitude DECIMAL(11, 8),
  scheduled_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  payment_status payment_status NOT NULL DEFAULT 'pending',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_bookings_user ON bookings(user_id);
CREATE INDEX idx_bookings_worker ON bookings(worker_id);
CREATE INDEX idx_bookings_status ON bookings(status);
CREATE INDEX idx_bookings_scheduled ON bookings(scheduled_at);

-- Reviews
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id UUID NOT NULL UNIQUE REFERENCES bookings(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  worker_id UUID NOT NULL REFERENCES workers(id),
  rating INT NOT NULL CHECK (rating >= 1 AND rating <= 5),
  comment TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_reviews_worker ON reviews(worker_id);

-- Wallet transactions (for withdrawals and payouts)
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES wallets(id),
  amount DECIMAL(14, 2) NOT NULL,
  type VARCHAR(20) NOT NULL, -- 'credit', 'debit', 'withdrawal', 'payout', 'refund'
  reference_id UUID,
  reference_type VARCHAR(50),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_wallet_tx_wallet ON wallet_transactions(wallet_id);

-- Update worker rating when review is added
CREATE OR REPLACE FUNCTION update_worker_rating()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE workers
  SET rating = (SELECT AVG(rating)::DECIMAL(3,2) FROM reviews WHERE worker_id = NEW.worker_id),
      review_count = (SELECT COUNT(*) FROM reviews WHERE worker_id = NEW.worker_id)
  WHERE id = NEW.worker_id;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_reviews_rating ON reviews;
CREATE TRIGGER tr_reviews_rating
  AFTER INSERT ON reviews
  FOR EACH ROW EXECUTE PROCEDURE update_worker_rating();
