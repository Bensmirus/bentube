import { createServerSupabaseClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { NextResponse } from 'next/server'

const ADMIN_EMAIL = 'bensmir.hbs@gmail.com'

async function isAdmin(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  return user?.email === ADMIN_EMAIL
}

/**
 * GET: List all users with their stats (admin only)
 */
export async function GET() {
  try {
    const supabase = await createServerSupabaseClient()

    if (!await isAdmin(supabase)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
    }

    const admin = createAdminClient()

    // Get all users with video and channel counts in one query
    const { data, error } = await admin.rpc('admin_get_user_stats')

    if (error) {
      // If the RPC doesn't exist yet, fall back to manual queries
      console.error('RPC error, falling back to manual queries:', error)

      const { data: users, error: usersError } = await admin
        .from('users')
        .select('id, email, created_at, is_free_tier, subscription_status')
        .order('created_at', { ascending: false })

      if (usersError || !users) {
        return NextResponse.json({ error: 'Failed to fetch users' }, { status: 500 })
      }

      type UserRow = {
        id: string
        email: string
        created_at: string
        is_free_tier: boolean | null
        subscription_status: string | null
      }

      // Get counts for each user
      const usersWithStats = await Promise.all(
        (users as UserRow[]).map(async (user) => {
          const [videoResult, channelResult] = await Promise.all([
            admin.from('videos').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
            admin.from('user_channels').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          ])

          const videoCount = videoResult.count || 0
          // ~5KB per video (row + indexes + watch_status)
          const estimatedSizeMB = Math.round((videoCount * 5) / 1024 * 10) / 10

          return {
            id: user.id,
            email: user.email,
            created_at: user.created_at,
            is_free_tier: user.is_free_tier,
            subscription_status: user.subscription_status || 'none',
            video_count: videoCount,
            channel_count: channelResult.count || 0,
            estimated_size_mb: estimatedSizeMB,
          }
        })
      )

      return NextResponse.json({ users: usersWithStats })
    }

    return NextResponse.json({ users: data })
  } catch (error) {
    console.error('Admin users fetch error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
