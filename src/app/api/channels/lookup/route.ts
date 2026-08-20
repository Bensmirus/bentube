import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { NextRequest, NextResponse } from 'next/server'

type SubscriptionState = 'new' | 'imported' | 'already_in_group'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url, groupId } = await request.json()
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  if (groupId) {
    const { data: group } = await admin
      .from('channel_groups')
      .select('id')
      .eq('id', groupId)
      .eq('user_id', userId)
      .maybeSingle()

    if (!group) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }
  }

  // Extract channel identifier from various URL formats
  const identifier = extractChannelIdentifier(url)
  if (!identifier) {
    return NextResponse.json({ error: 'No Channel Found, Check URL' }, { status: 400 })
  }

  // Get YouTube client
  const { client: youtube, error: ytError } = await getYouTubeClient(userId)
  if (!youtube || ytError) {
    return NextResponse.json({ error: ytError || 'YouTube not connected' }, { status: 400 })
  }

  try {
    // Resolve the channel ID (handles @handle, /c/, /user/ formats)
    let channelId = identifier.value

    if (identifier.type !== 'channel') {
      // Need to resolve handle/username to channel ID
      const searchResponse = await youtube.search.list({
        part: ['snippet'],
        q: identifier.value,
        type: ['channel'],
        maxResults: 1,
      })

      const foundChannel = searchResponse.data.items?.[0]
      if (!foundChannel?.snippet?.channelId) {
        // Try direct channel lookup by forHandle
        const channelResponse = await youtube.channels.list({
          part: ['snippet', 'statistics', 'contentDetails'],
          forHandle: identifier.value,
        })

        if (!channelResponse.data.items?.[0]) {
          return NextResponse.json({ error: 'No Channel Found, Check URL' }, { status: 404 })
        }

        channelId = channelResponse.data.items[0].id!
      } else {
        channelId = foundChannel.snippet.channelId
      }
    }

    // Check the user's subscription and the selected group's membership without
    // rejecting existing channels. The caller uses this to show one of the
    // three supported outcomes before committing the add.
    const { data: existingChannelData, error: existingChannelError } = await admin
      .from('channels')
      .select('id, youtube_id')
      .eq('youtube_id', channelId)
      .maybeSingle()

    if (existingChannelError) {
      console.error('[ChannelLookup] Failed to check existing channel:', existingChannelError)
      return NextResponse.json({ error: 'Failed to check channel' }, { status: 500 })
    }

    const existingChannel = existingChannelData as { id: string; youtube_id: string } | null
    let subscriptionState: SubscriptionState = 'new'

    if (existingChannel) {
      const { data: userSub, error: userSubError } = await admin
        .from('user_subscriptions')
        .select('channel_id')
        .eq('user_id', userId)
        .eq('channel_id', existingChannel.id)
        .maybeSingle()

      if (userSubError) {
        console.error('[ChannelLookup] Failed to check user subscription:', userSubError)
        return NextResponse.json({ error: 'Failed to check subscription' }, { status: 500 })
      }

      if (userSub) {
        subscriptionState = 'imported'

        if (groupId) {
          const { data: membership, error: membershipError } = await admin
            .from('group_channels')
            .select('group_id')
            .eq('group_id', groupId)
            .eq('channel_id', existingChannel.id)
            .maybeSingle()

          if (membershipError) {
            console.error('[ChannelLookup] Failed to check group membership:', membershipError)
            return NextResponse.json({ error: 'Failed to check group membership' }, { status: 500 })
          }

          if (membership) subscriptionState = 'already_in_group'
        }
      }
    }

    // Fetch channel info from YouTube
    const response = await youtube.channels.list({
      part: ['snippet', 'statistics', 'contentDetails'],
      id: [channelId],
    })

    const channel = response.data.items?.[0]
    if (!channel) {
      return NextResponse.json({ error: 'No Channel Found, Check URL' }, { status: 404 })
    }

    const videoCount = parseInt(channel.statistics?.videoCount || '0', 10)

    return NextResponse.json({
      channelId: channel.id,
      title: channel.snippet?.title,
      thumbnail: channel.snippet?.thumbnails?.medium?.url,
      subscriberCount: formatSubscriberCount(channel.statistics?.subscriberCount),
      videoCount,
      description: channel.snippet?.description?.substring(0, 200),
      uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
      subscriptionState,
      hasWarning: videoCount > 5000,
      warningMessage: videoCount > 5000
        ? `This channel has ${videoCount.toLocaleString()} videos. Importing all videos will use significant API quota.`
        : null,
    })
  } catch (error) {
    console.error('[ChannelLookup] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch channel info' }, { status: 500 })
  }
}

type IdentifierType = 'channel' | 'handle' | 'custom' | 'user'

type ChannelIdentifier = {
  type: IdentifierType
  value: string
}

// Helper: Extract channel identifier from various URL formats
function extractChannelIdentifier(url: string): ChannelIdentifier | null {
  // Clean up the URL
  const cleanUrl = url.trim()

  // Handle direct channel ID (UC...)
  if (/^UC[a-zA-Z0-9_-]{22}$/.test(cleanUrl)) {
    return { type: 'channel', value: cleanUrl }
  }

  // Handle @handle without URL
  if (/^@[a-zA-Z0-9_.-]+$/.test(cleanUrl)) {
    return { type: 'handle', value: cleanUrl.substring(1) }
  }

  // URL patterns
  const patterns: Array<{ regex: RegExp; type: IdentifierType }> = [
    // https://www.youtube.com/channel/UCxxxxxx
    { regex: /youtube\.com\/channel\/([a-zA-Z0-9_-]+)/, type: 'channel' },
    // https://www.youtube.com/@username
    { regex: /youtube\.com\/@([a-zA-Z0-9_.-]+)/, type: 'handle' },
    // https://www.youtube.com/c/customname
    { regex: /youtube\.com\/c\/([a-zA-Z0-9_.-]+)/, type: 'custom' },
    // https://www.youtube.com/user/username
    { regex: /youtube\.com\/user\/([a-zA-Z0-9_.-]+)/, type: 'user' },
  ]

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern.regex)
    if (match) {
      return { type: pattern.type, value: match[1] }
    }
  }

  return null
}

function formatSubscriberCount(count?: string | null): string {
  if (!count) return 'Unknown subscribers'
  const num = parseInt(count, 10)
  if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M subscribers`
  if (num >= 1000) return `${(num / 1000).toFixed(0)}K subscribers`
  return `${num} subscribers`
}
