const { createClient } = require('@supabase/supabase-js')

const supabase = createClient(
  'https://tvunyekzzsoujotjjhgp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dW55ZWt6enNvdWpvdGpqaGdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODczODU1NiwiZXhwIjoyMDg0MzE0NTU2fQ.Fn4Om9cOQaYuTT9Vd-cD4SKJAi-9SO4LL7ce85LI4nI'
)

async function checkUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*')

  if (error) {
    console.error('Error:', error)
    return
  }

  console.log('Users in database:', data ? data.length : 0)
  if (data && data.length > 0) {
    data.forEach(user => {
      console.log('\nUser:')
      console.log('  ID:', user.id)
      console.log('  Email:', user.email)
      console.log('  video_limit:', user.video_limit)
      console.log('  video_import_limit:', user.video_import_limit)
    })
  } else {
    console.log('No users found in database!')
  }
}

checkUsers()
