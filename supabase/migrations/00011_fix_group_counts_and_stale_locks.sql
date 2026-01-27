-- ============================================================================
-- Migration 00011: Fix group channel counts, create sync_locks, and clean up
-- ============================================================================

-- ============================================================================
-- 1. Fix get_groups_with_channels to correctly count channels for empty groups
-- The issue: count(gc.channel_id) on a LEFT JOIN can return 1 instead of 0
-- for empty groups because it counts the NULL row from the join.
-- Solution: Use filter (where gc.channel_id is not null) to only count actual channels
-- ============================================================================
create or replace function get_groups_with_channels(p_user_id uuid)
returns table (
  id uuid,
  name text,
  color text,
  icon text,
  sort_order integer,
  created_at timestamptz,
  channel_ids uuid[],
  channel_count bigint
) as $$
begin
  return query
  select
    cg.id,
    cg.name,
    cg.color,
    cg.icon,
    cg.sort_order,
    cg.created_at,
    coalesce(array_agg(gc.channel_id) filter (where gc.channel_id is not null), '{}') as channel_ids,
    count(gc.channel_id) filter (where gc.channel_id is not null) as channel_count
  from public.channel_groups cg
  left join public.group_channels gc on cg.id = gc.group_id
  where cg.user_id = p_user_id
  group by cg.id
  order by cg.sort_order, cg.created_at;
end;
$$ language plpgsql security definer;

-- ============================================================================
-- 2. Create sync_locks table for distributed locking
-- This prevents concurrent syncs for the same user
-- ============================================================================
create table if not exists public.sync_locks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),

  -- Only one lock per user at a time
  constraint sync_locks_user_id_unique unique (user_id)
);

-- Index for efficient cleanup of expired locks
create index if not exists idx_sync_locks_expires_at on public.sync_locks(expires_at);

-- RLS: Users can only see/manage their own locks (though typically accessed via admin client)
alter table public.sync_locks enable row level security;

create policy "Users can view own sync locks"
  on public.sync_locks for select
  using (auth.uid() = user_id);

create policy "Users can delete own sync locks"
  on public.sync_locks for delete
  using (auth.uid() = user_id);

-- ============================================================================
-- 3. Clean up any stale sync locks that might be blocking users
-- ============================================================================
delete from public.sync_locks
where expires_at < now();

-- ============================================================================
-- 4. Add a function to clean up stale locks (can be called periodically)
-- ============================================================================
create or replace function cleanup_stale_sync_locks()
returns integer as $$
declare
  deleted_count integer;
begin
  delete from public.sync_locks
  where expires_at < now();

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$ language plpgsql security definer;

comment on function cleanup_stale_sync_locks() is 'Removes expired sync locks. Returns number of locks cleaned up.';
