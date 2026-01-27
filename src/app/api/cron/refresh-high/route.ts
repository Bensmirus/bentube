import { runCronRefresh, validateCronAuth } from '@/lib/youtube/cron-handler'
import { NextRequest, NextResponse } from 'next/server'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const authResult = validateCronAuth(authHeader, process.env.CRON_SECRET)

  if (!authResult.valid) {
    // Return 429 for rate limiting, 401 for auth failure
    const status = authResult.rateLimited ? 429 : 401
    const error = authResult.rateLimited ? 'Too many failed attempts' : 'Unauthorized'
    return NextResponse.json({ error }, { status })
  }

  const result = await runCronRefresh('high')

  return NextResponse.json(result)
}
