import type { MockHandler, SetupWorkerOptions } from '../types/index.js'
import { MockHandlerImpl } from './MockHandlerImpl.js'
import { DEFAULT_SW_PATH, DEFAULT_SW_SCOPE, SW_READY_TIMEOUT } from '../shared/constants.js'
import { withTimeout } from '../shared/utils.js'

/**
 * Sets up the Service Worker and returns a MockHandler instance.
 */
export async function setupWorker(options?: SetupWorkerOptions): Promise<MockHandler> {
  const swPath = options?.swPath ?? DEFAULT_SW_PATH
  const scope = options?.scope ?? DEFAULT_SW_SCOPE
  const base = options?.base

  // Check if Service Workers are supported
  if (!navigator.serviceWorker) {
    throw new Error('Service Workers are not supported in this browser')
  }

  // Register the Service Worker
  let registration: ServiceWorkerRegistration

  try {
    registration = await navigator.serviceWorker.register(swPath, { scope })
  } catch (error) {
    throw new Error(`Failed to register Service Worker: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      cause: error,
    })
  }

  // Wait for the Service Worker to be ready
  try {
    await withTimeout(navigator.serviceWorker.ready, SW_READY_TIMEOUT, 'Service Worker activation timeout')
  } catch (error) {
    throw new Error(`Service Worker not ready: ${error instanceof Error ? error.message : 'Unknown error'}`, {
      cause: error,
    })
  }

  // Get the active Service Worker
  // After navigator.serviceWorker.ready resolves, registration.active should be available
  await registration.update() // Force update check
  const sw = registration.installing || registration.waiting || registration.active
  if (!sw) {
    throw new Error('No active Service Worker found')
  }

  // If the worker is installing or waiting, wait for it to activate
  if (sw.state === 'installing' || sw.state === 'activating' || sw.state === 'installed') {
    await new Promise<void>((resolve) => {
      sw.addEventListener('statechange', function onStateChange() {
        if (sw.state === 'activated') {
          sw.removeEventListener('statechange', onStateChange)
          resolve()
        }
      })
      // If already activated by the time we add listener
      if (sw.state === 'activated') {
        resolve()
      }
    })
  }

  // Create MessageChannels for communication
  // mainPort: Used for registration/control messages
  // executePort: Used for route execution requests from SW
  const { port1: mainPort, port2: mainPortForSW } = new MessageChannel()
  const { port1: executePort, port2: executePortForSW } = new MessageChannel()

  // Send both ports to SW
  sw.postMessage(
    {
      type: 'INIT',
      mainPort: mainPortForSW,
      executePort: executePortForSW,
    },
    [mainPortForSW, executePortForSW]
  )

  // Create and return MockHandler
  // mainPort stays in Main Thread for sending control messages
  // executePort stays in Main Thread for receiving execution requests
  return new MockHandlerImpl(registration, mainPort, executePort, base)
}
