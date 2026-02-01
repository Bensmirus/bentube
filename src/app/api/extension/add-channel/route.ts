import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeClient } from '@/lib/youtube/client'

// CORS headers for extension requests from YouTube
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
}

// Handle preflight requests
export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    // Validate API key
    const authHeader = request.headers.get('authorization')
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: 'Missing authorization header' },
        { status: 401, headers: corsHeaders }
      )
    }

    const userId = await validateApiKey(authHeader)
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'Invalid API key' },
        { status: 401, headers: corsHeaders }
      )
    }

    // Parse request body
    const body = await request.json()
    const { youtubeChannelId, groupId } = body

    if (!youtubeChannelId) {
      return NextResponse.json(
        { success: false, error: 'Missing youtubeChannelId' },
        { status: 400, headers: corsHeaders }
      )
    }

    if (!groupId) {
      return NextResponse.json(
        { success: false, error: 'Missing groupId' },
        { status: 400, headers: corsHeaders }
      )
    }

    const admin = createAdminClient()

    // Verify the group belongs to this user
    const { data: group, error: groupError } = await admin
      .from('channel_groups')
      .select('id')
      .eq('id', groupId)
      .eq('user_id', userId)
      .single()

    if (groupError || !group) {
      return NextResponse.json(
        { success: false, error: 'Group not found or access denied' },
        { status: 404, headers: corsHeaders }
      )
    }

    // Check if channel already exists in our database
    const { data: existingChannelData } = await admin
      .from('channels')
      .select('id, youtube_id, title')
      .eq('youtube_id', youtubeChannelId)
      .single()

    const existingChannel = existingChannelData as { id: string; youtube_id: string; title: string } | null

    let channelId: string
    let channelTitle: string

    if (existingChannel) {
      // Channel exists, use it
      channelId = existingChannel.id
      channelTitle = existingChannel.title || 'Unknown Channel'
    } else {
      // Need to fetch channel info from YouTube
      const { client: youtube, error: ytError } = await getYouTubeClient(userId)
      if (!youtube || ytError) {
        return NextResponse.json(
          { success: false, error: 'YouTube not connected. Please reconnect in BenTube settings.' },
          { status: 400, headers: corsHeaders }
        )
      }

      // Fetch channel info
      const response = await youtube.channels.list({
        part: ['snippet', 'contentDetails'],
        id: [youtubeChannelId],
      })

      const ytChannel = response.data.items?.[0]
      if (!ytChannel) {
        return NextResponse.json(
          { success: false, error: 'Channel not found on YouTube' },
          { status: 404, headers: corsHeaders }
        )
      }

      // Create the channel in our database
      const { data: newChannel, error: createError } = await admin
        .from('channels')
        .insert({
          youtube_id: youtubeChannelId,
          title: ytChannel.snippet?.title || 'Unknown Channel',
          thumbnail: ytChannel.snippet?.thumbnails?.medium?.url,
          uploads_playlist_id: ytChannel.contentDetails?.relatedPlaylists?.uploads,
          activity_level: 'medium',
        } as never)
        .select('id, title')
        .single()

      if (createError || !newChannel) {
        console.error('[Extension/AddChannel] Failed to create channel:', createError)
        return NextResponse.json(
          { success: false, error: 'Failed to create channel' },
          { status: 500, headers: corsHeaders }
        )
      }

      channelId = (newChannel as { id: string; title: string }).id
      channelTitle = (newChannel as { id: string; title: string }).title
    }

    // Create user subscription (if not exists)
    await admin
      .from('user_subscriptions')
      .upsert({
        user_id: userId,
        channel_id: channelId,
      } as never, { onConflict: 'user_id,channel_id', ignoreDuplicates: true })

    // Create user_channels entry for health tracking (if not exists)
    await admin
      .from('user_channels')
      .upsert({
        user_id: userId,
        channel_id: channelId,
        failure_count: 0,
        is_dead: false,
      } as never, { onConflict: 'user_id,channel_id', ignoreDuplicates: true })

    // Check if channel is already in this group
    const { data: existingGroupChannel } = await admin
      .from('group_channels')
      .select('id')
      .eq('group_id', groupId)
      .eq('channel_id', channelId)
      .single()

    if (existingGroupChannel) {
      return NextResponse.json(
        {
          success: true,
          data: {
            channelId,
            channelTitle,
            alreadyInGroup: true,
          },
        },
        { headers: corsHeaders }
      )
    }

    // Add channel to the group
    const { error: groupChannelError } = await admin
      .from('group_channels')
      .insert({
        group_id: groupId,
        channel_id: channelId,
      } as never)

    if (groupChannelError) {
      console.error('[Extension/AddChannel] Failed to add channel to group:', groupChannelError)
      return NextResponse.json(
        { success: false, error: 'Failed to add channel to group' },
        { status: 500, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          channelId,
          channelTitle,
          alreadyInGroup: false,
        },
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[Extension/AddChannel] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
