-- ============================================================================
-- Sync System Improvements
-- Adds: sync progress tracking, channel health monitoring, enhanced quota tracking
-- ============================================================================

-- ============================================================================
-- 1. Channel Health Tracking Columns
-- ============================================================================

-- Add health tracking columns to channels table
alter table public.channels
  add column if not exists health_status text default 'healthy'
    check (health_status in ('healthy', 'warning', 'unhealthy', 'dead')),
  add column if not exists consecutive_failures integer default 0,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_failure_reason text;

-- Index for health-based queries
create index if not exists idx_channels_health_status on public.channels(health_status);
create index if not exists idx_channels_health_activity on public.channels(health_status, activity_level, last_fetched_at);

comment on column public.channels.health_status is 'Channel fetch health: healthy, warning, unhealthy, or dead';
comment on column public.channels.consecutive_failures is 'Number of consecutive fetch failures';
comment on column public.channels.last_success_at is 'Last successful video fetch time';
comment on column public.channels.last_failure_at is 'Last failed fetch attempt time';
comment on column public.channels.last_failure_reason is 'Reason for last failure';

-- ============================================================================
-- 2. Sync Progress Tracking Table
-- ============================================================================

create table if not exists public.sync_progress (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  progress jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sync_progress_user on public.sync_progress(user_id);
create index if not exists idx_sync_progress_updated on public.sync_progress(user_id, updated_at desc);

-- Enable real-time for sync progress (skip if already added)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'sync_progress'
  ) then
    alter publication supabase_realtime add table sync_progress;
  end if;
end $$;

comment on table public.sync_progress is 'Real-time sync progress tracking for UI feedback';

-- RLS for sync_progress
alter table public.sync_progress enable row level security;

-- Users can read their own sync progress
create policy "Users can read own sync progress"
  on public.sync_progress for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- Service role can manage sync progress
create policy "Service role can manage sync progress"
  on public.sync_progress for all
  using (true)
  with check (true);

-- ============================================================================
-- 3. Enhanced Quota Tracking
-- ============================================================================

-- Add warning threshold column to api_quota
alter table public.api_quota
  add column if not exists warning_sent boolean default false,
  add column if not exists critical_sent boolean default false;

-- ============================================================================
-- 4. Sync History Table (for analytics and debugging)
-- ============================================================================

create table if not exists public.sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  sync_type text not null check (sync_type in ('manual', 'cron_high', 'cron_medium', 'cron_low', 'subscription_import')),
  started_at timestamptz not null,
  completed_at timestamptz,
  success boolean,
  channels_processed integer default 0,
  channels_failed integer default 0,
  videos_added integer default 0,
  quota_used integer default 0,
  error_message text,
  metadata jsonb default '{}'
);

create index if not exists idx_sync_history_user on public.sync_history(user_id);
create index if not exists idx_sync_history_user_type on public.sync_history(user_id, sync_type);
create index if not exists idx_sync_history_started on public.sync_history(started_at desc);

comment on table public.sync_history is 'Historical record of all sync operations';

-- RLS for sync_history
alter table public.sync_history enable row level security;

-- Users can read their own sync history
create policy "Users can read own sync history"
  on public.sync_history for select
  using (
    user_id is null or user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- Service role can manage sync history
create policy "Service role can manage sync history"
  on public.sync_history for all
  using (true)
  with check (true);

-- ============================================================================
-- 5. Helper Functions
-- ============================================================================

-- Function to get channels needing refresh by activity level
create or replace function get_channels_for_refresh(
  p_activity_level text,
  p_stale_hours integer,
  p_limit integer default 100
)
returns table (
  id uuid,
  youtube_id text,
  uploads_playlist_id text,
  last_fetched_at timestamptz,
  user_id uuid
)
language plpgsql
security definer
as $$
declare
  v_cutoff timestamptz;
begin
  v_cutoff := now() - (p_stale_hours || ' hours')::interval;

  return query
  select distinct
    c.id,
    c.youtube_id,
    c.uploads_playlist_id,
    c.last_fetched_at,
    cg.user_id
  from public.channels c
  inner join public.group_channels gc on gc.channel_id = c.id
  inner join public.channel_groups cg on cg.id = gc.group_id
  where c.activity_level = p_activity_level
    and c.health_status != 'dead'
    and c.uploads_playlist_id is not null
    and (c.last_fetched_at is null or c.last_fetched_at < v_cutoff)
  order by c.last_fetched_at asc nulls first
  limit p_limit;
end;
$$;

-- Function to record sync completion
create or replace function record_sync_completion(
  p_user_id uuid,
  p_sync_type text,
  p_started_at timestamptz,
  p_success boolean,
  p_channels_processed integer,
  p_channels_failed integer,
  p_videos_added integer,
  p_quota_used integer,
  p_error_message text default null
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_sync_id uuid;
begin
  insert into public.sync_history (
    user_id,
    sync_type,
    started_at,
    completed_at,
    success,
    channels_processed,
    channels_failed,
    videos_added,
    quota_used,
    error_message
  ) values (
    p_user_id,
    p_sync_type,
    p_started_at,
    now(),
    p_success,
    p_channels_processed,
    p_channels_failed,
    p_videos_added,
    p_quota_used,
    p_error_message
  )
  returning id into v_sync_id;

  return v_sync_id;
end;
$$;

-- Function to get user's recent sync stats
create or replace function get_sync_stats(p_user_id uuid, p_days integer default 7)
returns table (
  total_syncs bigint,
  successful_syncs bigint,
  failed_syncs bigint,
  total_videos_added bigint,
  total_quota_used bigint,
  avg_channels_per_sync numeric
)
language plpgsql
security definer
as $$
begin
  return query
  select
    count(*) as total_syncs,
    count(*) filter (where success = true) as successful_syncs,
    count(*) filter (where success = false) as failed_syncs,
    coalesce(sum(videos_added), 0) as total_videos_added,
    coalesce(sum(quota_used), 0) as total_quota_used,
    coalesce(avg(channels_processed), 0) as avg_channels_per_sync
  from public.sync_history
  where user_id = p_user_id
    and started_at > now() - (p_days || ' days')::interval;
end;
$$;

-- Function to cleanup old sync progress records
create or replace function cleanup_old_sync_progress(p_user_id uuid, p_keep_count integer default 10)
returns integer
language plpgsql
security definer
as $$
declare
  v_deleted integer;
begin
  with recent_syncs as (
    select id
    from public.sync_progress
    where user_id = p_user_id
    order by updated_at desc
    limit p_keep_count
  )
  delete from public.sync_progress
  where user_id = p_user_id
    and id not in (select id from recent_syncs);

  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ============================================================================
-- 6. Update existing channels to have health_status
-- ============================================================================

-- Set all existing channels to healthy
update public.channels
set health_status = 'healthy',
    consecutive_failures = 0
where health_status is null;
