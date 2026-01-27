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

console.log('🔧 Clearing stuck sync lock...\n')

// Delete all sync locks
const { error } = await supabase
  .from('sync_locks')
  .delete()
  .neq('id', '00000000-0000-0000-0000-000000000000') // Delete all

if (error) {
  console.log('❌ Error clearing lock:', error.message)
} else {
  console.log('✅ Stuck lock cleared successfully!')
  console.log('\nYou can now sync again. Try:')
  console.log('  1. Go to Settings tab')
  console.log('  2. Click "Sync YouTube" button')
  console.log('  3. It should work now!\n')
}
