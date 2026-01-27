-- ============================================================================
-- Sync Alerts System
-- Tracks sync failures and system issues for user visibility
-- ============================================================================

-- ============================================================================
-- 1. Sync Alerts Table
-- ============================================================================

create table if not exists public.sync_alerts (
  id uuid primary key default gen_random_uuid(),

  -- Alert classification
  alert_type text not null check (alert_type in (
    'high_failure_rate',    -- Many channels failed in a sync (>20%)
    'channel_died',         -- A channel became "dead" status
    'quota_warning',        -- Approaching quota limit
    'quota_exhausted',      -- Quota fully exhausted
    'sync_error'            -- General sync error
  )),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),

  -- Alert content
  title text not null,
  message text not null,
  data jsonb default '{}',  -- Additional context (channel IDs, error details, etc.)

  -- Status
  acknowledged boolean default false,
  acknowledged_at timestamptz,

  -- Timestamps
  created_at timestamptz default now()
);

-- Indexes for efficient querying
create index if not exists idx_sync_alerts_unacknowledged
  on public.sync_alerts(created_at desc)
  where acknowledged = false;

create index if not exists idx_sync_alerts_type
  on public.sync_alerts(alert_type, created_at desc);

create index if not exists idx_sync_alerts_severity
  on public.sync_alerts(severity, created_at desc);

comment on table public.sync_alerts is 'System alerts for sync failures and issues';

-- ============================================================================
-- 2. RLS Policies
-- ============================================================================

alter table public.sync_alerts enable row level security;

-- Service role can manage all alerts
create policy "Service role can manage alerts"
  on public.sync_alerts for all
  using (true)
  with check (true);

-- Authenticated users can view alerts (single-user app)
create policy "Authenticated users can view alerts"
  on public.sync_alerts for select
  to authenticated
  using (true);

-- ============================================================================
-- 3. Helper Functions
-- ============================================================================

-- Create a new alert
create or replace function create_sync_alert(
  p_alert_type text,
  p_severity text,
  p_title text,
  p_message text,
  p_data jsonb default '{}'
)
returns uuid
language plpgsql
security definer
as $$
declare
  v_alert_id uuid;
begin
  insert into public.sync_alerts (alert_type, severity, title, message, data)
  values (p_alert_type, p_severity, p_title, p_message, p_data)
  returning id into v_alert_id;

  return v_alert_id;
end;
$$;

-- Get unacknowledged alerts
create or replace function get_unacknowledged_alerts(p_limit integer default 50)
returns table (
  id uuid,
  alert_type text,
  severity text,
  title text,
  message text,
  data jsonb,
  created_at timestamptz
)
language plpgsql
security definer
as $$
begin
  return query
  select
    a.id,
    a.alert_type,
    a.severity,
    a.title,
    a.message,
    a.data,
    a.created_at
  from public.sync_alerts a
  where a.acknowledged = false
  order by
    case a.severity
      when 'critical' then 1
      when 'error' then 2
      when 'warning' then 3
      when 'info' then 4
    end,
    a.created_at desc
  limit p_limit;
end;
$$;

-- Acknowledge alerts (single or batch)
create or replace function acknowledge_alerts(p_alert_ids uuid[])
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.sync_alerts
  set acknowledged = true, acknowledged_at = now()
  where id = any(p_alert_ids)
    and acknowledged = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Acknowledge all alerts
create or replace function acknowledge_all_alerts()
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  update public.sync_alerts
  set acknowledged = true, acknowledged_at = now()
  where acknowledged = false;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- Clean up old acknowledged alerts (keep last 30 days)
create or replace function cleanup_old_alerts(p_days integer default 30)
returns integer
language plpgsql
security definer
as $$
declare
  v_count integer;
begin
  delete from public.sync_alerts
  where acknowledged = true
    and created_at < now() - (p_days || ' days')::interval;

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ============================================================================
-- 4. Get alert counts by severity (for dashboard)
-- ============================================================================

create or replace function get_alert_counts()
returns table (
  total_unacknowledged integer,
  critical_count integer,
  error_count integer,
  warning_count integer,
  info_count integer
)
language plpgsql
security definer
as $$
begin
  return query
  select
    count(*)::integer as total_unacknowledged,
    count(*) filter (where severity = 'critical')::integer as critical_count,
    count(*) filter (where severity = 'error')::integer as error_count,
    count(*) filter (where severity = 'warning')::integer as warning_count,
    count(*) filter (where severity = 'info')::integer as info_count
  from public.sync_alerts
  where acknowledged = false;
end;
$$;
