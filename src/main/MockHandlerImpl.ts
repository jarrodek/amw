import type { MockHandler, InterceptHandler, InterceptOptions, InterceptMatcher } from '../types/index.js'
import type {
  Message,
  RegisterRouteMessage,
  RemoveRouteMessage,
  RemoveRoutesByMatcherMessage,
  ResetRoutesMessage,
  ExecuteRouteMessage,
  RouteResponseMessage,
} from '../types/messages.js'
import { MessageType } from '../types/messages.js'
import { RouteRegistry } from './RouteRegistry.js'
import { generateId } from '../shared/utils.js'
import { DEFAULT_LIFETIME, DEFAULT_STRATEGY, MESSAGE_TIMEOUT } from '../shared/constants.js'

/**
 * Main controller for managing mock handlers.
 * Communicates with Service Worker and executes response generators.
 */
export class MockHandlerImpl implements MockHandler {
  private registry = new RouteRegistry()
  private swRegistration: ServiceWorkerRegistration
  private mainPort: MessagePort
  private executePort: MessagePort
  private base?: string
  private stopped = false

  constructor(
    swRegistration: ServiceWorkerRegistration,
    mainPort: MessagePort,
    executePort: MessagePort,
    base?: string
  ) {
    this.swRegistration = swRegistration
    this.mainPort = mainPort
    this.executePort = executePort
    this.base = base

    // Listen for execution requests from SW
    this.executePort.onmessage = this.handleExecuteMessage.bind(this)
  }

  /**
   * Handles execution requests from Service Worker.
   */
  private async handleExecuteMessage(event: MessageEvent): Promise<void> {
    const message = event.data as Message

    if (message.type !== MessageType.EXECUTE_ROUTE) {
      // eslint-disable-next-line no-console
      console.warn('[AMW] Unexpected message type:', message.type)
      return
    }

    const executeMessage = message as ExecuteRouteMessage
    const { routeId, request } = executeMessage.payload

    // Get the response port sent from SW
    const responsePort = event.ports[0]

    try {
      // Execute the generator
      const responseData = await this.registry.execute(routeId, request)

      // Send response back to SW
      const response: RouteResponseMessage = {
        type: MessageType.ROUTE_RESPONSE,
        payload: responseData,
      }

      responsePort.postMessage(response)
    } catch (error) {
      // Send error back to SW
      responsePort.postMessage({
        type: MessageType.ERROR,
        payload: {
          message: error instanceof Error ? error.message : 'Unknown error',
        },
      })
    }
  }

  /**
   * Sends a message to SW and waits for acknowledgment.
   */
  private async sendMessage(message: Message): Promise<void> {
    if (this.stopped) {
      throw new Error('Cannot send message: MockHandler has been stopped')
    }

    return new Promise((resolve, reject) => {
      const { port1, port2 } = new MessageChannel()

      const timeout = setTimeout(() => {
        port1.close()
        reject(new Error('Message timeout'))
      }, MESSAGE_TIMEOUT)

      port1.onmessage = (event) => {
        clearTimeout(timeout)
        port1.close()

        const response = event.data as Message
        if (response.type === MessageType.ACK) {
          resolve()
        } else if (response.type === MessageType.ERROR) {
          reject(new Error(response.payload.message))
        } else {
          reject(new Error(`Unexpected response type: ${response.type}`))
        }
      }

      this.mainPort.postMessage(message, [port2])
    })
  }

  /**
   * Registers a mock interceptor.
   */
  async add(handler: InterceptHandler, options?: InterceptOptions): Promise<void> {
    const id = generateId()
    const lifetime = options?.lifetime ?? DEFAULT_LIFETIME
    const strategy = options?.strategy ?? DEFAULT_STRATEGY

    // Store generator in Main Thread
    this.registry.register(id, handler.respond)

    // Send matcher to Service Worker
    const message: RegisterRouteMessage = {
      type: MessageType.REGISTER_ROUTE,
      payload: {
        id,
        matcher: handler.match,
        options: { lifetime, strategy },
        base: this.base,
      },
    }

    await this.sendMessage(message)
  }

  /**
   * Removes all handlers for a specific URI string.
   */
  async release(uri: string): Promise<void> {
    const message: RemoveRouteMessage = {
      type: MessageType.REMOVE_ROUTE,
      payload: { uri },
    }

    await this.sendMessage(message)
  }

  /**
   * Removes handlers based on a specific matcher configuration.
   */
  async releaseMatch(matcher: InterceptMatcher): Promise<void> {
    const message: RemoveRoutesByMatcherMessage = {
      type: MessageType.REMOVE_ROUTES_BY_MATCHER,
      payload: { matcher },
    }

    await this.sendMessage(message)
  }

  /**
   * Resets all handlers.
   */
  async reset(): Promise<void> {
    // Clear Main Thread registry
    this.registry.reset()

    // Clear Service Worker routes
    const message: ResetRoutesMessage = {
      type: MessageType.RESET_ROUTES,
    }

    await this.sendMessage(message)
  }

  /**
   * Unregisters SW and cleans up.
   */
  async stop(): Promise<void> {
    if (this.stopped) {
      // Already stopped, ignore
      return
    }

    this.stopped = true

    // Reset all routes first
    try {
      this.registry.reset()
    } catch {
      // Ignore errors during cleanup
    }

    // Close ports
    try {
      this.mainPort.close()
      this.executePort.close()
    } catch {
      // Ignore port close errors
    }

    // Unregister Service Worker
    try {
      await this.swRegistration.unregister()
    } catch {
      // Ignore unregister errors
    }
  }
}
