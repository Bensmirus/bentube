-- Migration: Free Tier System
-- Adds support for limited free tier users (10 max)
-- Free users must follow Instagram to claim a spot

-- Add free tier tracking columns to users table
ALTER TABLE public.users
ADD COLUMN IF NOT EXISTS is_free_tier BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS free_tier_claimed_at TIMESTAMPTZ;

-- Create index for efficient free tier counting
CREATE INDEX IF NOT EXISTS idx_users_free_tier ON public.users (is_free_tier) WHERE is_free_tier = TRUE;

-- Comment on columns
COMMENT ON COLUMN public.users.is_free_tier IS 'Whether user is on the free tier (limited spots available)';
COMMENT ON COLUMN public.users.free_tier_claimed_at IS 'When the user claimed their free tier spot';
