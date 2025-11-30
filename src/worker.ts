/**
 * Worker exports for custom Service Worker implementations.
 * Import this in your custom SW file to extend MockServiceWorker.
 */

export { MockServiceWorker } from './worker/MockServiceWorker.js'
export { RouteStore } from './worker/RouteStore.js'
export { RouteMatcher } from './worker/RouteMatcher.js'

// Re-export types needed for custom implementations
export type { RouteDefinition } from './types/index.js'
export type { Message } from './types/messages.js'
export { MessageType } from './types/messages.js'
