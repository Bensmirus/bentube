-- ============================================================================
-- User Subscriptions Table
-- Tracks which channels each user is subscribed to (separate from group assignments)
-- ============================================================================

-- Create the user_subscriptions table (if not exists)
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  channel_id uuid not null references public.channels(id) on delete cascade,
  subscribed_at timestamptz default now(),

  unique (user_id, channel_id)
);

-- Create indexes for efficient queries (if not exists)
create index if not exists idx_user_subscriptions_user on public.user_subscriptions(user_id);
create index if not exists idx_user_subscriptions_channel on public.user_subscriptions(channel_id);
create index if not exists idx_user_subscriptions_user_channel on public.user_subscriptions(user_id, channel_id);

comment on table public.user_subscriptions is 'Tracks which YouTube channels each user is subscribed to';

-- ============================================================================
-- Row Level Security Policies
-- ============================================================================
alter table public.user_subscriptions enable row level security;

-- Drop existing policies if they exist, then recreate
drop policy if exists "Users can view own subscriptions" on public.user_subscriptions;
drop policy if exists "Users can insert own subscriptions" on public.user_subscriptions;
drop policy if exists "Users can delete own subscriptions" on public.user_subscriptions;

-- Users can view their own subscriptions
create policy "Users can view own subscriptions"
  on public.user_subscriptions for select
  using (user_id = get_user_id());

-- Users can insert their own subscriptions
create policy "Users can insert own subscriptions"
  on public.user_subscriptions for insert
  with check (user_id = get_user_id());

-- Users can delete their own subscriptions
create policy "Users can delete own subscriptions"
  on public.user_subscriptions for delete
  using (user_id = get_user_id());

-- ============================================================================
-- Fix get_groups_with_channels function to correctly count channels
-- The previous version could show incorrect counts for empty groups
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
