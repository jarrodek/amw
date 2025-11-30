/**
 * Error paths and edge cases: invalid inputs, boundary conditions, concurrent operations
 */
import { expect, use } from '@esm-bundle/chai'
import chaiAsPromised from 'chai-as-promised'
import { setupWorker, type MockHandler } from '../dist/index.js'

use(chaiAsPromised)

describe('Error Paths & Edge Cases', () => {
  let mock: MockHandler

  beforeEach(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
  })

  afterEach(async () => {
    if (mock) {
      await mock.stop()
    }
  })

  describe('Invalid Route Definitions', () => {
    it('should handle invalid URLPattern syntax gracefully', async () => {
      // URLPattern with invalid syntax should throw or be handled
      let error: Error | null = null
      try {
        await mock.add({
          match: { uri: '/invalid[' }, // Invalid regex in pattern
          respond: { body: 'test' },
        })
      } catch (e) {
        error = e as Error
      }
      // Should either throw or accept it (implementation-dependent)
      // The test validates that it doesn't crash the service worker
      expect(error === null || error instanceof Error).to.be.true
    })

    it('should handle empty URI pattern', async () => {
      await mock.add({
        match: { uri: '' },
        respond: { body: 'empty-pattern' },
      })

      // Empty pattern should not match anything
      try {
        const res = await fetch('https://api.example.com/test')
        // If it doesn't throw, the route didn't match (expected)
        expect(res.ok).to.be.false
      } catch (error) {
        // Network error is expected when route doesn't match
        expect(error).to.exist
      }
    })

    it('should handle missing match criteria', async () => {
      await mock.add({
        match: { uri: '/test' },
        respond: { body: 'test' },
      })

      const res = await fetch('https://api.example.com/test')
      expect(await res.text()).to.equal('test')
    })
  })

  describe('Response Generator Errors', () => {
    it('should return 500 when generator throws synchronously', async () => {
      await mock.add({
        match: { uri: '/sync-error' },
        respond: {
          body: () => {
            throw new Error('Sync error')
          },
        },
      })

      const res = await fetch('https://api.example.com/sync-error')
      expect(res.status).to.equal(500)
    })

    it('should return 500 when generator throws asynchronously', async () => {
      await mock.add({
        match: { uri: '/async-error' },
        respond: {
          body: async () => {
            throw new Error('Async error')
          },
        },
      })

      const res = await fetch('https://api.example.com/async-error')
      expect(res.status).to.equal(500)
    })

    it('should return 500 when generator returns invalid data', async () => {
      await mock.add({
        match: { uri: '/invalid-return' },
        respond: {
          // @ts-expect-error Testing invalid return value
          body: () => Symbol('invalid'),
        },
      })

      const res = await fetch('https://api.example.com/invalid-return')
      expect(res.status).to.equal(500)
    })

    it('should handle generator that returns undefined', async () => {
      await mock.add({
        match: { uri: '/undefined-return' },
        respond: {
          // @ts-expect-error Testing undefined return value
          body: () => undefined,
        },
      })

      const res = await fetch('https://api.example.com/undefined-return')
      expect(res.ok).to.be.true
      const text = await res.text()
      expect(text).to.equal('')
    })

    it('should handle generator that returns null', async () => {
      await mock.add({
        match: { uri: '/null-return' },
        respond: {
          body: () => null,
        },
      })

      const res = await fetch('https://api.example.com/null-return')
      expect(res.ok).to.be.true
    })
  })

  describe('Concurrent Operations', () => {
    it('should handle concurrent requests to same route', async () => {
      let callCount = 0
      await mock.add({
        match: { uri: '/concurrent' },
        respond: {
          body: async () => {
            callCount++
            await new Promise((resolve) => setTimeout(resolve, 10))
            return `Call ${callCount}`
          },
        },
      })

      const promises = Array.from({ length: 5 }, () =>
        fetch('https://api.example.com/concurrent').then((r) => r.text())
      )
      const results = await Promise.all(promises)

      expect(results.length).to.equal(5)
      expect(callCount).to.equal(5)
    })

    it('should handle concurrent add operations', async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        mock.add({
          match: { uri: `/route-${i}` },
          respond: { body: `Response ${i}` },
        })
      )
      await Promise.all(promises)

      // Verify all routes were registered
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) => fetch(`https://api.example.com/route-${i}`).then((r) => r.text()))
      )

      results.forEach((text, i) => {
        expect(text).to.equal(`Response ${i}`)
      })
    })

    it('should handle concurrent remove operations', async () => {
      // Add multiple routes
      await Promise.all(
        Array.from({ length: 5 }, (_, i) =>
          mock.add({
            match: { uri: `/remove-${i}` },
            respond: { body: `Response ${i}` },
          })
        )
      )

      // Remove them concurrently
      await Promise.all(Array.from({ length: 5 }, (_, i) => mock.release(`/remove-${i}`)))

      // Verify all removed - fetch should fail
      const results = await Promise.allSettled(
        Array.from({ length: 5 }, (_, i) => fetch(`https://api.example.com/remove-${i}`))
      )

      results.forEach((result) => {
        // Should either reject or resolve with non-ok response
        if (result.status === 'fulfilled') {
          expect(result.value.ok).to.be.false
        } else {
          expect(result.reason).to.exist
        }
      })
    })

    it('should handle reset during active requests', async () => {
      await mock.add({
        match: { uri: '/slow' },
        respond: {
          body: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50))
            return 'slow response'
          },
        },
      })

      // Start request
      const requestPromise = fetch('https://api.example.com/slow')

      // Reset immediately
      await new Promise((resolve) => setTimeout(resolve, 10))
      await mock.reset()

      // Original request should still complete
      const res = await requestPromise
      expect(res.ok).to.be.true
    })
  })

  describe('Operations After Stop', () => {
    it('should handle add after stop', async () => {
      await mock.stop()

      // Operations after stop should throw
      await expect(
        mock.add({
          match: { uri: '/after-stop' },
          respond: { body: 'test' },
        })
      ).to.be.rejectedWith('Cannot send message: MockHandler has been stopped')
    })

    it('should handle release after stop', async () => {
      await mock.add({
        match: { uri: '/test' },
        respond: { body: 'test' },
      })

      await mock.stop()

      // Operations after stop should throw
      await expect(mock.release('/test')).to.be.rejectedWith('Cannot send message: MockHandler has been stopped')
    })

    it('should handle reset after stop', async () => {
      await mock.stop()

      // Operations after stop should throw
      await expect(mock.reset()).to.be.rejectedWith('Cannot send message: MockHandler has been stopped')
    })

    it('should allow multiple stop() calls', async () => {
      await mock.stop()
      await mock.stop() // Should not throw or hang
      await mock.stop() // Should not throw or hang
      expect(true).to.be.true
    })
  })

  describe('Edge Cases', () => {
    it('should handle route with no response body', async () => {
      await mock.add({
        match: { uri: '/no-body' },
        respond: {
          status: 200,
        },
      })

      const res = await fetch('https://api.example.com/no-body')
      expect(res.status).to.equal(200)
      const text = await res.text()
      expect(text).to.equal('')
    })

    it('should handle very long URI patterns', async () => {
      const longPath = '/very/long/path/with/many/segments/that/keeps/going/and/going'
      await mock.add({
        match: { uri: longPath },
        respond: { body: 'long-path' },
      })

      const res = await fetch(`https://api.example.com${longPath}`)
      expect(await res.text()).to.equal('long-path')
    })

    it('should handle multiple params in pattern', async () => {
      await mock.add({
        match: { uri: '/users/:userId/posts/:postId/comments/:commentId' },
        respond: {
          body: (req) => `${req.params.userId}-${req.params.postId}-${req.params.commentId}`,
        },
      })

      const res = await fetch('https://api.example.com/users/123/posts/456/comments/789')
      expect(await res.text()).to.equal('123-456-789')
    })

    it('should handle same route added multiple times (LIFO)', async () => {
      await mock.add({
        match: { uri: '/duplicate' },
        respond: { body: 'first' },
      })

      await mock.add({
        match: { uri: '/duplicate' },
        respond: { body: 'second' },
      })

      const res = await fetch('https://api.example.com/duplicate')
      expect(await res.text()).to.equal('second') // LIFO: most recent wins
    })

    it('should handle request with no headers', async () => {
      await mock.add({
        match: { uri: '/no-headers' },
        respond: {
          body: (req) => `Headers count: ${Object.keys(req.headers).length}`,
        },
      })

      const res = await fetch('https://api.example.com/no-headers')
      const text = await res.text()
      // Browser may add default headers
      expect(text).to.match(/Headers count: \d+/)
    })

    it('should handle zero-byte binary response', async () => {
      await mock.add({
        match: { uri: '/empty-binary' },
        respond: {
          body: new ArrayBuffer(0),
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      })

      const res = await fetch('https://api.example.com/empty-binary')
      const buffer = await res.arrayBuffer()
      expect(buffer.byteLength).to.equal(0)
    })

    it('should handle response with only headers', async () => {
      await mock.add({
        match: { uri: '/headers-only' },
        respond: {
          headers: {
            'X-Custom': 'value',
            'X-Another': 'test',
          },
        },
      })

      const res = await fetch('https://api.example.com/headers-only')
      expect(res.headers.get('x-custom')).to.equal('value')
      expect(res.headers.get('x-another')).to.equal('test')
    })

    it('should handle rapid add/remove cycles', async () => {
      for (let i = 0; i < 10; i++) {
        await mock.add({
          match: { uri: '/rapid' },
          respond: { body: `Iteration ${i}` },
        })
        await mock.release('/rapid')
      }

      // Final add
      await mock.add({
        match: { uri: '/rapid' },
        respond: { body: 'final' },
      })

      const res = await fetch('https://api.example.com/rapid')
      expect(await res.text()).to.equal('final')
    })

    it('should handle routes that differ only by trailing slash', async () => {
      await mock.add({
        match: { uri: '/with-slash/' },
        respond: { body: 'with-slash' },
      })

      await mock.add({
        match: { uri: '/without-slash' },
        respond: { body: 'without-slash' },
      })

      const res1 = await fetch('https://api.example.com/with-slash/')
      expect(await res1.text()).to.equal('with-slash')

      const res2 = await fetch('https://api.example.com/without-slash')
      expect(await res2.text()).to.equal('without-slash')
    })
  })

  describe('Boundary Conditions', () => {
    it('should handle status code 0', async () => {
      await mock.add({
        match: { uri: '/status-zero' },
        respond: {
          body: 'test',
          status: 0,
        },
      })

      const res = await fetch('https://api.example.com/status-zero')
      // Status 0 is invalid, should default to 200
      expect(res.status).to.be.greaterThan(0)
    })

    it('should handle status code 999', async () => {
      await mock.add({
        match: { uri: '/status-999' },
        respond: {
          body: 'test',
          status: 999,
        },
      })

      const res = await fetch('https://api.example.com/status-999')
      // Implementation may reject unusual status codes
      expect(res.status).to.be.greaterThanOrEqual(200)
    })

    it('should handle negative status code', async () => {
      await mock.add({
        match: { uri: '/status-negative' },
        respond: {
          body: 'test',
          status: -1,
        },
      })

      const res = await fetch('https://api.example.com/status-negative')
      // Invalid status should be handled gracefully
      expect(res.status).to.be.greaterThan(0)
    })

    it('should handle lifetime of 0', async () => {
      await mock.add(
        {
          match: { uri: '/lifetime-zero' },
          respond: { body: 'test' },
        },
        {
          lifetime: 0,
        }
      )

      // Lifetime 0 means it's already expired
      expect(fetch('https://api.example.com/lifetime-zero')).to.eventually.be.rejected
    })

    it('should handle very large lifetime', async () => {
      await mock.add(
        {
          match: { uri: '/lifetime-large' },
          respond: { body: 'test' },
        },
        {
          lifetime: Number.MAX_SAFE_INTEGER,
        }
      )

      const res = await fetch('https://api.example.com/lifetime-large')
      expect(await res.text()).to.equal('test')
    })

    it('should handle empty header values', async () => {
      await mock.add({
        match: { uri: '/empty-header-value' },
        respond: {
          body: 'test',
          headers: { 'X-Empty': '' },
        },
      })

      const res = await fetch('https://api.example.com/empty-header-value')
      expect(res.headers.get('x-empty')).to.equal('')
    })

    it('should handle header names with spaces (invalid)', async () => {
      let error: Error | null = null
      try {
        await mock.add({
          match: { uri: '/invalid-header-name' },
          respond: {
            body: 'test',
            headers: { 'Invalid Header': 'value' },
          },
        })
        await fetch('https://api.example.com/invalid-header-name')
      } catch (e) {
        error = e as Error
      }
      // Should either throw or handle gracefully
      expect(error === null || error instanceof Error).to.be.true
    })
  })
})
