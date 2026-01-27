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

console.log('🧪 Testing Sync Progress API...\n')

// Get user ID
const { data: users } = await supabase.from('users').select('id').limit(1)
if (!users || users.length === 0) {
  console.log('❌ No users found')
  process.exit(1)
}

const userId = users[0].id
console.log(`✅ Testing with user: ${userId}\n`)

// Check if there's an active sync
const { data: progress } = await supabase
  .from('sync_progress')
  .select('*')
  .eq('user_id', userId)
  .order('updated_at', { ascending: false })
  .limit(1)
  .single()

if (!progress) {
  console.log('ℹ️  No sync progress found - sync has not been run yet')
  console.log('\nTo test the feature:')
  console.log('  1. Open http://localhost:3002/settings in browser')
  console.log('  2. Click "Sync YouTube" button')
  console.log('  3. You should see:')
  console.log('     - Current channel name')
  console.log('     - Progress: X/Y channels (Z%)')
  console.log('     - Progress bar filling up')
  console.log('     - Videos imported count')
  console.log('     - ETA in minutes\n')
  console.log('  4. Open Groups tab - should see progress banner at top\n')
} else {
  console.log('✅ Found sync progress record:')
  const prog = progress.progress
  console.log(`   Phase: ${prog.phase}`)
  console.log(`   Current: ${prog.current}/${prog.total} channels`)
  if (prog.currentItem) {
    console.log(`   Current channel: ${prog.currentItem}`)
  }
  console.log(`   Videos added: ${prog.stats.videosAdded}`)
  console.log(`   Channels processed: ${prog.stats.channelsProcessed}`)

  if (prog.phase === 'syncing_videos' && prog.stats.channelsProcessed >= 3) {
    const now = new Date()
    const startTime = new Date(prog.startedAt)
    const elapsedSeconds = (now - startTime) / 1000
    const avgPerChannel = elapsedSeconds / prog.stats.channelsProcessed
    const remaining = prog.total - prog.current
    const etaSeconds = Math.ceil(avgPerChannel * remaining * 1.1)

    console.log(`\n📊 ETA Calculation:`)
    console.log(`   Elapsed: ${Math.floor(elapsedSeconds)} seconds`)
    console.log(`   Avg per channel: ${Math.floor(avgPerChannel)} seconds`)
    console.log(`   Estimated remaining: ${Math.floor(etaSeconds / 60)} minutes`)
  }
}

console.log('\n✨ Test complete')
console.log('\n🌐 Open these URLs to test:')
console.log('   Settings: http://localhost:3002/settings')
console.log('   Groups:   http://localhost:3002/groups')
