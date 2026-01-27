-- ============================================================================
-- Sync Locks and Edge Case Handling
-- Adds: distributed locks, error type tracking, health recovery
-- ============================================================================

-- ============================================================================
-- 1. Sync Locks Table (prevents concurrent syncs)
-- ============================================================================

create table if not exists public.sync_locks (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  locked_at timestamptz not null default now(),
  expires_at timestamptz not null,

  -- Only one lock per user at a time
  unique (user_id)
);

create index if not exists idx_sync_locks_user on public.sync_locks(user_id);
create index if not exists idx_sync_locks_expires on public.sync_locks(expires_at);

comment on table public.sync_locks is 'Distributed locks to prevent concurrent sync operations per user';

-- RLS for sync_locks (service role only)
alter table public.sync_locks enable row level security;

create policy "Service role can manage sync locks"
  on public.sync_locks for all
  using (true)
  with check (true);

-- ============================================================================
-- 2. Add error_type to channel health for smarter recovery
-- ============================================================================

alter table public.channels
  add column if not exists last_error_type text
    check (last_error_type in ('transient', 'quota', 'auth', 'not_found', 'permanent', 'unknown'));

comment on column public.channels.last_error_type is 'Type of last error for smart retry decisions';

-- ============================================================================
-- 3. Add last_playlist_refresh to track when uploads_playlist_id was verified
-- ============================================================================

alter table public.channels
  add column if not exists last_playlist_refresh timestamptz;

comment on column public.channels.last_playlist_refresh is 'Last time uploads_playlist_id was verified/refreshed';

-- ============================================================================
-- 4. Function to automatically recover dead channels with exponential backoff
-- ============================================================================

create or replace function should_retry_dead_channel(
  p_last_failure_at timestamptz,
  p_consecutive_failures integer
)
returns boolean
language plpgsql
as $$
declare
  v_backoff_hours integer;
  v_next_retry timestamptz;
begin
  -- Exponential backoff: 24h, 48h, 96h, 192h (max 8 days)
  v_backoff_hours := least(24 * power(2, p_consecutive_failures - 10), 192);
  v_next_retry := p_last_failure_at + (v_backoff_hours || ' hours')::interval;

  return now() > v_next_retry;
end;
$$;

-- ============================================================================
-- 5. Function to get dead channels that should be retried
-- ============================================================================

create or replace function get_dead_channels_for_retry(p_limit integer default 50)
returns table (
  id uuid,
  youtube_id text,
  uploads_playlist_id text,
  consecutive_failures integer,
  last_failure_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select
    c.id,
    c.youtube_id,
    c.uploads_playlist_id,
    c.consecutive_failures,
    c.last_failure_at
  from public.channels c
  where c.health_status = 'dead'
    and c.last_failure_at is not null
    and should_retry_dead_channel(c.last_failure_at, c.consecutive_failures)
  order by c.last_failure_at asc
  limit p_limit;
end;
$$;

-- ============================================================================
-- 6. Function to refresh stale uploads_playlist_ids
-- ============================================================================

create or replace function get_channels_needing_playlist_refresh(
  p_stale_days integer default 30,
  p_limit integer default 100
)
returns table (
  id uuid,
  youtube_id text,
  uploads_playlist_id text,
  last_playlist_refresh timestamptz,
  user_id uuid
)
language plpgsql
security definer
as $$
declare
  v_cutoff timestamptz;
begin
  v_cutoff := now() - (p_stale_days || ' days')::interval;

  return query
  select distinct
    c.id,
    c.youtube_id,
    c.uploads_playlist_id,
    c.last_playlist_refresh,
    cg.user_id
  from public.channels c
  inner join public.group_channels gc on gc.channel_id = c.id
  inner join public.channel_groups cg on cg.id = gc.group_id
  where c.health_status != 'dead'
    and (c.last_playlist_refresh is null or c.last_playlist_refresh < v_cutoff)
  order by c.last_playlist_refresh asc nulls first
  limit p_limit;
end;
$$;

-- ============================================================================
-- 7. Cleanup expired sync locks (run periodically)
-- ============================================================================

create or replace function cleanup_expired_sync_locks()
returns integer
language plpgsql
security definer
as $$
declare
  v_deleted integer;
begin
  delete from public.sync_locks
  where expires_at < now();

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ============================================================================
-- 8. Smart health status update based on error type
-- ============================================================================

create or replace function update_channel_health(
  p_channel_id uuid,
  p_success boolean,
  p_error_type text default null,
  p_error_message text default null
)
returns void
language plpgsql
security definer
as $$
declare
  v_current_failures integer;
  v_new_status text;
begin
  if p_success then
    -- Reset on success
    update public.channels
    set health_status = 'healthy',
        consecutive_failures = 0,
        last_success_at = now(),
        last_error_type = null,
        last_failure_reason = null
    where id = p_channel_id;
  else
    -- Get current failure count
    select consecutive_failures into v_current_failures
    from public.channels where id = p_channel_id;

    v_current_failures := coalesce(v_current_failures, 0) + 1;

    -- Determine new status based on error type and count
    if p_error_type = 'not_found' or p_error_type = 'permanent' then
      -- Permanent errors go straight to dead
      v_new_status := 'dead';
    elsif v_current_failures >= 10 then
      v_new_status := 'dead';
    elsif v_current_failures >= 5 then
      v_new_status := 'unhealthy';
    elsif v_current_failures >= 2 then
      v_new_status := 'warning';
    else
      v_new_status := 'healthy';
    end if;

    update public.channels
    set health_status = v_new_status,
        consecutive_failures = v_current_failures,
        last_failure_at = now(),
        last_error_type = p_error_type,
        last_failure_reason = p_error_message
    where id = p_channel_id;
  end if;
end;
$$;
