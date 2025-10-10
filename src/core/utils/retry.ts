/**
 * Retry a promise-returning function up to `retries` additional times.
 * Retries occur immediately; callers can wrap with delay/backoff if needed.
 */
export async function withRetry<T>(
  fn: () => Promise<T> | T,
  retries = 0,
): Promise<T> {
  let attempt = 0
  let lastError: unknown
  const maxAttempts = Math.max(0, retries) + 1

  while (attempt < maxAttempts) {
    try {
      // Await handles both sync and async results.
      return await fn()
    } catch (error) {
      lastError = error
      attempt += 1
      if (attempt >= maxAttempts) break
    }
  }

  throw lastError
}
