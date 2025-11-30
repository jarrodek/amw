import type { InterceptMatcher, SerializedRequest, ResponseData, InterceptOptions } from './index.js'

/**
 * Message types for SW <-> Main Thread communication.
 */
export enum MessageType {
  /** Register a new route in the Service Worker */
  REGISTER_ROUTE = 'REGISTER_ROUTE',

  /** Remove a specific route */
  REMOVE_ROUTE = 'REMOVE_ROUTE',

  /** Remove routes by matcher */
  REMOVE_ROUTES_BY_MATCHER = 'REMOVE_ROUTES_BY_MATCHER',

  /** Reset all routes */
  RESET_ROUTES = 'RESET_ROUTES',

  /** Execute a matched route on Main Thread */
  EXECUTE_ROUTE = 'EXECUTE_ROUTE',

  /** Response from Main Thread after route execution */
  ROUTE_RESPONSE = 'ROUTE_RESPONSE',

  /** Acknowledgment message */
  ACK = 'ACK',

  /** Error message */
  ERROR = 'ERROR',
}

/**
 * Base message structure.
 */
export interface BaseMessage {
  type: MessageType
}

/**
 * Message to register a new route in SW.
 */
export interface RegisterRouteMessage extends BaseMessage {
  type: MessageType.REGISTER_ROUTE
  payload: {
    id: string
    matcher: InterceptMatcher
    options: InterceptOptions
    base?: string
  }
}

/**
 * Message to remove a specific route.
 */
export interface RemoveRouteMessage extends BaseMessage {
  type: MessageType.REMOVE_ROUTE
  payload: {
    uri: string
  }
}

/**
 * Message to remove routes by matcher.
 */
export interface RemoveRoutesByMatcherMessage extends BaseMessage {
  type: MessageType.REMOVE_ROUTES_BY_MATCHER
  payload: {
    matcher: InterceptMatcher
  }
}

/**
 * Message to reset all routes.
 */
export interface ResetRoutesMessage extends BaseMessage {
  type: MessageType.RESET_ROUTES
}

/**
 * Message to execute a route on Main Thread.
 */
export interface ExecuteRouteMessage extends BaseMessage {
  type: MessageType.EXECUTE_ROUTE
  payload: {
    routeId: string
    request: SerializedRequest
  }
}

/**
 * Response message from Main Thread.
 */
export interface RouteResponseMessage extends BaseMessage {
  type: MessageType.ROUTE_RESPONSE
  payload: ResponseData
}

/**
 * Acknowledgment message.
 */
export interface AckMessage extends BaseMessage {
  type: MessageType.ACK
}

/**
 * Error message.
 */
export interface ErrorMessage extends BaseMessage {
  type: MessageType.ERROR
  payload: {
    message: string
  }
}

/**
 * Union of all message types.
 */
export type Message =
  | RegisterRouteMessage
  | RemoveRouteMessage
  | RemoveRoutesByMatcherMessage
  | ResetRoutesMessage
  | ExecuteRouteMessage
  | RouteResponseMessage
  | AckMessage
  | ErrorMessage
