import type { Message, ExecuteRouteMessage, RouteResponseMessage } from '../types/messages.js'
import type { RouteDefinition } from '../types/index.js'
import { MessageType } from '../types/messages.js'
import { RouteStore } from './RouteStore.js'
import { RouteMatcher } from './RouteMatcher.js'
import { DEFAULT_LIFETIME, DEFAULT_STRATEGY } from '../shared/constants.js'
import { headersToObject } from '../shared/utils.js'

/**
 * Service Worker class that handles request interception and routing.
 * Can be extended by users to add custom logging or behavior.
 */
export class MockServiceWorker {
  private routeStore = new RouteStore()
  private mainPort: MessagePort | null = null
  private executePort: MessagePort | null = null

  /**
   * Initializes event listeners.
   * Call this in the SW file global scope.
   */
  start(): void {
    const sw = self as unknown as ServiceWorkerGlobalScope
    sw.addEventListener('install', this.onInstall.bind(this) as EventListener)
    sw.addEventListener('activate', this.onActivate.bind(this) as EventListener)
    sw.addEventListener('fetch', this.onFetch.bind(this) as EventListener)
    sw.addEventListener('message', this.onMessage.bind(this) as EventListener)
  }

  /**
   * Install event handler.
   */
  protected onInstall(): void {
    // Skip waiting to activate immediately
    ;(self as unknown as ServiceWorkerGlobalScope).skipWaiting()
  }

  /**
   * Activate event handler.
   */
  protected onActivate(event: ExtendableEvent): void {
    // Claim all clients immediately
    event.waitUntil((self as unknown as ServiceWorkerGlobalScope).clients.claim())
  }

  /**
   * Fetch event handler.
   * Overrideable for custom logging or bypass logic.
   */
  protected onFetch(event: FetchEvent): void {
    const { request } = event
    const url = request.url
    const method = request.method
    const headers = headersToObject(request.headers)

    // Try to find a matching route
    const route = this.routeStore.findMatch(url, method, headers)

    if (!route) {
      // No match - let the browser handle it
      return
    }

    // Check if it's a passthrough route
    if (route.strategy === 'passthrough') {
      return
    }

    // Intercept and handle
    event.respondWith(this.handleRequest(request, route))
  }

  /**
   * Handles an intercepted request by delegating to Main Thread.
   */
  private async handleRequest(request: Request, route: RouteDefinition): Promise<Response> {
    if (!this.executePort) {
      return new Response('AMW: Execute port not connected', { status: 500 })
    }

    try {
      // Get URLPattern match for params
      const patternMatch = route.pattern.exec(request.url)
      if (!patternMatch) {
        return new Response('AMW: Pattern match failed', { status: 500 })
      }

      // Serialize the request
      const serializedRequest = await RouteMatcher.serializeRequest(request, patternMatch)

      // Create a MessageChannel for this specific request
      const { port1, port2 } = new MessageChannel()

      // Send execution request to Main Thread
      const executeMessage: ExecuteRouteMessage = {
        type: MessageType.EXECUTE_ROUTE,
        payload: {
          routeId: route.id,
          request: serializedRequest,
        },
      }

      this.executePort.postMessage(executeMessage, [port2])

      // Wait for response from Main Thread
      const responseData = await this.waitForResponse(port1)

      // Handle network errors
      if (responseData.error) {
        if (responseData.error === 'network' || responseData.error === 'offline') {
          return Response.error()
        }
        if (responseData.error === 'timeout') {
          return new Response('Request Timeout', { status: 408 })
        }
      }

      // Construct and return response
      return new Response(responseData.body, {
        status: responseData.status,
        headers: responseData.headers,
      })
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('[AMW] Error handling request:', error)
      return new Response(`AMW Error: ${error instanceof Error ? error.message : 'Unknown error'}`, {
        status: 500,
      })
    }
  }

  /**
   * Waits for a response message on a MessagePort.
   */
  private waitForResponse(port: MessagePort): Promise<RouteResponseMessage['payload']> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        port.close()
        reject(new Error('Response timeout'))
      }, 30000) // 30 second timeout

      port.onmessage = (event) => {
        clearTimeout(timeout)
        port.close()

        const message = event.data as Message
        if (message.type === MessageType.ROUTE_RESPONSE) {
          resolve(message.payload)
        } else if (message.type === MessageType.ERROR) {
          reject(new Error(message.payload.message))
        } else {
          reject(new Error(`Unexpected message type: ${message.type}`))
        }
      }
    })
  }

  /**
   * Message event handler for communication with Main Thread.
   */
  protected onMessage(event: ExtendableMessageEvent): void {
    const message = event.data

    // Handle INIT message to setup ports
    if (message.type === 'INIT') {
      if (message.mainPort) {
        this.mainPort = message.mainPort as MessagePort
        // Start listening for control messages on mainPort
        ;(this.mainPort as MessagePort).onmessage = (e) => this.handleControlMessage(e)
      }
      if (message.executePort) {
        this.executePort = message.executePort
      }
      return
    }

    // Fallback for messages sent directly (not via ports)
    this.handleControlMessage(event)
  }

  /**
   * Handles control messages (REGISTER_ROUTE, REMOVE_ROUTE, etc.)
   */
  private handleControlMessage(event: MessageEvent | ExtendableMessageEvent): void {
    const message = event.data as Message

    switch (message.type) {
      case MessageType.REGISTER_ROUTE: {
        const { id, matcher, options, base } = message.payload
        const route = RouteMatcher.createRouteDefinition(
          id,
          matcher,
          {
            lifetime: options.lifetime ?? DEFAULT_LIFETIME,
            strategy: options.strategy ?? DEFAULT_STRATEGY,
          },
          base
        )
        this.routeStore.add(route)

        // Send acknowledgment via the port that sent the message
        const responsePort =
          ('ports' in event && event.ports[0]) || (event.target instanceof MessagePort ? event.target : this.mainPort)
        responsePort?.postMessage({ type: MessageType.ACK })
        break
      }

      case MessageType.REMOVE_ROUTE: {
        const { uri } = message.payload
        this.routeStore.removeByUri(uri)
        const responsePort =
          ('ports' in event && event.ports[0]) || (event.target instanceof MessagePort ? event.target : this.mainPort)
        responsePort?.postMessage({ type: MessageType.ACK })
        break
      }

      case MessageType.REMOVE_ROUTES_BY_MATCHER: {
        const { matcher } = message.payload
        this.routeStore.removeByMatcher(matcher.uri, matcher.methods, matcher.headers)
        const responsePort =
          ('ports' in event && event.ports[0]) || (event.target instanceof MessagePort ? event.target : this.mainPort)
        responsePort?.postMessage({ type: MessageType.ACK })
        break
      }

      case MessageType.RESET_ROUTES: {
        this.routeStore.reset()
        const responsePort =
          ('ports' in event && event.ports[0]) || (event.target instanceof MessagePort ? event.target : this.mainPort)
        responsePort?.postMessage({ type: MessageType.ACK })
        break
      }

      default:
        // eslint-disable-next-line no-console
        console.warn('[AMW] Unknown message type:', message.type)
    }
  }
}
