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

console.log('🔍 Verifying Shorts Filtering...\n')

// Get user ID
const { data: users } = await supabase.from('users').select('id').limit(1)
if (!users || users.length === 0) {
  console.log('❌ No users found')
  process.exit(1)
}

const userId = users[0].id
console.log(`Testing with user: ${userId}\n`)

// Check 1: Are all videos populated with is_short field?
console.log('📊 Check 1: is_short field population\n')

const { count: totalVideos } = await supabase
  .from('videos')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)

const { count: nullShorts } = await supabase
  .from('videos')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .is('is_short', null)

const { count: trueShorts } = await supabase
  .from('videos')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('is_short', true)

const { count: falseShorts } = await supabase
  .from('videos')
  .select('id', { count: 'exact', head: true })
  .eq('user_id', userId)
  .eq('is_short', false)

console.log(`Total videos: ${totalVideos}`)
console.log(`  - is_short = null: ${nullShorts} ${nullShorts > 0 ? '⚠️  NEEDS FIX' : '✅'}`)
console.log(`  - is_short = true: ${trueShorts} (shorts)`)
console.log(`  - is_short = false: ${falseShorts} (regular videos)`)

if (nullShorts > 0) {
  console.log(`\n⚠️  WARNING: ${nullShorts} videos have null is_short field!`)
  console.log('   These may appear in feed incorrectly.')
  console.log('   To fix: UPDATE videos SET is_short = false WHERE is_short IS NULL;\n')
}

// Check 2: Sample shorts to verify detection
console.log('\n📊 Check 2: Sample shorts (verifying duration ≤60s)\n')

const { data: sampleShorts } = await supabase
  .from('videos')
  .select('youtube_id, title, duration_seconds, is_short')
  .eq('user_id', userId)
  .eq('is_short', true)
  .limit(5)

if (sampleShorts && sampleShorts.length > 0) {
  console.log('Sample shorts:')
  sampleShorts.forEach(v => {
    console.log(`  - ${v.title?.substring(0, 50)}... (${v.duration_seconds}s) ${v.duration_seconds <= 60 ? '✅' : '❌ WRONG'}`)
  })
} else {
  console.log('No shorts found in database')
}

// Check 3: Test get_feed() function
console.log('\n📊 Check 3: Testing get_feed() function\n')

try {
  const { data: feedWithShorts, error: err1 } = await supabase
    .rpc('get_feed', {
      p_user_id: userId,
      p_limit: 10,
      p_offset: 0,
      p_shorts_only: false,
      p_include_shorts: true // Include shorts
    })

  const { data: feedWithoutShorts, error: err2 } = await supabase
    .rpc('get_feed', {
      p_user_id: userId,
      p_limit: 10,
      p_offset: 0,
      p_shorts_only: false,
      p_include_shorts: false // Exclude shorts
    })

  if (err1 || err2) {
    console.log('❌ Error calling get_feed():', err1 || err2)
  } else {
    const shortsInInclude = feedWithShorts?.filter(v => v.is_short).length || 0
    const shortsInExclude = feedWithoutShorts?.filter(v => v.is_short).length || 0

    console.log(`Feed with include_shorts=true: ${feedWithShorts?.length || 0} videos`)
    console.log(`  - Shorts in feed: ${shortsInInclude}`)
    console.log(`Feed with include_shorts=false: ${feedWithoutShorts?.length || 0} videos`)
    console.log(`  - Shorts in feed: ${shortsInExclude} ${shortsInExclude === 0 ? '✅' : '❌ SHOULD BE 0'}`)

    if (shortsInExclude > 0) {
      console.log('\n❌ PROBLEM: Shorts are appearing in feed even with include_shorts=false!')
      console.log('   Check the get_feed() function filter logic.')
    } else {
      console.log('\n✅ Shorts filtering is working correctly!')
    }
  }
} catch (err) {
  console.log('❌ Error testing feed:', err.message)
}

// Check 4: Frontend endpoint test
console.log('\n📊 Check 4: Testing /api/feed endpoint\n')

try {
  const response = await fetch(`${envVars.NEXT_PUBLIC_APP_URL}/api/feed?limit=10`)
  if (response.ok) {
    const data = await response.json()
    const shortsInFeed = data.videos?.filter(v => v.is_short).length || 0
    console.log(`API /api/feed returned: ${data.videos?.length || 0} videos`)
    console.log(`  - Shorts in response: ${shortsInFeed} ${shortsInFeed === 0 ? '✅' : '❌ SHOULD BE 0'}`)

    if (shortsInFeed > 0) {
      console.log('\n❌ PROBLEM: API is returning shorts in main feed!')
      console.log('   The frontend is receiving shorts even though it shouldn\'t.')
    }
  } else {
    console.log(`❌ API error: ${response.status} ${response.statusText}`)
  }
} catch (err) {
  console.log('⚠️  Could not test API endpoint:', err.message)
  console.log('   (This is OK if dev server is not running)')
}

console.log('\n✨ Verification complete\n')
console.log('Summary:')
console.log(`  - Total videos: ${totalVideos}`)
console.log(`  - Shorts detected: ${trueShorts}`)
console.log(`  - Null is_short values: ${nullShorts} ${nullShorts === 0 ? '✅' : '⚠️'}`)
console.log(`  - Database filtering: Check results above`)
