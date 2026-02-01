import { NextResponse } from 'next/server'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch all user data in parallel
    const [
      groupsResult,
      channelsResult,
      groupChannelsResult,
      watchStatusResult,
      notesResult,
      tagsResult,
      videoTagsResult,
    ] = await Promise.all([
      // User's groups
      supabase
        .from('channel_groups')
        .select('id, name, color, icon, sort_order, created_at')
        .eq('user_id', userId)
        .order('sort_order'),

      // All channels the user is subscribed to (via user_subscriptions)
      supabase
        .from('user_subscriptions')
        .select(`
          channel_id,
          subscribed_at,
          channels (
            id,
            youtube_id,
            title,
            thumbnail
          )
        `)
        .eq('user_id', userId),

      // Group-channel relationships
      supabase
        .from('group_channels')
        .select(`
          group_id,
          channel_id,
          added_at
        `)
        .in(
          'group_id',
          (await supabase.from('channel_groups').select('id').eq('user_id', userId)).data?.map(g => g.id) || []
        ),

      // Watch status for all videos
      supabase
        .from('watch_status')
        .select(`
          video_id,
          watched,
          hidden,
          watch_later,
          watch_progress,
          watch_progress_seconds,
          last_position_at,
          updated_at,
          videos (
            youtube_id,
            title,
            channel_id,
            channels (
              youtube_id,
              title
            )
          )
        `)
        .eq('user_id', userId),

      // Video notes
      supabase
        .from('video_notes')
        .select(`
          video_id,
          content,
          updated_at,
          videos (
            youtube_id,
            title,
            channel_id,
            channels (
              youtube_id,
              title
            )
          )
        `)
        .eq('user_id', userId),

      // Tags
      supabase
        .from('tags')
        .select('id, name, color, group_id, sort_order, created_at')
        .eq('user_id', userId),

      // Video tags
      supabase
        .from('video_tags')
        .select(`
          tag_id,
          video_id,
          created_at,
          videos (
            youtube_id,
            title
          )
        `)
        .eq('user_id', userId),
    ])

    // Build the export object
    const exportData = {
      exportInfo: {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        app: 'Ben.Tube',
      },
      groups: (groupsResult.data || []).map(group => ({
        name: group.name,
        color: group.color,
        icon: group.icon,
        sortOrder: group.sort_order,
        createdAt: group.created_at,
        channels: (groupChannelsResult.data || [])
          .filter(gc => gc.group_id === group.id)
          .map(gc => {
            const sub = (channelsResult.data || []).find(
              c => c.channel_id === gc.channel_id
            )
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const channel = sub?.channels as any
            return channel ? {
              youtubeId: channel.youtube_id,
              title: channel.title,
              addedAt: gc.added_at,
            } : null
          })
          .filter(Boolean),
      })),
      subscriptions: (channelsResult.data || []).map(sub => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const channel = sub.channels as any
        return {
          youtubeId: channel?.youtube_id,
          title: channel?.title,
          subscribedAt: sub.subscribed_at,
        }
      }).filter(s => s.youtubeId),
      watchHistory: (watchStatusResult.data || [])
        .filter(ws => ws.watched || ws.watch_progress > 0)
        .map(ws => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const video = ws.videos as any
          return {
            video: {
              youtubeId: video?.youtube_id,
              title: video?.title,
              channel: {
                youtubeId: video?.channels?.youtube_id,
                title: video?.channels?.title,
              },
            },
            watched: ws.watched,
            watchProgress: ws.watch_progress,
            watchProgressSeconds: ws.watch_progress_seconds,
            lastPositionAt: ws.last_position_at,
            updatedAt: ws.updated_at,
          }
        }),
      watchLater: (watchStatusResult.data || [])
        .filter(ws => ws.watch_later)
        .map(ws => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const video = ws.videos as any
          return {
            video: {
              youtubeId: video?.youtube_id,
              title: video?.title,
              channel: {
                youtubeId: video?.channels?.youtube_id,
                title: video?.channels?.title,
              },
            },
            addedAt: ws.updated_at,
          }
        }),
      hidden: (watchStatusResult.data || [])
        .filter(ws => ws.hidden)
        .map(ws => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const video = ws.videos as any
          return {
            video: {
              youtubeId: video?.youtube_id,
              title: video?.title,
              channel: {
                youtubeId: video?.channels?.youtube_id,
                title: video?.channels?.title,
              },
            },
            hiddenAt: ws.updated_at,
          }
        }),
      notes: (notesResult.data || []).map(note => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const video = note.videos as any
        return {
          video: {
            youtubeId: video?.youtube_id,
            title: video?.title,
            channel: {
              youtubeId: video?.channels?.youtube_id,
              title: video?.channels?.title,
            },
          },
          content: note.content,
          updatedAt: note.updated_at,
        }
      }),
      tags: (tagsResult.data || []).map(tag => {
        const group = (groupsResult.data || []).find(g => g.id === tag.group_id)
        return {
          name: tag.name,
          color: tag.color,
          groupName: group?.name || null,
          createdAt: tag.created_at,
          videos: (videoTagsResult.data || [])
            .filter(vt => vt.tag_id === tag.id)
            .map(vt => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const video = vt.videos as any
              return {
                youtubeId: video?.youtube_id,
                title: video?.title,
                taggedAt: vt.created_at,
              }
            }),
        }
      }),
      statistics: {
        totalGroups: groupsResult.data?.length || 0,
        totalSubscriptions: channelsResult.data?.length || 0,
        totalWatched: (watchStatusResult.data || []).filter(ws => ws.watched).length,
        totalWatchLater: (watchStatusResult.data || []).filter(ws => ws.watch_later).length,
        totalHidden: (watchStatusResult.data || []).filter(ws => ws.hidden).length,
        totalNotes: notesResult.data?.length || 0,
        totalTags: tagsResult.data?.length || 0,
      },
    }

    // Return as downloadable JSON
    return new NextResponse(JSON.stringify(exportData, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="bentube-export-${new Date().toISOString().split('T')[0]}.json"`,
      },
    })
  } catch (error) {
    console.error('Export error:', error)
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 })
  }
}
