import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

const supabase = createClient(supabaseUrl, supabaseKey)

async function checkSchema() {
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
      console.log('\n📝 To fix: Run this migration in Supabase SQL Editor:')
      console.log('   File: supabase/migrations/00019_video_import_limit.sql\n')
    } else {
      console.log('❌ Error checking schema:', error)
    }
  } else {
    console.log('✅ video_import_limit column EXISTS')
    console.log('   Schema is up to date\n')
  }

  // Check sync_progress table
  const { error: syncError } = await supabase
    .from('sync_progress')
    .select('id')
    .limit(1)

  if (syncError) {
    console.log('⚠️  sync_progress table issue:', syncError.message)
  } else {
    console.log('✅ sync_progress table EXISTS')
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
}

checkSchema().catch(console.error)
