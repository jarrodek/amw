/**
 * Default Service Worker script path.
 */
export const DEFAULT_SW_PATH = '/amw-sw.js'

/**
 * Default Service Worker scope.
 */
export const DEFAULT_SW_SCOPE = '/'

/**
 * Default response status code.
 */
export const DEFAULT_STATUS = 200

/**
 * Default lifetime for routes (infinite).
 */
export const DEFAULT_LIFETIME = Infinity

/**
 * Default strategy for routes.
 */
export const DEFAULT_STRATEGY = 'mock' as const

/**
 * Timeout for waiting for SW to be ready (ms).
 */
export const SW_READY_TIMEOUT = 10000

/**
 * Timeout for message responses (ms).
 */
export const MESSAGE_TIMEOUT = 5000
