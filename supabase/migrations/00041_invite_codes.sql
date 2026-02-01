-- Migration: Invite Codes System
-- Manual invite codes for free tier access (replaces honor system)
-- Admin generates codes, users redeem them

-- Create invite codes table
CREATE TABLE IF NOT EXISTS public.invite_codes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) UNIQUE NOT NULL,
    label VARCHAR(100), -- e.g., "Sarah from Instagram"
    created_at TIMESTAMPTZ DEFAULT NOW(),
    expires_at TIMESTAMPTZ, -- Optional expiration date
    used_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
    used_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT TRUE
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_invite_codes_code ON public.invite_codes (code) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_invite_codes_used_by ON public.invite_codes (used_by) WHERE used_by IS NOT NULL;

-- Comments
COMMENT ON TABLE public.invite_codes IS 'Invite codes for free tier access';
COMMENT ON COLUMN public.invite_codes.code IS 'The unique invite code (e.g., BENTUBE-SARAH-FEB24)';
COMMENT ON COLUMN public.invite_codes.label IS 'Description of who this code is for';
COMMENT ON COLUMN public.invite_codes.expires_at IS 'When the code expires (null = never)';
COMMENT ON COLUMN public.invite_codes.used_by IS 'User who redeemed this code';
COMMENT ON COLUMN public.invite_codes.used_at IS 'When the code was redeemed';
COMMENT ON COLUMN public.invite_codes.is_active IS 'Whether the code can be used (admin can deactivate)';
