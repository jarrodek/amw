/**
 * Type declarations for Service Worker globals and URLPattern API
 */

// URLPattern API type declarations
declare class URLPattern {
  constructor(input: string | URLPatternInit, baseURL?: string)

  readonly protocol: string
  readonly username: string
  readonly password: string
  readonly hostname: string
  readonly port: string
  readonly pathname: string
  readonly search: string
  readonly hash: string

  test(input: string | URLPatternInit, baseURL?: string): boolean
  exec(input: string | URLPatternInit, baseURL?: string): URLPatternResult | null
}

interface URLPatternInit {
  protocol?: string
  username?: string
  password?: string
  hostname?: string
  port?: string
  pathname?: string
  search?: string
  hash?: string
  baseURL?: string
}

interface URLPatternResult {
  inputs: [string] | [URLPatternInit]
  protocol: URLPatternComponentResult
  username: URLPatternComponentResult
  password: URLPatternComponentResult
  hostname: URLPatternComponentResult
  port: URLPatternComponentResult
  pathname: URLPatternComponentResult
  search: URLPatternComponentResult
  hash: URLPatternComponentResult
}

interface URLPatternComponentResult {
  input: string
  groups: Record<string, string>
}

// Service Worker scope extension
declare const self: ServiceWorkerGlobalScope

interface ServiceWorkerGlobalScope extends WorkerGlobalScope {
  addEventListener(type: 'install', listener: (event: ExtendableEvent) => void): void
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  addEventListener(type: 'activate', listener: (event: ExtendableEvent) => void): void
  addEventListener(type: 'fetch', listener: (event: FetchEvent) => void): void
  addEventListener(type: 'message', listener: (event: ExtendableMessageEvent) => void): void
  addEventListener(type: string, listener: EventListenerOrEventListenerObject): void

  skipWaiting(): Promise<void>
  clients: Clients
}

interface ExtendableEvent extends Event {
  waitUntil(f: Promise<unknown>): void
}

interface FetchEvent extends ExtendableEvent {
  readonly clientId: string
  readonly handled: Promise<void>
  readonly preloadResponse: Promise<unknown>
  readonly request: Request
  readonly resultingClientId: string

  respondWith(r: Response | Promise<Response>): void
}

interface ExtendableMessageEvent extends ExtendableEvent {
  readonly data: unknown
  readonly lastEventId: string
  readonly origin: string
  readonly ports: readonly MessagePort[]
  readonly source: Client | ServiceWorker | MessagePort | null
}

interface Clients {
  claim(): Promise<void>
  get(id: string): Promise<Client | undefined>
  matchAll(options?: ClientQueryOptions): Promise<readonly Client[]>
  openWindow(url: string): Promise<WindowClient | null>
}

interface Client {
  readonly frameType: FrameType
  readonly id: string
  readonly type: ClientTypes
  readonly url: string
  postMessage(message: unknown, transfer?: Transferable[]): void
}

interface WindowClient extends Client {
  readonly focused: boolean
  readonly visibilityState: DocumentVisibilityState
  focus(): Promise<WindowClient>
  navigate(url: string): Promise<WindowClient | null>
}

interface ClientQueryOptions {
  includeUncontrolled?: boolean
  type?: ClientTypes
}

type ClientTypes = 'window' | 'worker' | 'sharedworker' | 'all'
type FrameType = 'auxiliary' | 'top-level' | 'nested' | 'none'
type DocumentVisibilityState = 'visible' | 'hidden'
