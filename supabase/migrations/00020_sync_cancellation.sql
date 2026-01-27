-- ============================================================================
-- Sync Cancellation Support
-- Allows users to cancel an in-progress sync operation
-- ============================================================================

-- Add cancelled flag to sync_locks table
alter table public.sync_locks
  add column if not exists cancelled boolean default false;

-- Add comment explaining the column
comment on column public.sync_locks.cancelled is
  'When true, the sync loop should stop at next checkpoint and release the lock';
