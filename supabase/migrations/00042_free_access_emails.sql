-- Free access emails table
-- Stores email addresses that get free access to Ben.Tube (managed by admin)
CREATE TABLE IF NOT EXISTS public.free_access_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  label TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast email lookups (used in middleware on every request)
CREATE INDEX IF NOT EXISTS idx_free_access_emails_email ON public.free_access_emails (email);
