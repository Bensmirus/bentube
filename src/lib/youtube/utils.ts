/**
 * YouTube API utilities: retry logic, rate limiting, and error handling
 */

// ============================================================================
// Error Types and Handling
// ============================================================================

export type YouTubeErrorCode =
  | 'QUOTA_EXCEEDED'
  | 'RATE_LIMITED'
  | 'UNAUTHORIZED'
  | 'NOT_FOUND'
  | 'PRIVATE_OR_DELETED'
  | 'NETWORK_ERROR'
  | 'UNKNOWN'

export type YouTubeError = {
  code: YouTubeErrorCode
  message: string
  retryable: boolean
  httpStatus?: number
  originalError?: unknown
}

/**
 * Parse YouTube API errors into user-friendly format
 */
export function parseYouTubeError(error: unknown): YouTubeError {
  // Type guard for Google API errors
  const apiError = error as {
    response?: {
      status?: number
      data?: {
        error?: {
          code?: number
          message?: string
          errors?: { reason?: string; domain?: string }[]
        }
      }
    }
    code?: string
    message?: string
  }

  const status = apiError.response?.status
  const googleError = apiError.response?.data?.error
  const errorReason = googleError?.errors?.[0]?.reason

  // Quota exceeded
  if (status === 403 && (errorReason === 'quotaExceeded' || googleError?.message?.includes('quota'))) {
    return {
      code: 'QUOTA_EXCEEDED',
      message: 'YouTube API quota exhausted for today. Try again after midnight UTC.',
      retryable: false,
      httpStatus: 403,
      originalError: error,
    }
  }

  // Rate limited
  if (status === 429 || errorReason === 'rateLimitExceeded' || errorReason === 'userRateLimitExceeded') {
    return {
      code: 'RATE_LIMITED',
      message: 'Too many requests. Slowing down...',
      retryable: true,
      httpStatus: 429,
      originalError: error,
    }
  }

  // Unauthorized / token issues
  if (status === 401 || status === 403) {
    if (errorReason === 'authError' || googleError?.message?.includes('auth')) {
      return {
        code: 'UNAUTHORIZED',
        message: 'YouTube connection expired. Please reconnect your account.',
        retryable: false,
        httpStatus: status,
        originalError: error,
      }
    }
  }

  // Not found (deleted channel, private video, etc.)
  if (status === 404 || errorReason === 'playlistNotFound' || errorReason === 'channelNotFound') {
    return {
      code: 'NOT_FOUND',
      message: 'Channel or playlist not found. It may have been deleted.',
      retryable: false,
      httpStatus: 404,
      originalError: error,
    }
  }

  // Private or deleted content
  if (errorReason === 'playlistItemNotFound' || errorReason === 'videoNotFound') {
    return {
      code: 'PRIVATE_OR_DELETED',
      message: 'Some content is private or has been removed.',
      retryable: false,
      httpStatus: status,
      originalError: error,
    }
  }

  // Network errors
  if (apiError.code === 'ECONNRESET' || apiError.code === 'ETIMEDOUT' || apiError.code === 'ENOTFOUND') {
    return {
      code: 'NETWORK_ERROR',
      message: 'Network error. Check your connection and try again.',
      retryable: true,
      originalError: error,
    }
  }

  // Unknown error
  return {
    code: 'UNKNOWN',
    message: googleError?.message || apiError.message || 'An unexpected error occurred.',
    retryable: true,
    httpStatus: status,
    originalError: error,
  }
}

// ============================================================================
// Retry Logic with Exponential Backoff
// ============================================================================

export type RetryOptions = {
  maxRetries?: number
  initialDelayMs?: number
  maxDelayMs?: number
  backoffMultiplier?: number
  onRetry?: (attempt: number, error: YouTubeError, delayMs: number) => void
}

const DEFAULT_RETRY_OPTIONS: Required<Omit<RetryOptions, 'onRetry'>> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
}

/**
 * Execute a function with retry logic and exponential backoff
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options }
  let lastError: YouTubeError | null = null
  let delay = opts.initialDelayMs

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = parseYouTubeError(error)

      // Don't retry non-retryable errors
      if (!lastError.retryable || attempt > opts.maxRetries) {
        throw lastError
      }

      // Calculate delay with jitter
      const jitter = Math.random() * 0.3 * delay // 0-30% jitter
      const actualDelay = Math.min(delay + jitter, opts.maxDelayMs)

      if (opts.onRetry) {
        opts.onRetry(attempt, lastError, actualDelay)
      }

      // Wait before retry
      await sleep(actualDelay)

      // Increase delay for next attempt
      delay = Math.min(delay * opts.backoffMultiplier, opts.maxDelayMs)
    }
  }

  // Should never reach here, but TypeScript needs it
  throw lastError || new Error('Retry failed')
}

// ============================================================================
// Rate Limiting
// ============================================================================

type RateLimiterOptions = {
  requestsPerSecond?: number
  burstSize?: number
}

/**
 * Simple token bucket rate limiter
 */
export class RateLimiter {
  private tokens: number
  private lastRefill: number
  private readonly maxTokens: number
  private readonly refillRate: number // tokens per ms

  constructor(options: RateLimiterOptions = {}) {
    const requestsPerSecond = options.requestsPerSecond ?? 10
    this.maxTokens = options.burstSize ?? requestsPerSecond
    this.tokens = this.maxTokens
    this.lastRefill = Date.now()
    this.refillRate = requestsPerSecond / 1000
  }

  private refillTokens(): void {
    const now = Date.now()
    const elapsed = now - this.lastRefill
    const newTokens = elapsed * this.refillRate
    this.tokens = Math.min(this.maxTokens, this.tokens + newTokens)
    this.lastRefill = now
  }

  /**
   * Wait until a token is available, then consume it
   */
  async acquire(): Promise<void> {
    this.refillTokens()

    if (this.tokens >= 1) {
      this.tokens -= 1
      return
    }

    // Calculate wait time for next token
    const waitTime = Math.ceil((1 - this.tokens) / this.refillRate)
    await sleep(waitTime)

    this.refillTokens()
    this.tokens -= 1
  }

  /**
   * Check if a token is available without consuming
   */
  canAcquire(): boolean {
    this.refillTokens()
    return this.tokens >= 1
  }
}

// Global rate limiter for YouTube API (10 requests/second is safe)
let globalRateLimiter: RateLimiter | null = null

export function getGlobalRateLimiter(): RateLimiter {
  if (!globalRateLimiter) {
    globalRateLimiter = new RateLimiter({ requestsPerSecond: 10, burstSize: 15 })
  }
  return globalRateLimiter
}

/**
 * Execute a function with rate limiting
 */
export async function withRateLimit<T>(fn: () => Promise<T>): Promise<T> {
  const limiter = getGlobalRateLimiter()
  await limiter.acquire()
  return fn()
}

// ============================================================================
// Combined: Rate-limited retry
// ============================================================================

/**
 * Execute a function with both rate limiting and retry logic
 */
export async function withRateLimitAndRetry<T>(
  fn: () => Promise<T>,
  retryOptions?: RetryOptions
): Promise<T> {
  return withRetry(async () => {
    await getGlobalRateLimiter().acquire()
    return fn()
  }, retryOptions)
}

// ============================================================================
// Helpers
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Batch processor with rate limiting
 * Processes items in batches with delays between batches
 */
export async function processBatches<T, R>(
  items: T[],
  batchSize: number,
  processor: (batch: T[]) => Promise<R>,
  options?: {
    delayBetweenBatches?: number
    onBatchComplete?: (batchIndex: number, result: R) => void
  }
): Promise<R[]> {
  const results: R[] = []
  const delayMs = options?.delayBetweenBatches ?? 100

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const batchIndex = Math.floor(i / batchSize)

    const result = await processor(batch)
    results.push(result)

    if (options?.onBatchComplete) {
      options.onBatchComplete(batchIndex, result)
    }

    // Delay between batches (except for last batch)
    if (i + batchSize < items.length) {
      await sleep(delayMs)
    }
  }

  return results
}
