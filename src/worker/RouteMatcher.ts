import type { InterceptMatcher, RouteDefinition, SerializedRequest } from '../types/index.js'
import { headersToObject, readRequestBody, normalizeHeaders } from '../shared/utils.js'

/**
 * Handles URL and header matching logic.
 */
// eslint-disable-next-line @typescript-eslint/no-extraneous-class
export class RouteMatcher {
  /**
   * Creates a RouteDefinition from a matcher and options.
   */
  static createRouteDefinition(
    id: string,
    matcher: InterceptMatcher,
    options: { lifetime: number; strategy: 'mock' | 'passthrough' },
    base?: string
  ): RouteDefinition {
    // Create URLPattern
    const patternInput = base ? new URL(matcher.uri, base).href : matcher.uri
    const pattern = new URLPattern(patternInput)

    // Normalize methods
    const methods = (matcher.methods || []).map((m) => m.toUpperCase())

    // Normalize headers
    const headers = matcher.headers ? normalizeHeaders(matcher.headers) : {}

    return {
      id,
      pattern,
      methods,
      headers,
      lifetime: options.lifetime,
      usageCount: 0,
      strategy: options.strategy,
    }
  }

  /**
   * Extracts route parameters from a URLPattern match.
   */
  static extractParams(patternMatch: URLPatternResult): Record<string, string> {
    const params: Record<string, string> = {}

    // Extract pathname groups (e.g., :id)
    if (patternMatch.pathname.groups) {
      Object.assign(params, patternMatch.pathname.groups)
    }

    return params
  }

  /**
   * Extracts query parameters from a URLPattern match.
   */
  static extractQueryParameters(patternMatch: URLPatternResult): Record<string, string | string[]> {
    const params: Record<string, string | string[]> = {}

    if (patternMatch.search.input) {
      try {
        const searchParams = new URLSearchParams(patternMatch.search.input)
        for (const key of searchParams.keys()) {
          const value = searchParams.getAll(key)
          params[key] = value.length === 1 ? value[0] : value
        }
      } catch {
        // ignore
      }
    }

    return params
  }

  /**
   * Serializes a Request into a SerializedRequest.
   */
  static async serializeRequest(request: Request, patternMatch: URLPatternResult): Promise<SerializedRequest> {
    const headers = headersToObject(request.headers)
    const body = await readRequestBody(request.clone())
    const params = this.extractParams(patternMatch)
    const query = this.extractQueryParameters(patternMatch)

    return {
      url: request.url,
      method: request.method,
      headers,
      body,
      params,
      query,
    }
  }
}
