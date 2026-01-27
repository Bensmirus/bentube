import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

/**
 * DELETE /api/groups/[id]/videos
 * Delete all videos from channels in a specific group
 */
export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const { id: groupId } = await context.params
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Verify group belongs to user
    const { data: group } = await supabase
      .from('channel_groups')
      .select('id, name')
      .eq('id', groupId)
      .eq('user_id', userId)
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Get all channels in this group
    const { data: groupChannelsData, error: channelsError } = await admin
      .from('group_channels')
      .select('channel_id')
      .eq('group_id', groupId)

    if (channelsError) {
      console.error('[DeleteGroupVideos] Error fetching group channels:', channelsError)
      return NextResponse.json({ error: 'Failed to fetch group channels' }, { status: 500 })
    }

    const groupChannels = groupChannelsData as { channel_id: string }[] | null

    if (!groupChannels || groupChannels.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No channels in this group'
      })
    }

    const channelIds = groupChannels.map(gc => gc.channel_id)

    // Delete all videos for these channels for this user
    // watch_status will cascade delete automatically via FK
    const { count, error: deleteError } = await admin
      .from('videos')
      .delete({ count: 'exact' })
      .in('channel_id', channelIds)
      .eq('user_id', userId)

    if (deleteError) {
      console.error('[DeleteGroupVideos] Error deleting videos:', deleteError)
      return NextResponse.json({ error: 'Failed to delete videos' }, { status: 500 })
    }

    const deletedCount = count ?? 0
    console.log(`[DeleteGroupVideos] Deleted ${deletedCount} videos from group "${group.name}" for user ${userId}`)

    return NextResponse.json({
      success: true,
      deletedCount,
      message: `Deleted ${deletedCount} videos from ${channelIds.length} channels`
    })
  } catch (error) {
    console.error('[DeleteGroupVideos] API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
