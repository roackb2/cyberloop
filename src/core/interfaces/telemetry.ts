/**
 * Logger interface compatible with pino and other structured loggers.
 * Supports both simple string messages and structured logging with objects.
 */
export interface Logger {
  /**
   * Log at 'trace' level (most verbose)
   */
  trace: LogFn
  
  /**
   * Log at 'debug' level
   */
  debug: LogFn
  
  /**
   * Log at 'info' level
   */
  info: LogFn
  
  /**
   * Log at 'warn' level
   */
  warn: LogFn
  
  /**
   * Log at 'error' level
   */
  error: LogFn
  
  /**
   * Log at 'fatal' level (most severe)
   */
  fatal: LogFn
  
  /**
   * Create a child logger with additional bindings
   */
  child?(bindings: Record<string, unknown>): Logger
}

/**
 * Log function signature compatible with pino.
 * Supports multiple call patterns:
 * - log(msg)
 * - log(obj, msg)
 * - log(msg, ...args) for formatting
 * - log(obj, msg, ...args)
 */
export interface LogFn {
  // Simple message
  (msg: string): void
  // Object with message
  <T = Record<string, unknown>>(obj: T, msg?: string): void
  // Message with format args
  (msg: string, ...args: unknown[]): void
  // Object with message and format args
  <T = Record<string, unknown>>(obj: T, msg: string, ...args: unknown[]): void
}
