/**
 * AMW - API Mocking for Web
 * Main entry point for the library
 */

// Main exports
export { setupWorker } from './main/setupWorker.js'

// Type exports
export type {
  MockHandler,
  InterceptHandler,
  InterceptMatcher,
  InterceptOptions,
  ResponseGenerator,
  SerializedRequest,
  SetupWorkerOptions,
  ResponseData,
  RouteDefinition,
} from './types/index.js'

export type {
  Message,
  RegisterRouteMessage,
  RemoveRouteMessage,
  RemoveRoutesByMatcherMessage,
  ResetRoutesMessage,
  ExecuteRouteMessage,
  RouteResponseMessage,
  AckMessage,
  ErrorMessage,
} from './types/messages.js'

export { MessageType } from './types/messages.js'
