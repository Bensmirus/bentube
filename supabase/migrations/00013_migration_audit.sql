-- ============================================================================
-- Migration Audit: Verify all required database objects exist
-- Run this to check if your database schema is complete
-- ============================================================================

-- Create a temporary function to check and report missing objects
do $$
declare
  v_errors text[] := '{}';
  v_warnings text[] := '{}';
begin
  raise notice '=== BenTube Database Audit ===';
  raise notice '';

  -- ========== CHECK TABLES ==========
  raise notice 'Checking tables...';

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users') then
    v_errors := array_append(v_errors, 'Missing table: users');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'channels') then
    v_errors := array_append(v_errors, 'Missing table: channels');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'channel_groups') then
    v_errors := array_append(v_errors, 'Missing table: channel_groups');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'group_channels') then
    v_errors := array_append(v_errors, 'Missing table: group_channels');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'videos') then
    v_errors := array_append(v_errors, 'Missing table: videos');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_video_status') then
    v_errors := array_append(v_errors, 'Missing table: user_video_status');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'api_quota') then
    v_errors := array_append(v_errors, 'Missing table: api_quota');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'user_subscriptions') then
    v_errors := array_append(v_errors, 'Missing table: user_subscriptions');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_progress') then
    v_errors := array_append(v_errors, 'Missing table: sync_progress');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_history') then
    v_errors := array_append(v_errors, 'Missing table: sync_history');
  end if;

  if not exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_locks') then
    v_errors := array_append(v_errors, 'Missing table: sync_locks');
  end if;

  -- ========== CHECK CRITICAL COLUMNS ==========
  raise notice 'Checking critical columns...';

  -- channels.health_status (from 00009)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'health_status'
  ) then
    v_errors := array_append(v_errors, 'Missing column: channels.health_status (run migration 00009)');
  end if;

  -- channels.consecutive_failures (from 00009)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'consecutive_failures'
  ) then
    v_errors := array_append(v_errors, 'Missing column: channels.consecutive_failures (run migration 00009)');
  end if;

  -- channels.last_error_type (from 00010)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'channels' and column_name = 'last_error_type'
  ) then
    v_warnings := array_append(v_warnings, 'Missing column: channels.last_error_type (run migration 00010)');
  end if;

  -- user_video_status.progress_seconds (from 00006)
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_video_status' and column_name = 'progress_seconds'
  ) then
    v_warnings := array_append(v_warnings, 'Missing column: user_video_status.progress_seconds (run migration 00006)');
  end if;

  -- ========== CHECK FUNCTIONS ==========
  raise notice 'Checking functions...';

  if not exists (select 1 from pg_proc where proname = 'get_groups_with_channels') then
    v_errors := array_append(v_errors, 'Missing function: get_groups_with_channels');
  end if;

  if not exists (select 1 from pg_proc where proname = 'get_user_feed') then
    v_errors := array_append(v_errors, 'Missing function: get_user_feed');
  end if;

  if not exists (select 1 from pg_proc where proname = 'record_sync_completion') then
    v_errors := array_append(v_errors, 'Missing function: record_sync_completion');
  end if;

  if not exists (select 1 from pg_proc where proname = 'cleanup_stale_sync_locks') then
    v_warnings := array_append(v_warnings, 'Missing function: cleanup_stale_sync_locks');
  end if;

  if not exists (select 1 from pg_proc where proname = 'update_channel_health') then
    v_warnings := array_append(v_warnings, 'Missing function: update_channel_health');
  end if;

  -- ========== REPORT RESULTS ==========
  raise notice '';
  raise notice '=== Audit Results ===';

  if array_length(v_errors, 1) is null and array_length(v_warnings, 1) is null then
    raise notice 'All checks passed! Database schema is complete.';
  else
    if array_length(v_errors, 1) > 0 then
      raise notice '';
      raise notice 'ERRORS (must fix):';
      for i in 1..array_length(v_errors, 1) loop
        raise notice '  - %', v_errors[i];
      end loop;
    end if;

    if array_length(v_warnings, 1) > 0 then
      raise notice '';
      raise notice 'WARNINGS (recommended):';
      for i in 1..array_length(v_warnings, 1) loop
        raise notice '  - %', v_warnings[i];
      end loop;
    end if;
  end if;

  raise notice '';
  raise notice '=== End Audit ===';
end $$;

-- Also create a permanent audit function you can call anytime
create or replace function audit_database_schema()
returns table (
  check_type text,
  object_name text,
  status text,
  migration text
)
language plpgsql
security definer
as $$
begin
  -- Tables
  return query select 'table'::text, 'users'::text,
    case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'users')
    then 'OK' else 'MISSING' end, '00001'::text;

  return query select 'table'::text, 'channels'::text,
    case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'channels')
    then 'OK' else 'MISSING' end, '00001'::text;

  return query select 'table'::text, 'sync_progress'::text,
    case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_progress')
    then 'OK' else 'MISSING' end, '00009'::text;

  return query select 'table'::text, 'sync_history'::text,
    case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_history')
    then 'OK' else 'MISSING' end, '00009'::text;

  return query select 'table'::text, 'sync_locks'::text,
    case when exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'sync_locks')
    then 'OK' else 'MISSING' end, '00010/00011'::text;

  -- Critical columns
  return query select 'column'::text, 'channels.health_status'::text,
    case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'channels' and column_name = 'health_status')
    then 'OK' else 'MISSING' end, '00009'::text;

  return query select 'column'::text, 'channels.consecutive_failures'::text,
    case when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'channels' and column_name = 'consecutive_failures')
    then 'OK' else 'MISSING' end, '00009'::text;

  -- Functions
  return query select 'function'::text, 'get_groups_with_channels'::text,
    case when exists (select 1 from pg_proc where proname = 'get_groups_with_channels')
    then 'OK' else 'MISSING' end, '00003/00011'::text;

  return query select 'function'::text, 'record_sync_completion'::text,
    case when exists (select 1 from pg_proc where proname = 'record_sync_completion')
    then 'OK' else 'MISSING' end, '00009'::text;
end;
$$;

comment on function audit_database_schema() is 'Run SELECT * FROM audit_database_schema() to check schema completeness';
