#!/usr/bin/env node

/**
 * Environment Variable Validation Script
 *
 * Validates that all required environment variables are set before starting the dev server.
 * This catches configuration issues early and provides clear error messages.
 */

// Load environment variables from .env.local
const fs = require('fs')
const path = require('path')

const envPath = path.join(__dirname, '..', '.env.local')
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf-8')
  envContent.split('\n').forEach(line => {
    const trimmed = line.trim()
    if (trimmed && !trimmed.startsWith('#')) {
      const [key, ...valueParts] = trimmed.split('=')
      if (key && valueParts.length > 0) {
        const value = valueParts.join('=').trim()
        process.env[key.trim()] = value
      }
    }
  })
}

const requiredVars = {
  'NEXT_PUBLIC_SUPABASE_URL': 'Supabase project URL (from Supabase dashboard)',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY': 'Supabase anon/public key (from Supabase dashboard)',
  'SUPABASE_SERVICE_ROLE_KEY': 'Supabase service role key (from Supabase dashboard)',
  'GOOGLE_CLIENT_ID': 'Google OAuth client ID (from Google Cloud Console)',
  'GOOGLE_CLIENT_SECRET': 'Google OAuth client secret (from Google Cloud Console)',
  'NEXT_PUBLIC_APP_URL': 'App URL (http://localhost:3002 for development)',
  'CRON_SECRET': 'Secret for cron job authentication (generate with: openssl rand -hex 16)',
}

const optionalVars = {
  'YOUTUBE_API_KEY': 'YouTube API key - NOT CURRENTLY USED (OAuth tokens used instead)',
  'SENTRY_DSN': 'Sentry error tracking DSN (for production monitoring)',
  'DISCORD_WEBHOOK_URL': 'Discord webhook URL (for sync alerts and notifications)',
}

let hasErrors = false
let hasWarnings = false

console.log('🔍 Validating environment variables...\n')

// Check required vars
console.log('📋 Required variables:')
for (const [key, description] of Object.entries(requiredVars)) {
  if (!process.env[key]) {
    console.error(`❌ MISSING: ${key}`)
    console.error(`   📝 ${description}\n`)
    hasErrors = true
  } else if (process.env[key].includes('your-') || process.env[key].includes('change-in-production')) {
    console.warn(`⚠️  PLACEHOLDER: ${key}`)
    console.warn(`   📝 ${description}`)
    console.warn(`   Current value looks like a placeholder. Make sure to replace it.\n`)
    hasWarnings = true
  } else {
    console.log(`✅ ${key}`)
  }
}

// Show optional vars status
console.log('\n📋 Optional variables:')
for (const [key, description] of Object.entries(optionalVars)) {
  if (process.env[key]) {
    console.log(`✅ ${key} (configured)`)
  } else {
    console.log(`⚪ ${key} (not set)`)
    console.log(`   📝 ${description}`)
  }
}

console.log('\n' + '='.repeat(60))

if (hasErrors) {
  console.error('\n❌ Environment validation FAILED\n')
  console.error('Missing required environment variables.')
  console.error('Please check your .env.local file and compare with .env.example\n')
  console.error('Steps to fix:')
  console.error('  1. Copy .env.example to .env.local')
  console.error('  2. Fill in all required values')
  console.error('  3. See README.md for detailed setup instructions\n')
  process.exit(1)
}

if (hasWarnings) {
  console.warn('\n⚠️  Environment validation passed with WARNINGS\n')
  console.warn('Some variables appear to have placeholder values.')
  console.warn('The app may not work correctly until these are replaced.\n')
  // Don't exit - warnings are non-fatal
} else {
  console.log('\n✅ Environment validation PASSED\n')
  console.log('All required variables are configured correctly.\n')
}
