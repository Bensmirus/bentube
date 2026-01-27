import { updateChannelActivityLevels } from '@/lib/youtube/channel-health'
import { validateCronAuth } from '@/lib/youtube/cron-handler'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const authResult = validateCronAuth(authHeader, process.env.CRON_SECRET)

  if (!authResult.valid) {
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? 'Too many failed attempts' : 'Unauthorized'
    return NextResponse.json({ error }, { status })
  }

  try {
    const stats = await updateChannelActivityLevels()

    return NextResponse.json({
      success: true,
      ...stats,
    })
  } catch (error) {
    console.error('Activity level update error:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
