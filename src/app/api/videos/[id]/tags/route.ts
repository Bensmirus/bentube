import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextRequest, NextResponse } from 'next/server'

type VideoTagRow = {
  tag_id: string
  tags: { id: string; name: string; group_id: string | null }[] | { id: string; name: string; group_id: string | null } | null
}

// GET /api/videos/[id]/tags - Get tags for a video
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    // Get all tags for this video
    const { data: videoTags, error } = await supabase
      .from('video_tags')
      .select('tag_id, tags(id, name, group_id)')
      .eq('user_id', userId)
      .eq('video_id', videoId)

    if (error) {
      console.error('Failed to fetch video tags:', error)
      return NextResponse.json({ error: 'Failed to fetch video tags' }, { status: 500 })
    }

    // Extract tags from the joined result
    const tags = (videoTags || []).map((vt: VideoTagRow) => vt.tags).filter(Boolean)

    return NextResponse.json({ tags })
  } catch (error) {
    console.error('Video tags API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST /api/videos/[id]/tags - Set tags for a video
// Body: { groupId: string, tagNames: string[] }
// This will create new tags if they don't exist, and sync the video's tags
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: videoId } = await params
    const supabase = await createServerSupabaseClient()

    // Get user's internal ID
    const { userId, error: userError } = await getInternalUserId(supabase)
    if (userError || !userId) {
      return NextResponse.json({ error: userError || 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { groupId, tagNames } = body

    if (!groupId || !Array.isArray(tagNames)) {
      return NextResponse.json({ error: 'groupId and tagNames array required' }, { status: 400 })
    }

    // Normalize tag names (trim, case insensitive)
    const normalizedTagNames = Array.from(new Set(
      tagNames
        .map((name: string) => name.trim())
        .filter((name: string) => name.length > 0)
    ))

    // If no tags, remove all tags from this video
    if (normalizedTagNames.length === 0) {
      const { error: deleteError } = await supabase
        .from('video_tags')
        .delete()
        .eq('user_id', userId)
        .eq('video_id', videoId)

      if (deleteError) {
        console.error('Failed to remove video tags:', deleteError)
        return NextResponse.json({ error: 'Failed to remove tags' }, { status: 500 })
      }

      return NextResponse.json({ tags: [] })
    }

    // Create tags if they don't exist (using upsert with case-insensitive matching)
    const tagIds: string[] = []

    for (const tagName of normalizedTagNames) {
      // Try to find existing tag (case insensitive)
      const { data: existingTags } = await supabase
        .from('tags')
        .select('id')
        .eq('user_id', userId)
        .eq('group_id', groupId)
        .ilike('name', tagName)
        .limit(1)

      if (existingTags && existingTags.length > 0) {
        tagIds.push(existingTags[0].id)
      } else {
        // Create new tag
        const { data: newTag, error: createError } = await supabase
          .from('tags')
          .insert({
            user_id: userId,
            group_id: groupId,
            name: tagName,
          })
          .select('id')
          .single()

        if (createError) {
          console.error('Failed to create tag:', createError)
          return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 })
        }

        tagIds.push(newTag.id)
      }
    }

    // Remove all existing video_tags for this video
    await supabase
      .from('video_tags')
      .delete()
      .eq('user_id', userId)
      .eq('video_id', videoId)

    // Add new video_tags
    const videoTagsToInsert = tagIds.map(tagId => ({
      user_id: userId,
      video_id: videoId,
      tag_id: tagId,
    }))

    const { error: insertError } = await supabase
      .from('video_tags')
      .insert(videoTagsToInsert)

    if (insertError) {
      console.error('Failed to add video tags:', insertError)
      return NextResponse.json({ error: 'Failed to add tags' }, { status: 500 })
    }

    // Fetch updated tags
    const { data: updatedTags } = await supabase
      .from('video_tags')
      .select('tag_id, tags(id, name, group_id)')
      .eq('user_id', userId)
      .eq('video_id', videoId)

    const tags = (updatedTags || []).map((vt: VideoTagRow) => vt.tags).filter(Boolean)

    return NextResponse.json({ tags })
  } catch (error) {
    console.error('Video tags API error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
