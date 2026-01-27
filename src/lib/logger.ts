/**
 * Structured Logging System
 *
 * Provides consistent logging with levels, context, and better production readiness.
 * Replaces scattered console.log calls with a unified logging interface.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error'

export interface LogContext {
  userId?: string
  requestId?: string
  syncId?: string
  channelId?: string
  videoId?: string
  [key: string]: string | number | boolean | undefined | null
}

interface LogEntry {
  level: LogLevel
  message: string
  timestamp: string
  context?: LogContext
  error?: {
    message: string
    stack?: string
    name?: string
  }
}

/**
 * Format log entry for output
 */
function formatLog(entry: LogEntry): string {
  const { message } = entry

  // In development, use colorful console output
  if (process.env.NODE_ENV === 'development') {
    return message
  }

  // In production, use JSON format for log aggregation
  return JSON.stringify(entry)
}

/**
 * Structured logger with log levels and context
 */
export const logger = {
  /**
   * Debug logs - only shown in development
   */
  debug: (message: string, context?: LogContext) => {
    if (process.env.NODE_ENV === 'development') {
      const entry: LogEntry = {
        level: 'debug',
        message,
        timestamp: new Date().toISOString(),
        context,
      }
      console.debug(`[DEBUG] ${formatLog(entry)}`, context || '')
    }
  },

  /**
   * Info logs - general information
   */
  info: (message: string, context?: LogContext) => {
    const entry: LogEntry = {
      level: 'info',
      message,
      timestamp: new Date().toISOString(),
      context,
    }
    console.log(`[INFO] ${formatLog(entry)}`, context || '')
  },

  /**
   * Warning logs - something unexpected but not critical
   */
  warn: (message: string, context?: LogContext) => {
    const entry: LogEntry = {
      level: 'warn',
      message,
      timestamp: new Date().toISOString(),
      context,
    }
    console.warn(`[WARN] ${formatLog(entry)}`, context || '')
  },

  /**
   * Error logs - something went wrong
   */
  error: (message: string, error?: Error | unknown, context?: LogContext) => {
    const errorObj = error instanceof Error ? error : undefined
    const entry: LogEntry = {
      level: 'error',
      message,
      timestamp: new Date().toISOString(),
      context,
      error: errorObj
        ? {
            message: errorObj.message,
            stack: errorObj.stack,
            name: errorObj.name,
          }
        : undefined,
    }
    console.error(
      `[ERROR] ${formatLog(entry)}`,
      errorObj ? { error: errorObj.message, stack: errorObj.stack, ...context } : context || ''
    )
  },

  /**
   * Sync-specific logging helper
   */
  sync: {
    start: (userId: string, syncType: string) => {
      logger.info(`Sync started: ${syncType}`, { userId, syncType })
    },
    complete: (userId: string, syncType: string, stats?: Record<string, number>) => {
      logger.info(`Sync completed: ${syncType}`, { userId, syncType, ...stats })
    },
    error: (userId: string, syncType: string, error: Error) => {
      logger.error(`Sync failed: ${syncType}`, error, { userId, syncType })
    },
  },

  /**
   * Auth-specific logging helper
   */
  auth: {
    login: (userId: string) => {
      logger.info('User logged in', { userId })
    },
    logout: (userId: string) => {
      logger.info('User logged out', { userId })
    },
    error: (message: string, error?: Error) => {
      logger.error(`Auth error: ${message}`, error)
    },
  },

  /**
   * API-specific logging helper
   */
  api: {
    request: (method: string, path: string, userId?: string) => {
      logger.debug(`${method} ${path}`, { userId, method, path })
    },
    response: (method: string, path: string, status: number, duration?: number) => {
      logger.debug(`${method} ${path} - ${status}`, { method, path, status, duration })
    },
    error: (method: string, path: string, error: Error, userId?: string) => {
      logger.error(`${method} ${path} failed`, error, { userId, method, path })
    },
  },
}

/**
 * Legacy console wrapper for gradual migration
 * Use logger.* instead, but this prevents breaking existing console calls
 */
export const console = {
  log: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      logger.info(args[0], args[1] as LogContext)
    } else {
      // eslint-disable-next-line no-console
      console.log(...args)
    }
  },
  error: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      logger.error(args[0], args[1] instanceof Error ? args[1] : undefined)
    } else {
      // eslint-disable-next-line no-console
      console.error(...args)
    }
  },
  warn: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      logger.warn(args[0], args[1] as LogContext)
    } else {
      // eslint-disable-next-line no-console
      console.warn(...args)
    }
  },
  debug: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      logger.debug(args[0], args[1] as LogContext)
    } else {
      // eslint-disable-next-line no-console
      console.debug(...args)
    }
  },
  info: (...args: unknown[]) => {
    if (typeof args[0] === 'string') {
      logger.info(args[0], args[1] as LogContext)
    } else {
      // eslint-disable-next-line no-console
      console.info(...args)
    }
  },
}
