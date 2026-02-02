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

  // Extract video ID from various URL formats
  const videoId = extractVideoId(url)
  if (!videoId) {
    return NextResponse.json({ error: 'Invalid YouTube video URL' }, { status: 400 })
  }

  // Get YouTube client
  const { client: youtube, error: ytError } = await getYouTubeClient(userId)
  if (!youtube || ytError) {
    return NextResponse.json({ error: ytError || 'YouTube not connected' }, { status: 400 })
  }

  try {
    // Fetch video info from YouTube
    const response = await youtube.videos.list({
      part: ['snippet', 'contentDetails', 'statistics'],
      id: [videoId],
    })

    const video = response.data.items?.[0]
    if (!video) {
      return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    }

    // Check if video already exists for this user
    const { data: existingVideo } = await admin
      .from('videos')
      .select('id')
      .eq('youtube_id', videoId)
      .eq('user_id', userId)
      .single()

    // Get channel thumbnail
    let channelThumbnail: string | null = null
    if (video.snippet?.channelId) {
      const channelResponse = await youtube.channels.list({
        part: ['snippet'],
        id: [video.snippet.channelId],
      })
      channelThumbnail = channelResponse.data.items?.[0]?.snippet?.thumbnails?.default?.url || null
    }

    // Check if it's a Short (60 seconds or less)
    const duration = video.contentDetails?.duration || 'PT0S'
    const durationMatch = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/)
    let durationSeconds = 0
    if (durationMatch) {
      const hours = parseInt(durationMatch[1] || '0')
      const minutes = parseInt(durationMatch[2] || '0')
      const seconds = parseInt(durationMatch[3] || '0')
      durationSeconds = hours * 3600 + minutes * 60 + seconds
    }
    const isShort = durationSeconds > 0 && durationSeconds <= 60

    return NextResponse.json({
      videoId: video.id,
      title: video.snippet?.title,
      thumbnail: video.snippet?.thumbnails?.maxres?.url ||
                 video.snippet?.thumbnails?.high?.url ||
                 video.snippet?.thumbnails?.medium?.url,
      channelId: video.snippet?.channelId,
      channelTitle: video.snippet?.channelTitle,
      channelThumbnail,
      publishedAt: video.snippet?.publishedAt,
      duration,
      viewCount: video.statistics?.viewCount || '0',
      description: video.snippet?.description?.substring(0, 200),
      alreadyExists: !!existingVideo,
      isShort,
    })
  } catch (error) {
    console.error('[VideoLookup] Error:', error)
    return NextResponse.json({ error: 'Failed to fetch video info' }, { status: 500 })
  }
}

// Helper: Extract video ID from various URL formats
function extractVideoId(url: string): string | null {
  const cleanUrl = url.trim()

  // Handle direct video ID (11 characters)
  if (/^[a-zA-Z0-9_-]{11}$/.test(cleanUrl)) {
    return cleanUrl
  }

  // URL patterns
  const patterns = [
    // https://www.youtube.com/watch?v=VIDEO_ID
    /(?:youtube\.com\/watch\?.*v=|youtube\.com\/watch\?v=)([a-zA-Z0-9_-]{11})/,
    // https://youtu.be/VIDEO_ID
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    // https://www.youtube.com/embed/VIDEO_ID
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    // https://www.youtube.com/v/VIDEO_ID
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    // https://www.youtube.com/shorts/VIDEO_ID
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]

  for (const pattern of patterns) {
    const match = cleanUrl.match(pattern)
    if (match) {
      return match[1]
    }
  }

  return null
}
