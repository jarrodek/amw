/**
 * Default Service Worker script for AMW.
 * Simply instantiates and starts the MockServiceWorker.
 */

import { MockServiceWorker } from './worker/MockServiceWorker.js'

const worker = new MockServiceWorker()
worker.start()
