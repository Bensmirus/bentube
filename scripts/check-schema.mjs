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

console.log('🔍 Checking database schema...\n')

// Check if video_import_limit column exists
const { data, error } = await supabase
  .from('users')
  .select('video_import_limit')
  .limit(1)

if (error) {
  if (error.message?.includes('video_import_limit') || error.code === '42703') {
    console.log('❌ video_import_limit column DOES NOT EXIST')
    console.log('   Migration 00019_video_import_limit.sql needs to be applied')
    console.log('\n📝 To fix:')
    console.log('   1. Open Supabase Dashboard SQL Editor')
    console.log('   2. Copy contents of: supabase/migrations/00019_video_import_limit.sql')
    console.log('   3. Run the migration\n')
  } else {
    console.log('❌ Error checking schema:', error.message)
  }
} else {
  console.log('✅ video_import_limit column EXISTS')
  console.log('   Current value for first user:', data[0]?.video_import_limit || 'not set')
}

// Check sync_progress table
const { error: syncError } = await supabase
  .from('sync_progress')
  .select('id')
  .limit(1)

if (syncError) {
  console.log('\n⚠️  sync_progress table issue:', syncError.message)
} else {
  console.log('\n✅ sync_progress table EXISTS')
}

// Check sync_locks table
const { error: lockError } = await supabase
  .from('sync_locks')
  .select('id')
  .limit(1)

if (lockError) {
  console.log('⚠️  sync_locks table issue:', lockError.message)
} else {
  console.log('✅ sync_locks table EXISTS')
}

console.log('\n✨ Schema check complete')
