import type { ResponseGenerator, SerializedRequest, ResponseData } from '../types/index.js'
import { DEFAULT_STATUS } from '../shared/constants.js'

/**
 * Stores and executes response generators on the Main Thread.
 */
export class RouteRegistry {
  private generators = new Map<string, ResponseGenerator>()

  /**
   * Registers a response generator for a route ID.
   */
  register(id: string, generator: ResponseGenerator): void {
    this.generators.set(id, generator)
  }

  /**
   * Executes a response generator for a route ID.
   */
  async execute(id: string, request: SerializedRequest): Promise<ResponseData> {
    const generator = this.generators.get(id)

    if (!generator) {
      throw new Error(`No generator found for route ID: ${id}`)
    }

    // Handle network errors
    if (generator.error) {
      return {
        status: 0,
        headers: {},
        body: null,
        error: generator.error,
      }
    }

    // Execute status generator
    let status: number = DEFAULT_STATUS
    if (generator.status !== undefined) {
      if (typeof generator.status === 'function') {
        status = await generator.status(request)
      } else {
        status = generator.status
      }
    }

    // Execute headers generator
    let headers: Record<string, string> = {}
    if (generator.headers !== undefined) {
      if (typeof generator.headers === 'function') {
        headers = await generator.headers(request)
      } else {
        headers = generator.headers
      }
    }

    // Execute body generator
    let body: string | ArrayBuffer | null = null
    if (generator.body !== undefined) {
      if (typeof generator.body === 'function') {
        const result = await generator.body(request)
        body = result
      } else {
        body = generator.body
      }
    }

    return {
      status,
      headers,
      body,
    }
  }

  /**
   * Removes a generator by route ID.
   */
  remove(id: string): void {
    this.generators.delete(id)
  }

  /**
   * Removes all generators.
   */
  reset(): void {
    this.generators.clear()
  }

  /**
   * Gets the count of registered generators.
   */
  count(): number {
    return this.generators.size
  }
}
