-- ============================================================================
-- API Quota Tracking
-- Tracks YouTube API usage per user per day for cross-device real-time display
-- ============================================================================

-- API Quota table - tracks daily usage per user
create table public.api_quota (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  date date not null default current_date,
  units_used integer not null default 0,
  daily_limit integer not null default 10000,
  last_updated_at timestamptz default now(),

  unique (user_id, date)
);

create index idx_api_quota_user_date on public.api_quota(user_id, date);

comment on table public.api_quota is 'Daily YouTube API quota tracking per user';

-- Enable real-time for this table
alter publication supabase_realtime add table api_quota;

-- RLS policies
alter table public.api_quota enable row level security;

-- Users can read their own quota
create policy "Users can read own quota"
  on public.api_quota for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- Only service role can insert/update (from API routes)
create policy "Service role can manage quota"
  on public.api_quota for all
  using (true)
  with check (true);

-- Function to increment quota usage (atomic operation)
create or replace function increment_api_quota(
  p_user_id uuid,
  p_units integer
)
returns table(
  units_used integer,
  daily_limit integer,
  remaining integer
)
language plpgsql
security definer
as $$
declare
  v_date date := current_date;
  v_result record;
begin
  -- Upsert the quota record and increment units
  insert into public.api_quota (user_id, date, units_used, last_updated_at)
  values (p_user_id, v_date, p_units, now())
  on conflict (user_id, date)
  do update set
    units_used = api_quota.units_used + p_units,
    last_updated_at = now()
  returning
    api_quota.units_used,
    api_quota.daily_limit,
    api_quota.daily_limit - api_quota.units_used as remaining
  into v_result;

  return query select v_result.units_used, v_result.daily_limit, v_result.remaining;
end;
$$;

-- Function to get current quota status
create or replace function get_api_quota(p_user_id uuid)
returns table(
  units_used integer,
  daily_limit integer,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
as $$
declare
  v_date date := current_date;
  v_tomorrow timestamptz;
begin
  -- Calculate next reset time (midnight UTC)
  v_tomorrow := date_trunc('day', now() at time zone 'UTC') + interval '1 day';

  return query
  select
    coalesce(q.units_used, 0) as units_used,
    coalesce(q.daily_limit, 10000) as daily_limit,
    coalesce(q.daily_limit - q.units_used, 10000) as remaining,
    v_tomorrow as reset_at
  from public.api_quota q
  where q.user_id = p_user_id and q.date = v_date
  union all
  select 0, 10000, 10000, v_tomorrow
  where not exists (
    select 1 from public.api_quota
    where user_id = p_user_id and date = v_date
  )
  limit 1;
end;
$$;
