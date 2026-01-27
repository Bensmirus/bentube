# Migration 00037: Remove Descriptions - Instructions

## What This Does

Removes the `description` field from:
- `videos` table
- `user_playlists` table
- `sync_staging_videos` table

**Expected storage savings:** 50-70% reduction in video table size (10-25% of total database)

---

## Step 1: Apply Database Migration

1. Open your Supabase Dashboard
2. Go to **SQL Editor**
3. Open the file: `supabase/migrations/00037_remove_descriptions.sql`
4. Copy the entire SQL content
5. Paste into Supabase SQL Editor
6. Click **Run**

**Expected result:** "Success. No rows returned"

This migration:
- Drops description columns
- Updates functions to not use descriptions
- Updates get_feed function to not return descriptions

---

## Step 2: Deploy Code Changes

The following files have been updated to remove description references:

**TypeScript files changed:**
- `src/lib/youtube/types.ts` - Removed from YouTubeVideo type
- `src/lib/youtube/sync-staging.ts` - Removed from function parameters
- `src/lib/youtube/videos.ts` - No longer fetches descriptions from YouTube
- `src/lib/youtube/playlists.ts` - No longer fetches descriptions from YouTube
- `src/lib/youtube/cron-handler.ts` - Removed from video inserts
- `src/app/(dashboard)/watch/[videoId]/page.tsx` - Removed description display

**To deploy:**
```bash
# 1. Commit changes
git add .
git commit -m "Remove descriptions to optimize database storage"

# 2. Push to production
git push origin main
```

Vercel will automatically deploy the changes.

---

## Step 3: Verify Everything Works

After deployment:

1. **Test video playback:**
   - Go to your feed
   - Click a video to watch
   - Verify the watch page loads correctly (no description box shown)

2. **Test sync:**
   - Go to Settings → Sync now
   - Wait for sync to complete
   - Verify new videos are imported correctly

3. **Check database size:**
   - Go to Supabase Dashboard → Database
   - Check "Disk Usage"
   - You should see a reduction in database size after a few minutes

---

## Expected Results

**Before:**
- 76MB for medium user (~15-20 channels)
- ~4-8KB per video

**After:**
- ~30-40MB for same user
- ~1.5-2.5KB per video
- **50-70% storage reduction**

---

## Rollback (If Needed)

If something goes wrong, you can rollback by:

1. **Re-add description column:**
```sql
ALTER TABLE public.videos ADD COLUMN description text;
ALTER TABLE public.user_playlists ADD COLUMN description text;
ALTER TABLE public.sync_staging_videos ADD COLUMN description text;
```

2. **Revert code changes:**
```bash
git revert HEAD
git push origin main
```

---

## Notes

- **Descriptions are NOT shown anywhere in your app** (verified)
- Users can still see full descriptions on YouTube (via "YouTube" button)
- This is a safe, one-way migration
- Future video imports will not fetch descriptions (saves API quota too!)

---

## Timeline

**Total time:** 5-10 minutes
- Step 1 (SQL): 1 minute
- Step 2 (Deploy): 2-3 minutes (Vercel build)
- Step 3 (Verify): 2-5 minutes

**Downtime:** None (migration is non-blocking)
