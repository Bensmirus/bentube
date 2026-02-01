-- Add Lemon Squeezy subscription tracking to users table
-- This enables monthly subscriptions via Lemon Squeezy

ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS subscription_status TEXT DEFAULT 'none' CHECK (subscription_status IN ('none', 'active', 'cancelled', 'expired', 'past_due')),
ADD COLUMN IF NOT EXISTS subscription_plan TEXT,
ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS lemon_squeezy_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS lemon_squeezy_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS subscription_updated_at TIMESTAMPTZ;

-- Index for quick subscription status lookups
CREATE INDEX IF NOT EXISTS idx_users_subscription_status ON public.users(subscription_status);
CREATE INDEX IF NOT EXISTS idx_users_lemon_squeezy_customer_id ON public.users(lemon_squeezy_customer_id);

COMMENT ON COLUMN public.users.subscription_status IS 'Subscription state: none, active, cancelled (still has access until expires), expired, past_due';
COMMENT ON COLUMN public.users.subscription_plan IS 'Plan name from Lemon Squeezy (e.g., monthly)';
COMMENT ON COLUMN public.users.subscription_expires_at IS 'When the current billing period ends';
COMMENT ON COLUMN public.users.lemon_squeezy_customer_id IS 'Customer ID from Lemon Squeezy';
COMMENT ON COLUMN public.users.lemon_squeezy_subscription_id IS 'Subscription ID from Lemon Squeezy';
