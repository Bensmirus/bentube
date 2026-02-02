import { NextRequest, NextResponse } from 'next/server'
import { validateApiKey } from '@/lib/auth/api-key'
import { createAdminClient } from '@/lib/supabase/admin'
import { getYouTubeClient } from '@/lib/youtube/client'
import { parseDuration } from '@/lib/utils'

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
    const { youtubeVideoId, groupId } = body

    if (!youtubeVideoId) {
      return NextResponse.json(
        { success: false, error: 'Missing youtubeVideoId' },
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

    // Check if video already exists for this user
    const { data: existingVideo } = await admin
      .from('videos')
      .select('id, youtube_id')
      .eq('youtube_id', youtubeVideoId)
      .eq('user_id', userId)
      .single()

    if (existingVideo) {
      return NextResponse.json(
        {
          success: true,
          data: {
            videoId: youtubeVideoId,
            alreadyExists: true,
          },
        },
        { headers: corsHeaders }
      )
    }

    // Get YouTube client
    const { client: youtube, error: ytError } = await getYouTubeClient(userId)
    if (!youtube || ytError) {
      return NextResponse.json(
        { success: false, error: 'YouTube not connected. Please reconnect in BenTube settings.' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Fetch video info from YouTube
    const videoResponse = await youtube.videos.list({
      part: ['snippet', 'contentDetails'],
      id: [youtubeVideoId],
    })

    const ytVideo = videoResponse.data.items?.[0]
    if (!ytVideo) {
      return NextResponse.json(
        { success: false, error: 'Video not found on YouTube' },
        { status: 404, headers: corsHeaders }
      )
    }

    const channelId = ytVideo.snippet?.channelId
    if (!channelId) {
      return NextResponse.json(
        { success: false, error: 'Could not determine video channel' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Check if it's a Short (skip)
    const duration = ytVideo.contentDetails?.duration || 'PT0S'
    const { seconds: durationSeconds } = parseDuration(duration)
    const isShort = (durationSeconds || 0) > 0 && (durationSeconds || 0) <= 60

    if (isShort) {
      return NextResponse.json(
        { success: false, error: 'Shorts cannot be added' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Get or create channel
    let internalChannelId: string

    const { data: existingChannel } = await admin
      .from('channels')
      .select('id')
      .eq('youtube_id', channelId)
      .single()

    if (existingChannel) {
      internalChannelId = existingChannel.id
    } else {
      // Fetch channel info from YouTube
      const channelResponse = await youtube.channels.list({
        part: ['snippet', 'contentDetails'],
        id: [channelId],
      })

      const ytChannel = channelResponse.data.items?.[0]
      if (!ytChannel) {
        return NextResponse.json(
          { success: false, error: 'Channel not found on YouTube' },
          { status: 404, headers: corsHeaders }
        )
      }

      // Create the channel
      const { data: newChannel, error: createError } = await admin
        .from('channels')
        .insert({
          youtube_id: channelId,
          title: ytChannel.snippet?.title || 'Unknown Channel',
          thumbnail: ytChannel.snippet?.thumbnails?.medium?.url,
          uploads_playlist_id: ytChannel.contentDetails?.relatedPlaylists?.uploads,
          activity_level: 'medium',
        } as never)
        .select('id')
        .single()

      if (createError || !newChannel) {
        console.error('[Extension/AddVideo] Failed to create channel:', createError)
        return NextResponse.json(
          { success: false, error: 'Failed to create channel' },
          { status: 500, headers: corsHeaders }
        )
      }

      internalChannelId = (newChannel as { id: string }).id
    }

    // Link channel to group (so video appears in group feed)
    await admin
      .from('group_channels')
      .upsert({
        group_id: groupId,
        channel_id: internalChannelId,
      } as never, { onConflict: 'group_id,channel_id', ignoreDuplicates: true })

    // Create the video
    const { error: videoError } = await admin
      .from('videos')
      .insert({
        youtube_id: youtubeVideoId,
        channel_id: internalChannelId,
        user_id: userId,
        title: ytVideo.snippet?.title || 'Unknown Video',
        thumbnail: ytVideo.snippet?.thumbnails?.maxres?.url ||
                   ytVideo.snippet?.thumbnails?.high?.url ||
                   ytVideo.snippet?.thumbnails?.medium?.url,
        duration,
        duration_seconds: durationSeconds,
        is_short: isShort,
        published_at: ytVideo.snippet?.publishedAt,
      } as never)

    if (videoError) {
      console.error('[Extension/AddVideo] Failed to insert video:', videoError)
      return NextResponse.json(
        { success: false, error: 'Failed to add video' },
        { status: 500, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      {
        success: true,
        data: {
          videoId: youtubeVideoId,
          videoTitle: ytVideo.snippet?.title,
          alreadyExists: false,
        },
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('[Extension/AddVideo] Unexpected error:', error)
    return NextResponse.json(
      { success: false, error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
