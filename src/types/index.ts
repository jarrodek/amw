/**
 * Main controller for managing mock handlers.
 */
export interface MockHandler {
  /**
   * Registers a mock interceptor.
   * 1. Stores `respond` logic in Main Thread.
   * 2. Sends `match` config to Service Worker.
   */
  add(handler: InterceptHandler, options?: InterceptOptions): Promise<void>

  /**
   * Removes all handlers for a specific URI string.
   */
  release(uri: string): Promise<void>

  /**
   * Removes handlers based on a specific matcher configuration.
   */
  releaseMatch(matcher: InterceptMatcher): Promise<void>

  /**
   * Resets all handlers (SW and Main Thread).
   */
  reset(): Promise<void>

  /**
   * Unregisters SW and cleans up.
   */
  stop(): Promise<void>

  /**
   * Check if the worker is running.
   */
  isRunning(): Promise<boolean>
}

/**
 * Configuration for intercepting requests.
 */
export interface InterceptHandler {
  /** Matching criteria for requests */
  match: InterceptMatcher
  /** Response generation logic */
  respond: ResponseGenerator
}

/**
 * Criteria for matching requests.
 */
export interface InterceptMatcher {
  /**
   * URLPattern string (e.g., '/users/:id')
   */
  uri: string

  /**
   * HTTP Methods. If undefined/empty, matches ALL methods.
   */
  methods?: string[]

  /**
   * Headers to require. Keys are case-insensitive.
   */
  headers?: Record<string, string>
}

/**
 * Options for configuring an intercept handler.
 */
export interface InterceptOptions {
  /**
   * How many times this handler can be used before expiring.
   * @default Infinity
   */
  lifetime?: number

  /**
   * Strategy for handling the request.
   * - 'mock': Handle via Main Thread (default)
   * - 'passthrough': Allow this specific route to hit the network
   * @default 'mock'
   */
  strategy?: 'mock' | 'passthrough'
}

/**
 * Configuration for generating responses.
 */
export interface ResponseGenerator {
  /** HTTP status code @default 200. Can be static or dynamic. */
  status?: number | ((req: SerializedRequest) => Promise<number> | number)

  /** Response headers. Can be static or dynamic. */
  headers?:
    | Record<string, string>
    | ((req: SerializedRequest) => Promise<Record<string, string>> | Record<string, string>)

  /**
   * Response body. Can be static or dynamic.
   * Executed on Main Thread with access to test scope.
   */
  body?:
    | string
    | ArrayBuffer
    | null
    | ((req: SerializedRequest) => Promise<string | ArrayBuffer | null> | string | ArrayBuffer | null)

  /**
   * Simulates a network error.
   * If set, 'status' and 'body' are ignored.
   */
  error?: 'network' | 'timeout' | 'offline'
}

/**
 * Serialized request passed from SW to Main Thread.
 */
export interface SerializedRequest {
  /** Full URL of the request */
  url: string

  /** HTTP method */
  method: string

  /** Request headers (normalized to lowercase) */
  headers: Record<string, string>

  /** Request body (text, binary, or null) */
  body: string | ArrayBuffer | null

  /** Route parameters extracted from URLPattern */
  params: Record<string, string>

  /** Route query parameters extracted from URL search */
  query: Record<string, string | string[]>
}

/**
 * Options for setting up the worker.
 */
export interface SetupWorkerOptions {
  /**
   * Path to the Service Worker script.
   * @default '/amw-sw.js'
   */
  swPath?: string

  /**
   * Base URL for resolving relative URIs in matchers.
   */
  base?: string

  /**
   * Service Worker registration scope.
   * @default '/'
   */
  scope?: string
}

/**
 * Internal route definition stored in Service Worker.
 */
export interface RouteDefinition {
  /** Unique identifier for the route */
  id: string

  /** URLPattern for matching */
  pattern: URLPattern

  /** HTTP methods to match (empty = all methods) */
  methods: string[]

  /** Required headers (normalized to lowercase) */
  headers: Record<string, string>

  /** Number of times this route can be used */
  lifetime: number

  /** Current usage count */
  usageCount: number

  /** Strategy for handling the request */
  strategy: 'mock' | 'passthrough'
}

/**
 * Response data sent from Main Thread back to SW.
 */
export interface ResponseData {
  /** HTTP status code */
  status: number

  /** Response headers */
  headers: Record<string, string>

  /** Response body */
  body: string | ArrayBuffer | null

  /** Error type (if simulating an error) */
  error?: 'network' | 'timeout' | 'offline'
}
