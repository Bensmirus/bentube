-- ============================================================================
-- Repair script: Complete any missing parts from migration 00009
-- Safe to run - uses "if not exists" and "create or replace"
-- ============================================================================

-- 1. Ensure channel health columns exist
alter table public.channels
  add column if not exists health_status text default 'healthy',
  add column if not exists consecutive_failures integer default 0,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_failure_at timestamptz,
  add column if not exists last_failure_reason text;

-- Add check constraint if missing (ignore error if exists)
do $$
begin
  alter table public.channels add constraint channels_health_status_check
    check (health_status in ('healthy', 'warning', 'unhealthy', 'dead'));
exception when duplicate_object then
  null;
end $$;

-- 2. Ensure indexes exist
create index if not exists idx_channels_health_status on public.channels(health_status);
create index if not exists idx_channels_health_activity on public.channels(health_status, activity_level, last_fetched_at);

-- 3. Ensure sync_progress table exists
create table if not exists public.sync_progress (
  id uuid primary key,
  user_id uuid not null references public.users(id) on delete cascade,
  progress jsonb not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_sync_progress_user on public.sync_progress(user_id);
create index if not exists idx_sync_progress_updated on public.sync_progress(user_id, updated_at desc);

-- 4. Ensure sync_history table exists
create table if not exists public.sync_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  sync_type text not null,
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

-- 5. Ensure api_quota columns exist
alter table public.api_quota
  add column if not exists warning_sent boolean default false,
  add column if not exists critical_sent boolean default false;

-- 6. Create or replace functions (always safe)
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

-- 7. Set existing channels to healthy if not set
update public.channels
set health_status = 'healthy',
    consecutive_failures = 0
where health_status is null;
