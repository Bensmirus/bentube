import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { fetchAllSubscriptions, fetchChannelDetails } from '@/lib/youtube/subscriptions'
import { checkQuotaAvailable, estimateQuotaNeeded } from '@/lib/youtube/quota'
import { SyncProgressTracker, acquireSyncLock, releaseSyncLock } from '@/lib/youtube/sync-progress'
import { withRateLimitAndRetry, parseYouTubeError } from '@/lib/youtube/utils'
import { NextResponse } from 'next/server'

export async function POST() {
  const startTime = Date.now()
  let lockId: string | null = null
  let userId: string | null = null

  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    // Get user
    const { userId: uid, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !uid) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    userId = uid

    // Acquire distributed lock to prevent concurrent syncs
    lockId = await acquireSyncLock(userId)
    if (!lockId) {
      return NextResponse.json(
        { error: 'A sync is already in progress. Please wait for it to complete.' },
        { status: 409 }
      )
    }

    // Check quota before starting (estimate for ~200 subscriptions)
    const estimatedQuota = estimateQuotaNeeded({ subscriptionSync: true })
    const quotaCheck = await checkQuotaAvailable(userId, estimatedQuota)
    if (!quotaCheck.allowed) {
      return NextResponse.json(
        {
          error: quotaCheck.reason,
          quotaStatus: quotaCheck.status,
        },
        { status: 429 }
      )
    }

    // Get YouTube client
    const { client: youtube, error: ytError } = await getYouTubeClient(userId)
    if (!youtube || ytError) {
      return NextResponse.json({ error: ytError || 'YouTube not connected' }, { status: 400 })
    }

    // Initialize progress tracker
    const progress = new SyncProgressTracker(userId)
    await progress.start()
    await progress.setPhase('fetching_subscriptions', 'Fetching your YouTube subscriptions...')

    // Fetch subscriptions with retry logic
    console.log('[Sync] Starting subscription fetch for user:', userId)

    let subscriptions: Awaited<ReturnType<typeof fetchAllSubscriptions>>['subscriptions']
    let subApiCalls: number

    try {
      const result = await withRateLimitAndRetry(
        () => fetchAllSubscriptions(youtube, userId!),
        {
          maxRetries: 2,
          onRetry: (attempt, error, delay) => {
            console.log(`[Sync] Retrying subscription fetch (attempt ${attempt}), waiting ${delay}ms`)
          },
        }
      )

      if (result.error) {
        await progress.error(result.error)
        return NextResponse.json({ error: result.error }, { status: 500 })
      }

      subscriptions = result.subscriptions
      subApiCalls = result.apiCalls
    } catch (error) {
      const parsedError = parseYouTubeError(error)
      console.error('[Sync] Subscription fetch error:', parsedError.message)
      await progress.error(parsedError.message)
      return NextResponse.json({ error: parsedError.message }, { status: 500 })
    }

    console.log('[Sync] Found', subscriptions.length, 'subscriptions')
    await progress.addQuotaUsage(subApiCalls)

    if (subscriptions.length === 0) {
      await progress.complete('No subscriptions found on your YouTube account')
      return NextResponse.json({
        success: true,
        channelsImported: 0,
        message: 'No subscriptions found',
      })
    }

    // Update progress
    await progress.setTotal(subscriptions.length)
    await progress.setPhase(
      'fetching_channel_details',
      `Getting details for ${subscriptions.length} channels...`
    )

    // Fetch uploads playlist IDs with retry
    const channelIds = subscriptions.map((s) => s.channelId)

    let uploadsMap: Map<string, string>
    let detailsApiCalls: number

    try {
      const result = await withRateLimitAndRetry(
        () => fetchChannelDetails(youtube, channelIds, userId!),
        { maxRetries: 2 }
      )
      uploadsMap = result.uploadsMap
      detailsApiCalls = result.apiCalls
    } catch (error) {
      const parsedError = parseYouTubeError(error)
      console.error('[Sync] Channel details fetch error:', parsedError.message)
      // Continue anyway - channels without playlist IDs will be skipped during video sync
      uploadsMap = new Map()
      detailsApiCalls = 0
    }

    await progress.addQuotaUsage(detailsApiCalls)
    await progress.setPhase('completing', 'Saving channels to your library...')

    // Upsert channels (using admin to bypass RLS)
    const channelsToUpsert = subscriptions.map((sub) => ({
      youtube_id: sub.channelId,
      title: sub.title,
      thumbnail: sub.thumbnail,
      uploads_playlist_id: uploadsMap.get(sub.channelId) || null,
      activity_level: 'medium' as const,
      health_status: 'healthy' as const,
      consecutive_failures: 0,
    }))

    const { data: channels, error: channelError } = await admin
      .from('channels')
      .upsert(channelsToUpsert as never, { onConflict: 'youtube_id' })
      .select('id, youtube_id')

    if (channelError) {
      console.error('[Sync] Channel upsert error:', channelError)
      await progress.error('Failed to save channels to database')
      return NextResponse.json({ error: 'Failed to save channels' }, { status: 500 })
    }

    const channelsData = channels as { id: string; youtube_id: string }[] | null

    // Channels are imported but NOT auto-assigned to any group
    // User will manually organize them into groups later
    // This prevents the bug where all channels get dumped into a random existing group

    // Populate user_subscriptions table for channel listing
    const userSubscriptions =
      channelsData?.map((ch) => ({
        user_id: userId,
        channel_id: ch.id,
      })) || []

    if (userSubscriptions.length > 0) {
      const { error: subError } = await admin.from('user_subscriptions').upsert(userSubscriptions as never, {
        onConflict: 'user_id,channel_id',
        ignoreDuplicates: true,
      })
      if (subError) {
        console.error('[Sync] User subscriptions upsert error:', subError)
      }
    }

    // Record sync in history
    const totalQuotaUsed = subApiCalls + detailsApiCalls
    await admin.rpc('record_sync_completion', {
      p_user_id: userId,
      p_sync_type: 'subscription_import',
      p_started_at: new Date(startTime).toISOString(),
      p_success: true,
      p_channels_processed: channelsData?.length || 0,
      p_channels_failed: 0,
      p_videos_added: 0,
      p_quota_used: totalQuotaUsed,
      p_error_message: null,
    } as never)

    // Complete progress tracking
    await progress.complete(
      `Imported ${channelsData?.length || 0} channels from your YouTube subscriptions`
    )

    return NextResponse.json({
      success: true,
      channelsImported: channelsData?.length || 0,
      quotaUsed: totalQuotaUsed,
      durationMs: Date.now() - startTime,
    })
  } catch (error) {
    console.error('[Sync] Subscription sync error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  } finally {
    // Always release the lock
    if (userId && lockId) {
      await releaseSyncLock(userId, lockId)
    }
  }
}

// GET: Check if user has subscriptions imported
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user has any groups with channels
    const { data: groups } = await supabase.rpc('get_groups_with_channels', { p_user_id: userId } as never)

    const groupsData = groups as { channel_count: number }[] | null
    const hasSubscriptions = groupsData && groupsData.some((g) => g.channel_count > 0)

    return NextResponse.json({
      hasSubscriptions,
      groupCount: groupsData?.length || 0,
      totalChannels: groupsData?.reduce((sum, g) => sum + g.channel_count, 0) || 0,
    })
  } catch (error) {
    console.error('[Sync] Subscription check error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
