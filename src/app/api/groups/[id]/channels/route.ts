import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

// Get channels in a group
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const { id: groupId } = await context.params
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Verify group belongs to user
    const { data: group } = await supabase
      .from('channel_groups')
      .select('id')
      .eq('id', groupId)
      .eq('user_id', userId)
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    // Get channels in this group
    const { data: groupChannels, error } = await supabase
      .from('group_channels')
      .select(`
        channel_id,
        channels (
          id,
          youtube_id,
          title,
          thumbnail
        )
      `)
      .eq('group_id', groupId)

    if (error) {
      console.error('Fetch group channels error:', error)
      return NextResponse.json({ error: 'Failed to fetch channels' }, { status: 500 })
    }

    const channels = (groupChannels || [])
      .map(gc => gc.channels)
      .filter(Boolean)

    return NextResponse.json({ channels })
  } catch (error) {
    console.error('Get group channels API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Update channels in a group (replace all)
export async function PUT(request: NextRequest, context: RouteContext) {
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
      .select('id')
      .eq('id', groupId)
      .eq('user_id', userId)
      .single()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const body = await request.json()
    const { channelIds } = body

    if (!Array.isArray(channelIds)) {
      return NextResponse.json({ error: 'channelIds must be an array' }, { status: 400 })
    }

    // Get current channels in this group (before changes)
    const { data: currentGroupChannelsData } = await admin
      .from('group_channels')
      .select('channel_id')
      .eq('group_id', groupId)

    const currentGroupChannels = currentGroupChannelsData as { channel_id: string }[] | null
    const currentChannelIdList = (currentGroupChannels || []).map(gc => gc.channel_id)
    const newChannelIdSet = new Set(channelIds as string[])

    // Find channels being removed from this group
    const removedChannelIds = currentChannelIdList.filter(id => !newChannelIdSet.has(id))

    // Delete existing channels from group
    await admin
      .from('group_channels')
      .delete()
      .eq('group_id', groupId)

    // Add new channels
    if (channelIds.length > 0) {
      const channelsToInsert = channelIds.map((channelId: string) => ({
        group_id: groupId,
        channel_id: channelId,
      }))

      const { error: insertError } = await admin
        .from('group_channels')
        .insert(channelsToInsert as never)

      if (insertError) {
        console.error('Insert group channels error:', insertError)
        return NextResponse.json({ error: 'Failed to update channels' }, { status: 500 })
      }
    }

    // For each removed channel, check if it's still in any of user's other groups
    // If not, delete all videos for that channel
    for (const channelId of removedChannelIds) {
      // Get all groups for this user
      const { data: userGroupsData } = await admin
        .from('channel_groups')
        .select('id')
        .eq('user_id', userId)

      const userGroups = userGroupsData as { id: string }[] | null
      const userGroupIds = (userGroups || []).map(g => g.id)

      // Check if channel is still in any of user's groups
      const { data: remainingGroupsData } = await admin
        .from('group_channels')
        .select('group_id')
        .eq('channel_id', channelId)
        .in('group_id', userGroupIds)

      const remainingGroups = remainingGroupsData as { group_id: string }[] | null

      // If channel is no longer in any of user's groups, delete videos immediately
      if (!remainingGroups || remainingGroups.length === 0) {
        console.log(`[ChannelRemoval] Channel ${channelId} removed from all groups for user ${userId}, deleting videos`)

        // Delete videos directly - watch_status cascades automatically via FK
        const { count } = await admin
          .from('videos')
          .delete({ count: 'exact' })
          .eq('channel_id', channelId)
          .eq('user_id', userId)

        console.log(`[ChannelRemoval] Deleted ${count ?? 0} videos for channel ${channelId}`)

        // Remove user subscription
        await admin
          .from('user_subscriptions')
          .delete()
          .eq('user_id', userId)
          .eq('channel_id', channelId)
      }
    }

    return NextResponse.json({ success: true, count: channelIds.length })
  } catch (error) {
    console.error('Update group channels API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
