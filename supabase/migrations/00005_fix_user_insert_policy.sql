-- ============================================================================
-- Fix: Allow authenticated users to create their own user record
-- ============================================================================

-- Users can insert their own record (during first login)
create policy "Users can insert own record"
  on public.users for insert
  to authenticated
  with check (auth.uid() = auth_user_id);
