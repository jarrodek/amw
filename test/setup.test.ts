/**
 * Basic setup and functionality tests for AMW
 */

import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../dist/index.js'

describe('AMW Setup', () => {
  let mock: MockHandler | null

  afterEach(async () => {
    if (mock) {
      await mock.stop()
      mock = null
    }
  })

  it('should setup worker successfully', async () => {
    mock = await setupWorker({
      swPath: '/dist/sw.js',
    })

    expect(mock).to.exist
    expect(mock.add).to.be.a('function')
    expect(mock.reset).to.be.a('function')
    expect(mock.stop).to.be.a('function')
  })

  it('should throw error if Service Workers are not supported', async () => {
    const originalSW = navigator.serviceWorker

    // Simulate unsupported/disabled Service Workers by making register throw
    Object.defineProperty(navigator, 'serviceWorker', {
      value: {
        register: () => {
          throw new Error('SW disabled')
        },
      },
      configurable: true,
    })

    try {
      await setupWorker({ swPath: '/dist/sw.js' })
      expect.fail('Should have thrown an error')
    } catch (error) {
      // Depending on the environment, absence may surface as unsupported or register failure
      expect((error as Error).message).to.satisfy(
        (msg: string | string[]) =>
          msg.includes('Service Workers are not supported') || msg.includes('Failed to register Service Worker')
      )
    } finally {
      // Restore Service Worker support
      Object.defineProperty(navigator, 'serviceWorker', {
        value: originalSW,
        configurable: true,
      })
    }
  })
})
