import { randomBytes, createHash, timingSafeEqual } from 'crypto'
import { createAdminClient } from '@/lib/supabase/admin'

const API_KEY_PREFIX = 'bt_'

/**
 * Generate a new API key with the bt_ prefix
 * Returns the plaintext key (show to user once) and the hash (store in DB)
 */
export function generateApiKey(): { plaintext: string; hash: string } {
  // Generate 32 random bytes = 64 hex characters
  const randomPart = randomBytes(32).toString('hex')
  const plaintext = `${API_KEY_PREFIX}${randomPart}`
  const hash = hashApiKey(plaintext)

  return { plaintext, hash }
}

/**
 * Hash an API key for storage
 * Uses SHA-256 which is fast enough for API key validation
 */
export function hashApiKey(plaintext: string): string {
  return createHash('sha256').update(plaintext).digest('hex')
}

/**
 * Validate an API key and return the user ID if valid
 * Returns null if invalid or not found
 */
export async function validateApiKey(authHeader: string): Promise<string | null> {
  // Extract the key from "Bearer bt_xxx"
  if (!authHeader.startsWith('Bearer ')) {
    return null
  }

  const apiKey = authHeader.slice(7) // Remove "Bearer "

  if (!apiKey.startsWith(API_KEY_PREFIX)) {
    return null
  }

  // Hash the provided key
  const providedHash = hashApiKey(apiKey)

  // Look up user with matching hash
  const admin = createAdminClient()
  const { data: userData, error } = await admin
    .from('users')
    .select('id, api_key_hash')
    .eq('api_key_hash', providedHash)
    .single()

  const user = userData as { id: string; api_key_hash: string | null } | null

  if (error || !user || !user.api_key_hash) {
    return null
  }

  // Use timing-safe comparison to prevent timing attacks
  const storedHashBuffer = Buffer.from(user.api_key_hash, 'hex')
  const providedHashBuffer = Buffer.from(providedHash, 'hex')

  if (storedHashBuffer.length !== providedHashBuffer.length) {
    return null
  }

  if (!timingSafeEqual(storedHashBuffer, providedHashBuffer)) {
    return null
  }

  return user.id
}

/**
 * Check if a user has an API key configured
 */
export async function hasApiKey(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { data: userData } = await admin
    .from('users')
    .select('api_key_hash')
    .eq('auth_user_id', userId)
    .single()

  const user = userData as { api_key_hash: string | null } | null
  return !!(user?.api_key_hash)
}

/**
 * Save an API key hash for a user (replaces existing)
 */
export async function saveApiKeyHash(userId: string, hash: string): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ api_key_hash: hash } as never)
    .eq('auth_user_id', userId)

  return !error
}

/**
 * Revoke a user's API key
 */
export async function revokeApiKey(userId: string): Promise<boolean> {
  const admin = createAdminClient()
  const { error } = await admin
    .from('users')
    .update({ api_key_hash: null } as never)
    .eq('auth_user_id', userId)

  return !error
}
