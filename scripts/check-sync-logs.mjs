import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load env vars
const envContent = readFileSync('.env.local', 'utf-8')
const envVars = {}
envContent.split('\n').forEach(line => {
  const match = line.match(/^([^#=]+)=(.*)$/)
  if (match) {
    envVars[match[1].trim()] = match[2].trim()
  }
})

const supabaseUrl = envVars.NEXT_PUBLIC_SUPABASE_URL
const supabaseKey = envVars.SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(supabaseUrl, supabaseKey)

console.log('🔍 Checking recent sync activity...\n')

// Check sync_progress table for recent syncs
const { data: syncProgress, error: spError } = await supabase
  .from('sync_progress')
  .select('*')
  .order('updated_at', { ascending: false })
  .limit(5)

if (spError) {
  console.log('❌ Error fetching sync progress:', spError.message)
} else if (!syncProgress || syncProgress.length === 0) {
  console.log('⚠️  No sync progress records found')
  console.log('   This is normal if you haven\'t synced recently\n')
} else {
  console.log(`📊 Last ${syncProgress.length} sync attempts:\n`)
  syncProgress.forEach((sync, i) => {
    const progress = sync.progress
    const status = progress.phase === 'complete' ? '✅' :
                   progress.phase === 'error' ? '❌' :
                   '🔄'

    console.log(`${status} Sync ${i + 1}:`)
    console.log(`   Phase: ${progress.phase}`)
    console.log(`   Message: ${progress.message}`)
    console.log(`   Updated: ${new Date(progress.updatedAt).toLocaleString()}`)

    if (progress.stats) {
      console.log(`   Stats:`)
      console.log(`     - Channels processed: ${progress.stats.channelsProcessed}`)
      console.log(`     - Channels failed: ${progress.stats.channelsFailed}`)
      console.log(`     - Videos added: ${progress.stats.videosAdded}`)
    }

    if (progress.errors && progress.errors.length > 0) {
      console.log(`   Errors: ${progress.errors.length}`)
      progress.errors.slice(0, 3).forEach(err => {
        console.log(`     - ${err.channelName || 'Unknown'}: ${err.message}`)
      })
    }
    console.log()
  })
}

// Check sync_locks table for stuck locks
const { data: locks, error: lockError } = await supabase
  .from('sync_locks')
  .select('*')

if (lockError) {
  console.log('⚠️  Error checking locks:', lockError.message)
} else if (locks && locks.length > 0) {
  console.log('🔒 Active sync locks found:')
  locks.forEach(lock => {
    const expiresAt = new Date(lock.expires_at)
    const isExpired = expiresAt < new Date()
    console.log(`   User ID: ${lock.user_id}`)
    console.log(`   Locked at: ${new Date(lock.locked_at).toLocaleString()}`)
    console.log(`   Expires at: ${expiresAt.toLocaleString()}`)
    console.log(`   Status: ${isExpired ? '⚠️  EXPIRED (stuck lock!)' : '✅ Active'}`)
    if (lock.cancelled) {
      console.log(`   Cancelled: Yes`)
    }
  })
  console.log()
} else {
  console.log('✅ No active sync locks (no syncs in progress)\n')
}

console.log('✨ Check complete')
