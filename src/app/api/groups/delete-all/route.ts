import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getInternalUserId } from '@/lib/supabase/get-user'
import { NextResponse } from 'next/server'

/**
 * DELETE /api/groups/delete-all
 * Deletes all groups for the current user.
 * Used during import rollback to clean up on failure.
 */
export async function DELETE() {
  try {
    const supabase = await createServerSupabaseClient()
    const admin = createAdminClient()

    const { userId, error: userError } = await getInternalUserId(supabase as never)
    if (userError || !userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Get user's group IDs first
    const { data: groups } = await admin
      .from('channel_groups')
      .select('id')
      .eq('user_id', userId)

    const groupIds = (groups as { id: string }[] | null)?.map(g => g.id) || []

    if (groupIds.length === 0) {
      return NextResponse.json({
        success: true,
        deletedCount: 0,
        message: 'No groups to delete',
      })
    }

    // Delete group_channels associations first (foreign key constraint)
    const { error: gcError } = await admin
      .from('group_channels')
      .delete()
      .in('group_id', groupIds)

    if (gcError) {
      console.error('[DeleteGroups] Failed to delete group_channels:', gcError)
      return NextResponse.json({ error: 'Failed to delete group associations' }, { status: 500 })
    }

    // Delete the groups themselves
    const { error: groupError } = await admin
      .from('channel_groups')
      .delete()
      .eq('user_id', userId)

    if (groupError) {
      console.error('[DeleteGroups] Failed to delete groups:', groupError)
      return NextResponse.json({ error: 'Failed to delete groups' }, { status: 500 })
    }

    // Also clean up user_subscriptions
    const { error: subError } = await admin
      .from('user_subscriptions')
      .delete()
      .eq('user_id', userId)

    if (subError) {
      console.error('[DeleteGroups] Failed to delete user_subscriptions:', subError)
      // Non-fatal, continue
    }

    return NextResponse.json({
      success: true,
      deletedCount: groupIds.length,
      message: `Deleted ${groupIds.length} groups`,
    })
  } catch (error) {
    console.error('[DeleteGroups] Unexpected error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
