/**
 * Advanced features tests: lifetime, LIFO, errors, binary data
 */

import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../src/index.js'

describe('Advanced Features', () => {
  let mock: MockHandler

  before(async () => {
    mock = await setupWorker({
      swPath: '/dist/sw.js',
      base: 'https://api.example.com',
    })
  })

  after(async () => {
    if (mock) {
      await mock.reset()
      await mock.stop()
    }
  })

  beforeEach(async () => {
    await mock.reset()
  })

  describe('Lifetime Management', () => {
    it('should expire after specified lifetime', async () => {
      let callCount = 0

      await mock.add(
        {
          match: { uri: '/one-time' },
          respond: {
            body: () => {
              callCount++
              return `Call ${callCount}`
            },
          },
        },
        { lifetime: 2 }
      )

      // First call
      const res1 = await fetch('https://api.example.com/one-time')
      expect(await res1.text()).to.equal('Call 1')

      // Second call
      const res2 = await fetch('https://api.example.com/one-time')
      expect(await res2.text()).to.equal('Call 2')

      // Third call should go to network (fail)
      try {
        await fetch('https://api.example.com/one-time')
        expect.fail('Should have failed - mock expired')
      } catch (error) {
        expect((error as Error).message).to.not.equal('Should have failed - mock expired')
      }

      expect(callCount).to.equal(2)
    })

    it('should support single-use mocks', async () => {
      await mock.add(
        {
          match: { uri: '/once' },
          respond: { body: 'One time only' },
        },
        { lifetime: 1 }
      )

      const res1 = await fetch('https://api.example.com/once')
      expect(await res1.text()).to.equal('One time only')

      try {
        await fetch('https://api.example.com/once')
        expect.fail('Should have failed - mock expired')
      } catch (error) {
        expect(error).to.exist
      }
    })

    it('should support infinite lifetime mocks', async () => {
      await mock.add({
        match: { uri: '/always' },
        respond: { body: 'Always here' },
      })

      for (let i = 0; i < 5; i++) {
        const res = await fetch('https://api.example.com/always')
        expect(await res.text()).to.equal('Always here')
      }
    })
  })

  describe('LIFO Routing', () => {
    it('should use most recent mock first', async () => {
      await mock.add({
        match: { uri: '/users/:id' },
        respond: { body: 'Old mock' },
      })

      await mock.add({
        match: { uri: '/users/:id' },
        respond: { body: 'New mock' },
      })

      const response = await fetch('https://api.example.com/users/123')
      expect(await response.text()).to.equal('New mock')
    })

    it('should fall through to older mocks when recent ones expire', async () => {
      // Older mock (infinite lifetime)
      await mock.add({
        match: { uri: '/test' },
        respond: { body: 'Fallback' },
      })

      // Newer mock (single use)
      await mock.add(
        {
          match: { uri: '/test' },
          respond: { body: 'First call' },
        },
        { lifetime: 1 }
      )

      const res1 = await fetch('https://api.example.com/test')
      expect(await res1.text()).to.equal('First call')

      const res2 = await fetch('https://api.example.com/test')
      expect(await res2.text()).to.equal('Fallback')
    })
  })

  describe('Network Errors', () => {
    it('should simulate network errors', async () => {
      await mock.add({
        match: { uri: '/error' },
        respond: {
          error: 'network',
        },
      })

      try {
        await fetch('https://api.example.com/error')
        expect.fail('Should have thrown network error')
      } catch (error) {
        expect((error as Error).message).to.not.equal('Should have thrown network error')
      }
    })

    it('should simulate timeout errors', async () => {
      await mock.add({
        match: { uri: '/timeout' },
        respond: {
          error: 'timeout',
        },
      })

      const response = await fetch('https://api.example.com/timeout')
      expect(response.status).to.equal(408)
    })
  })

  describe('Binary Data', () => {
    it('should support ArrayBuffer responses', async () => {
      const buffer = new ArrayBuffer(128)
      const view = new Uint8Array(buffer)
      view[0] = 255
      view[127] = 128

      await mock.add({
        match: { uri: '/binary' },
        respond: {
          headers: { 'content-type': 'application/octet-stream' },
          body: buffer,
        },
      })

      const response = await fetch('https://api.example.com/binary')
      const responseBuffer = await response.arrayBuffer()
      const responseView = new Uint8Array(responseBuffer)

      expect(responseBuffer.byteLength).to.equal(128)
      expect(responseView[0]).to.equal(255)
      expect(responseView[127]).to.equal(128)
    })

    it('should support dynamic binary responses', async () => {
      await mock.add({
        match: { uri: '/image/:id' },
        respond: {
          headers: { 'content-type': 'image/png' },
          body: async (req) => {
            const size = parseInt(req.params.id, 10)
            return new ArrayBuffer(size)
          },
        },
      })

      const response = await fetch('https://api.example.com/image/256')
      const buffer = await response.arrayBuffer()

      expect(buffer.byteLength).to.equal(256)
      expect(response.headers.get('content-type')).to.equal('image/png')
    })
  })

  describe('URL Parameters', () => {
    it('should extract URL parameters', async () => {
      await mock.add({
        match: { uri: '/users/:userId/posts/:postId' },
        respond: {
          body: async (req) => {
            return JSON.stringify({
              userId: req.params.userId,
              postId: req.params.postId,
            })
          },
        },
      })

      const response = await fetch('https://api.example.com/users/123/posts/456')
      const data = await response.json()

      expect(data.userId).to.equal('123')
      expect(data.postId).to.equal('456')
    })
  })
})
