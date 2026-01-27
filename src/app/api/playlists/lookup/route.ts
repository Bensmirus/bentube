import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { getYouTubeClient } from '@/lib/youtube/client'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const supabase = await createServerSupabaseClient()
  const admin = createAdminClient()

  const { userId, error: userError } = await getInternalUserId(supabase)
  if (userError || !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { url } = await request.json()
  if (!url) {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Extract playlist ID from URL
  const playlistId = extractPlaylistId(url)
  if (!playlistId) {
    return NextResponse.json({ error: 'No Playlist Found, Check URL' }, { status: 400 })
  }

  // Get YouTube client
  const { client: youtube, error: ytError } = await getYouTubeClient(userId)
  if (!youtube || ytError) {
    return NextResponse.json({ error: ytError || 'YouTube not connected' }, { status: 400 })
  }

  try {
    // Check if user already has this playlist
    const { data: existingPlaylist } = await admin
      .from('user_playlists')
      .select('id, title')
      .eq('user_id', userId)
      .eq('youtube_playlist_id', playlistId)
      .single() as { data: { id: string; title: string } | null }

    // Fetch playlist info from YouTube
    const response = await youtube.playlists.list({
      part: ['snippet', 'contentDetails'],
      id: [playlistId],
    })

    const playlist = response.data.items?.[0]
    if (!playlist) {
      return NextResponse.json({ error: 'Playlist not found or is private' }, { status: 404 })
    }

    const videoCount = playlist.contentDetails?.itemCount || 0
    const channelId = playlist.snippet?.channelId
    const channelTitle = playlist.snippet?.channelTitle

    // Get channel thumbnail if available
    let channelThumbnail = null
    if (channelId) {
      const channelResponse = await youtube.channels.list({
        part: ['snippet'],
        id: [channelId],
      })
      channelThumbnail = channelResponse.data.items?.[0]?.snippet?.thumbnails?.medium?.url
    }

    return NextResponse.json({
      playlistId: playlist.id,
      title: playlist.snippet?.title,
      thumbnail: playlist.snippet?.thumbnails?.medium?.url || playlist.snippet?.thumbnails?.default?.url,
      description: playlist.snippet?.description?.substring(0, 200),
      videoCount,
      channelId,
      channelTitle,
      channelThumbnail,
      alreadyImported: !!existingPlaylist,
      existingPlaylistId: existingPlaylist?.id || null,
      hasWarning: videoCount > 500,
      warningMessage: videoCount > 500
        ? `This playlist has ${videoCount.toLocaleString()} videos. Importing will use significant API quota.`
        : null,
    })
  } catch (error) {
    console.error('[PlaylistLookup] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch playlist info' }, { status: 500 })
  }
}

// Helper: Extract playlist ID from various URL formats
function extractPlaylistId(url: string): string | null {
  const cleanUrl = url.trim()

  // Handle direct playlist ID (PL...)
  if (/^PL[a-zA-Z0-9_-]+$/.test(cleanUrl)) {
    return cleanUrl
  }

  // Handle other playlist ID formats (UU..., RD..., OL..., etc.)
  if (/^(UU|RD|OL|LL)[a-zA-Z0-9_-]+$/.test(cleanUrl)) {
    return cleanUrl
  }

  // URL patterns for extracting playlist ID
  const patterns = [
    // https://www.youtube.com/playlist?list=PLxxxxxx
    /youtube\.com\/playlist\?list=([a-zA-Z0-9_-]+)/,
    // https://www.youtube.com/watch?v=xxx&list=PLxxxxxx
    /youtube\.com\/watch\?.*list=([a-zA-Z0-9_-]+)/,
    // https://youtu.be/xxx?list=PLxxxxxx
    /youtu\.be\/.*\?.*list=([a-zA-Z0-9_-]+)/,
  ]

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}
