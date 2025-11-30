import type { RouteDefinition } from '../types/index.js'

/**
 * LIFO stack for storing route definitions in the Service Worker.
 */
export class RouteStore {
  private routes: RouteDefinition[] = []

  /**
   * Adds a route to the top of the stack (LIFO).
   */
  add(route: RouteDefinition): void {
    this.routes.unshift(route)
  }

  /**
   * Finds the first matching route for a request.
   * Returns the route and increments its usage count.
   */
  findMatch(url: string, method: string, headers: Record<string, string>): RouteDefinition | null {
    for (let i = 0; i < this.routes.length; i++) {
      const route = this.routes[i]

      // Check if route has expired
      if (route.usageCount >= route.lifetime) {
        this.routes.splice(i, 1)
        i--
        continue
      }

      // Match URL pattern
      const patternMatch = route.pattern.exec(url)
      if (!patternMatch) {
        continue
      }

      // Match method
      if (route.methods.length > 0 && !route.methods.includes(method)) {
        continue
      }

      // Match headers
      if (!this.headersMatch(headers, route.headers)) {
        continue
      }

      // Found a match - increment usage
      route.usageCount++

      return route
    }

    return null
  }

  /**
   * Removes all routes matching a URI pattern.
   */
  removeByUri(uri: string): void {
    this.routes = this.routes.filter((route) => {
      // Compare the pathname part of the pattern
      const patternPathname = route.pattern.pathname
      return patternPathname !== uri
    })
  }

  /**
   * Removes routes matching a specific matcher configuration.
   */
  removeByMatcher(uri: string, methods?: string[], headers?: Record<string, string>): void {
    this.routes = this.routes.filter((route) => {
      const patternPathname = route.pattern.pathname
      if (patternPathname !== uri) {
        return true
      }

      // Check methods
      if (methods && methods.length > 0) {
        const methodsMatch = methods.every((m) => route.methods.includes(m))
        if (!methodsMatch) {
          return true
        }
      }

      // Check headers
      if (headers && Object.keys(headers).length > 0) {
        for (const [key, value] of Object.entries(headers)) {
          if (route.headers[key.toLowerCase()] !== value) {
            return true
          }
        }
      }

      return false // Remove this route
    })
  }

  /**
   * Clears all routes.
   */
  reset(): void {
    this.routes = []
  }

  /**
   * Gets the count of active routes.
   */
  count(): number {
    return this.routes.length
  }

  /**
   * Checks if request headers match required headers.
   */
  private headersMatch(requestHeaders: Record<string, string>, requiredHeaders: Record<string, string>): boolean {
    for (const [key, value] of Object.entries(requiredHeaders)) {
      if (requestHeaders[key.toLowerCase()] !== value) {
        return false
      }
    }
    return true
  }
}
