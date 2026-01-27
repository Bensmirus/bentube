import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

// Load env vars manually
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

console.log('🔍 Checking YouTube authentication status...\n')

// Get all users
const { data: users, error } = await supabase
  .from('users')
  .select('id, email, youtube_access_token, youtube_token_expires_at')

if (error) {
  console.log('❌ Error fetching users:', error.message)
  process.exit(1)
}

if (!users || users.length === 0) {
  console.log('⚠️  No users found in database')
  console.log('   Have you logged in yet?\n')
  process.exit(0)
}

console.log(`Found ${users.length} user(s):\n`)

users.forEach((user, i) => {
  console.log(`👤 User ${i + 1}: ${user.email || 'No email'}`)

  if (!user.youtube_access_token) {
    console.log('   ❌ YouTube NOT connected')
    console.log('   📝 User needs to connect YouTube account\n')
  } else {
    console.log('   ✅ YouTube IS connected')

    if (user.youtube_token_expires_at) {
      const expiresAt = new Date(user.youtube_token_expires_at)
      const now = new Date()

      if (expiresAt > now) {
        const minutesLeft = Math.floor((expiresAt - now) / 1000 / 60)
        console.log(`   ⏰ Token expires in ${minutesLeft} minutes`)
      } else {
        console.log('   ⚠️  Token EXPIRED - needs refresh')
      }
    }
    console.log()
  }
})

// Check for subscriptions
const { count: subCount } = await supabase
  .from('user_subscriptions')
  .select('*', { count: 'exact', head: true })

console.log(`📊 Total subscriptions: ${subCount || 0}`)

// Check for videos
const { count: videoCount } = await supabase
  .from('videos')
  .select('*', { count: 'exact', head: true })

console.log(`🎥 Total videos: ${videoCount || 0}`)

// Check for groups
const { count: groupCount } = await supabase
  .from('channel_groups')
  .select('*', { count: 'exact', head: true })

console.log(`📁 Total groups: ${groupCount || 0}`)

console.log('\n✨ Check complete')
