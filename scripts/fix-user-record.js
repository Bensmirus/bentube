/**
 * Fix user record to add video_limit column default value
 */

const { createClient } = require('@supabase/supabase-js')

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('Missing Supabase credentials')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey)

async function fixUserRecords() {
  console.log('Checking user records...')

  // Get all users without video_limit set
  const { data: users, error } = await supabase
    .from('users')
    .select('id, email, video_limit')
    .is('video_limit', null)

  if (error) {
    console.error('Error fetching users:', error)
    return
  }

  if (!users || users.length === 0) {
    console.log('All user records are already configured!')
    return
  }

  console.log(`Found ${users.length} users needing video_limit update`)

  // Update all users to have default video_limit of 100
  for (const user of users) {
    console.log(`Updating user ${user.email}...`)

    const { error: updateError } = await supabase
      .from('users')
      .update({ video_limit: 100 })
      .eq('id', user.id)

    if (updateError) {
      console.error(`Failed to update user ${user.email}:`, updateError)
    } else {
      console.log(`✓ Updated ${user.email}`)
    }
  }

  console.log('Done!')
}

fixUserRecords()
