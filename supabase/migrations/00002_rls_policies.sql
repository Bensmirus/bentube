-- ============================================================================
-- Row Level Security (RLS) Policies
-- ============================================================================

-- ============================================================================
-- USERS TABLE RLS
-- ============================================================================
alter table public.users enable row level security;

create policy "Users can view own data"
  on public.users for select
  using (auth.uid() = auth_user_id);

create policy "Users can update own data"
  on public.users for update
  using (auth.uid() = auth_user_id);

-- Insert handled by service role during auth callback

-- ============================================================================
-- CHANNELS TABLE RLS
-- ============================================================================
alter table public.channels enable row level security;

create policy "Authenticated users can view channels"
  on public.channels for select
  to authenticated
  using (true);

-- Insert/update handled by service role during sync

-- ============================================================================
-- CHANNEL_GROUPS TABLE RLS
-- ============================================================================
alter table public.channel_groups enable row level security;

create policy "Users can view own groups"
  on public.channel_groups for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can create own groups"
  on public.channel_groups for insert
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can update own groups"
  on public.channel_groups for update
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own groups"
  on public.channel_groups for delete
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- GROUP_CHANNELS TABLE RLS
-- ============================================================================
alter table public.group_channels enable row level security;

create policy "Users can view own group channels"
  on public.group_channels for select
  using (
    group_id in (
      select cg.id from public.channel_groups cg
      join public.users u on u.id = cg.user_id
      where u.auth_user_id = auth.uid()
    )
  );

create policy "Users can manage own group channels"
  on public.group_channels for insert
  with check (
    group_id in (
      select cg.id from public.channel_groups cg
      join public.users u on u.id = cg.user_id
      where u.auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own group channels"
  on public.group_channels for delete
  using (
    group_id in (
      select cg.id from public.channel_groups cg
      join public.users u on u.id = cg.user_id
      where u.auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- VIDEOS TABLE RLS
-- ============================================================================
alter table public.videos enable row level security;

create policy "Authenticated users can view videos"
  on public.videos for select
  to authenticated
  using (true);

-- Insert/update handled by service role during sync

-- ============================================================================
-- WATCH_STATUS TABLE RLS
-- ============================================================================
alter table public.watch_status enable row level security;

create policy "Users can view own watch status"
  on public.watch_status for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can create own watch status"
  on public.watch_status for insert
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can update own watch status"
  on public.watch_status for update
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own watch status"
  on public.watch_status for delete
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- TAGS TABLE RLS
-- ============================================================================
alter table public.tags enable row level security;

create policy "Users can view own tags"
  on public.tags for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can create own tags"
  on public.tags for insert
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can update own tags"
  on public.tags for update
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own tags"
  on public.tags for delete
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- VIDEO_TAGS TABLE RLS
-- ============================================================================
alter table public.video_tags enable row level security;

create policy "Users can view own video tags"
  on public.video_tags for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can create own video tags"
  on public.video_tags for insert
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own video tags"
  on public.video_tags for delete
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- VIDEO_NOTES TABLE RLS
-- ============================================================================
alter table public.video_notes enable row level security;

create policy "Users can view own notes"
  on public.video_notes for select
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can create own notes"
  on public.video_notes for insert
  with check (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can update own notes"
  on public.video_notes for update
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

create policy "Users can delete own notes"
  on public.video_notes for delete
  using (
    user_id in (
      select id from public.users where auth_user_id = auth.uid()
    )
  );

-- ============================================================================
-- ICONS TABLE RLS (publicly readable)
-- ============================================================================
alter table public.icons enable row level security;

create policy "Anyone can view icons"
  on public.icons for select
  using (true);
