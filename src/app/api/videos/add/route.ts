import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'
import { parseDuration } from '@/lib/utils'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const {
    videoId,
    title,
    thumbnail,
    channelId,
    channelTitle,
    channelThumbnail,
    publishedAt,
    duration,
    groupIds,
  } = await request.json()

  if (!videoId || !groupIds || groupIds.length === 0) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  try {
    // Verify all group IDs belong to this user
    const { data: userGroups, error: groupsError } = await admin
      .from('channel_groups')
      .select('id')
      .eq('user_id', userId)
      .in('id', groupIds)

    if (groupsError) {
      console.error('[AddVideo] Failed to verify groups:', groupsError)
      return NextResponse.json({ error: 'Failed to verify groups' }, { status: 500 })
    }

    const validGroupIds = (userGroups || []).map((g: { id: string }) => g.id)
    if (validGroupIds.length !== groupIds.length) {
      return NextResponse.json({ error: 'Invalid group selection' }, { status: 403 })
    }

    // 1. Upsert channel (creates if doesn't exist)
    const { data: channelData, error: channelError } = await admin
      .from('channels')
      .upsert({
        youtube_id: channelId,
        title: channelTitle,
        thumbnail: channelThumbnail,
        activity_level: 'medium',
      } as never, { onConflict: 'youtube_id' })
      .select('id')
      .single()

    if (channelError || !channelData) {
      console.error('[AddVideo] Failed to create/get channel:', channelError)
      throw new Error('Failed to create channel')
    }

    const channel = channelData as { id: string }

    // 2. Add channel to selected groups (so video appears in feeds)
    // Note: We intentionally don't create a user_subscription, so the channel won't auto-sync future videos
    const groupChannels = groupIds.map((groupId: string) => ({
      group_id: groupId,
      channel_id: channel.id,
    }))

    await admin
      .from('group_channels')
      .upsert(groupChannels as never, { onConflict: 'group_id,channel_id', ignoreDuplicates: true })

    // 3. Parse duration to seconds
    const { seconds: durationSeconds } = parseDuration(duration)
    const isShort = (durationSeconds || 0) > 0 && (durationSeconds || 0) <= 60

    // 4. Upsert the video
    const { error: videoError } = await admin
      .from('videos')
      .upsert({
        youtube_id: videoId,
        channel_id: channel.id,
        user_id: userId,
        title,
        thumbnail,
        duration,
        duration_seconds: durationSeconds,
        is_short: isShort,
        published_at: publishedAt,
      } as never, { onConflict: 'user_id,youtube_id' })

    if (videoError) {
      console.error('[AddVideo] Failed to insert video:', videoError)
      return NextResponse.json({ error: 'Failed to add video' }, { status: 500 })
    }

    return NextResponse.json({
      success: true,
      videoId,
      channelId: channel.id,
    })
  } catch (error) {
    console.error('[AddVideo] Error:', error)
    return NextResponse.json({ error: 'Failed to add video' }, { status: 500 })
  }
}
