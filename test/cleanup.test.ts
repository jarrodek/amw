/**
 * Tests for cleanup operations: release, releaseMatch, reset
 */

import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../src/index.js'

describe('Cleanup Operations', () => {
  let mock: MockHandler

  beforeEach(async () => {
    mock = await setupWorker({
      swPath: '/dist/sw.js',
      base: 'https://api.example.com',
    })
  })

  afterEach(async () => {
    if (mock) {
      await mock.stop()
    }
  })

  describe('release()', () => {
    it('should remove handlers by URI', async () => {
      await mock.add({
        match: { uri: '/route1' },
        respond: { body: 'Route 1' },
      })

      await mock.add({
        match: { uri: '/route2' },
        respond: { body: 'Route 2' },
      })

      // Verify both work
      const res1 = await fetch('https://api.example.com/route1')
      expect(await res1.text()).to.equal('Route 1')

      const res2 = await fetch('https://api.example.com/route2')
      expect(await res2.text()).to.equal('Route 2')

      // Release route1
      await mock.release('/route1')

      // route1 should fail, route2 should still work
      try {
        await fetch('https://api.example.com/route1')
        expect.fail('route1 should have failed')
      } catch (error) {
        expect((error as Error).message).to.not.equal('route1 should have failed')
      }

      const res3 = await fetch('https://api.example.com/route2')
      expect(await res3.text()).to.equal('Route 2')
    })
  })

  describe('releaseMatch()', () => {
    it('should remove handlers by matcher', async () => {
      await mock.add({
        match: {
          uri: '/api',
          methods: ['GET'],
        },
        respond: { body: 'GET' },
      })

      await mock.add({
        match: {
          uri: '/api',
          methods: ['POST'],
        },
        respond: { body: 'POST' },
      })

      // Verify both work
      const getRes = await fetch('https://api.example.com/api')
      expect(await getRes.text()).to.equal('GET')

      const postRes = await fetch('https://api.example.com/api', {
        method: 'POST',
      })
      expect(await postRes.text()).to.equal('POST')

      // Release GET
      await mock.releaseMatch({
        uri: '/api',
        methods: ['GET'],
      })

      // GET should fail, POST should still work
      try {
        await fetch('https://api.example.com/api')
        expect.fail('GET should have failed')
      } catch (error) {
        expect((error as Error).message).to.not.equal('GET should have failed')
      }

      const postRes2 = await fetch('https://api.example.com/api', {
        method: 'POST',
      })
      expect(await postRes2.text()).to.equal('POST')
    })
  })

  describe('reset()', () => {
    it('should clear all handlers', async () => {
      await mock.add({
        match: { uri: '/route1' },
        respond: { body: 'Route 1' },
      })

      await mock.add({
        match: { uri: '/route2' },
        respond: { body: 'Route 2' },
      })

      // Verify both work
      const res1 = await fetch('https://api.example.com/route1')
      expect(await res1.text()).to.equal('Route 1')

      // Reset
      await mock.reset()

      // Both should fail
      try {
        await fetch('https://api.example.com/route1')
        expect.fail('route1 should have failed')
      } catch (error) {
        expect((error as Error).message).to.not.equal('route1 should have failed')
      }

      try {
        await fetch('https://api.example.com/route2')
        expect.fail('route2 should have failed')
      } catch (error) {
        expect((error as Error).message).to.not.equal('route2 should have failed')
      }
    })

    it('should allow adding new handlers after reset', async () => {
      await mock.add({
        match: { uri: '/test' },
        respond: { body: 'Old' },
      })

      await mock.reset()

      await mock.add({
        match: { uri: '/test' },
        respond: { body: 'New' },
      })

      const response = await fetch('https://api.example.com/test')
      expect(await response.text()).to.equal('New')
    })
  })
})
