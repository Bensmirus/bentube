import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type RouteContext = {
  params: Promise<{ id: string }>
}

// Get playlists in a group
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

    // Get playlists in this group
    const { data: groupPlaylists, error } = await supabase
      .from('group_playlists')
      .select(`
        playlist_id,
        user_playlists (
          id,
          youtube_playlist_id,
          title,
          thumbnail
        )
      `)
      .eq('group_id', groupId)

    if (error) {
      console.error('Fetch group playlists error:', error)
      return NextResponse.json({ error: 'Failed to fetch playlists' }, { status: 500 })
    }

    const playlists = (groupPlaylists || [])
      .map(gp => gp.user_playlists)
      .filter(Boolean)

    return NextResponse.json({ playlists })
  } catch (error) {
    console.error('Get group playlists API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// Update playlists in a group (replace all)
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
    const { playlistIds } = body

    if (!Array.isArray(playlistIds)) {
      return NextResponse.json({ error: 'playlistIds must be an array' }, { status: 400 })
    }

    // Get current playlists in this group (before changes)
    const { data: currentGroupPlaylistsData } = await admin
      .from('group_playlists')
      .select('playlist_id')
      .eq('group_id', groupId)

    const currentGroupPlaylists = currentGroupPlaylistsData as { playlist_id: string }[] | null
    const currentPlaylistIdList = (currentGroupPlaylists || []).map(gp => gp.playlist_id)
    const newPlaylistIdSet = new Set(playlistIds as string[])

    // Find playlists being removed from this group
    const removedPlaylistIds = currentPlaylistIdList.filter(id => !newPlaylistIdSet.has(id))

    // Delete existing playlists from group
    await admin
      .from('group_playlists')
      .delete()
      .eq('group_id', groupId)

    // Add new playlists
    if (playlistIds.length > 0) {
      const playlistsToInsert = playlistIds.map((playlistId: string) => ({
        group_id: groupId,
        playlist_id: playlistId,
      }))

      const { error: insertError } = await admin
        .from('group_playlists')
        .insert(playlistsToInsert as never)

      if (insertError) {
        console.error('Insert group playlists error:', insertError)
        return NextResponse.json({ error: 'Failed to update playlists' }, { status: 500 })
      }
    }

    // For each removed playlist, check if it's still in any of user's other groups
    // If not, the playlist will be orphaned but we don't auto-delete
    // (User can manually delete the playlist if they want)
    for (const playlistId of removedPlaylistIds) {
      // Get all groups for this user
      const { data: userGroupsData } = await admin
        .from('channel_groups')
        .select('id')
        .eq('user_id', userId)

      const userGroups = userGroupsData as { id: string }[] | null
      const userGroupIds = (userGroups || []).map(g => g.id)

      // Check if playlist is still in any of user's groups
      const { data: remainingGroupsData } = await admin
        .from('group_playlists')
        .select('group_id')
        .eq('playlist_id', playlistId)
        .in('group_id', userGroupIds)

      const remainingGroups = remainingGroupsData as { group_id: string }[] | null

      // Log if playlist is now orphaned (not in any group)
      if (!remainingGroups || remainingGroups.length === 0) {
        console.log(`[PlaylistRemoval] Playlist ${playlistId} is no longer in any group for user ${userId}`)
        // Note: We don't auto-delete orphaned playlists - user may want to add to another group later
      }
    }

    return NextResponse.json({ success: true, count: playlistIds.length })
  } catch (error) {
    console.error('Update group playlists API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
