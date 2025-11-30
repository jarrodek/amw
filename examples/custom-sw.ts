/**
 * Example of creating a custom Service Worker by extending MockServiceWorker
 */

import { MockServiceWorker } from '@jarrodek/amw/worker'

/**
 * Custom Service Worker with logging capabilities
 */
class LoggingWorker extends MockServiceWorker {
  private requestCount = 0

  protected onFetch(event: FetchEvent) {
    this.requestCount++
    console.log(`[Custom SW] Request #${this.requestCount}: ${event.request.method} ${event.request.url}`)

    // Call parent implementation
    super.onFetch(event)
  }

  protected onInstall(event: ExtendableEvent) {
    console.log('[Custom SW] Installing...')
    super.onInstall(event)
  }

  protected onActivate(event: ExtendableEvent) {
    console.log('[Custom SW] Activating...')
    super.onActivate(event)
  }
}

// Start the custom worker
const worker = new LoggingWorker()
worker.start()
