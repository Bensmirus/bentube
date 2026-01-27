const { createClient } = require('@supabase/supabase-js')
const fs = require('fs')
const path = require('path')

const supabase = createClient(
  'https://tvunyekzzsoujotjjhgp.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InR2dW55ZWt6enNvdWpvdGpqaGdwIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2ODczODU1NiwiZXhwIjoyMDg0MzE0NTU2fQ.Fn4Om9cOQaYuTT9Vd-cD4SKJAi-9SO4LL7ce85LI4nI'
)

async function applyMigration(filename) {
  console.log(`Applying migration: ${filename}`)

  const migrationPath = path.join(__dirname, '..', 'supabase', 'migrations', filename)
  const sql = fs.readFileSync(migrationPath, 'utf8')

  const { data, error } = await supabase.rpc('exec_sql', { sql_string: sql })

  if (error) {
    console.error('Migration failed:', error)
    // Try direct query if exec_sql doesn't exist
    console.log('Trying direct query...')
    const { error: directError } = await supabase.from('_').select('*').limit(0)
    console.log('Note: You need to apply this migration manually in Supabase Dashboard')
    console.log('Go to: SQL Editor and paste the migration file')
    return
  }

  console.log('Migration applied successfully!')
}

const migrationFile = process.argv[2] || '00030_fix_commit_sync_batching.sql'
applyMigration(migrationFile)
