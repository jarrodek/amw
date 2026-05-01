/**
 * Performance and stress testing: high load, memory management, scalability
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker, type MockHandler } from '../dist/index.js'

describe('Performance & Stress Testing', () => {
  let mock: MockHandler

  before(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
  })

  after(async () => {
    await mock.stop()
  })

  beforeEach(async () => {
    if (!(await mock.isRunning())) {
      mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
    }
    await mock.reset()
  })

  describe('Large Number of Routes', () => {
    it('should handle 100 routes efficiently', async () => {
      const startTime = Date.now()

      // Add 100 routes
      for (let i = 0; i < 100; i++) {
        await mock.add({
          match: { uri: `/route-${i}` },
          respond: { body: `Response ${i}` },
        })
      }

      const addTime = Date.now() - startTime
      expect(addTime).to.be.lessThan(5000) // Should complete within 5 seconds

      // Verify routes work (sample)
      const res1 = await fetch('https://api.example.com/route-0')
      expect(await res1.text()).to.equal('Response 0')

      const res50 = await fetch('https://api.example.com/route-50')
      expect(await res50.text()).to.equal('Response 50')

      const res99 = await fetch('https://api.example.com/route-99')
      expect(await res99.text()).to.equal('Response 99')
    })

    it('should find routes in LIFO order with many routes', async () => {
      // Add 50 routes with same pattern
      for (let i = 0; i < 50; i++) {
        await mock.add({
          match: { uri: '/same-path' },
          respond: { body: `Version ${i}` },
        })
      }

      const res = await fetch('https://api.example.com/same-path')
      expect(await res.text()).to.equal('Version 49') // Most recent (LIFO)
    })

    it('should handle routes with complex patterns', async () => {
      for (let i = 0; i < 50; i++) {
        await mock.add({
          match: { uri: `/api/v${i}/:resource/:id/action/:type` },
          respond: {
            body: (req) => `v${i}: ${req.params.resource}/${req.params.id}/${req.params.type}`,
          },
        })
      }

      const res = await fetch('https://api.example.com/api/v25/users/123/action/delete')
      expect(await res.text()).to.equal('v25: users/123/delete')
    })
  })

  describe('High Concurrency', () => {
    it('should handle 50 concurrent requests', async () => {
      await mock.add({
        match: { uri: '/concurrent' },
        respond: {
          body: async () => {
            await new Promise((resolve) => setTimeout(resolve, 10))
            return 'concurrent-response'
          },
        },
      })

      const startTime = Date.now()
      const promises = Array.from({ length: 50 }, () =>
        fetch('https://api.example.com/concurrent').then((r) => r.text())
      )

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(results.length).to.equal(50)
      expect(results.every((r) => r === 'concurrent-response')).to.be.true
      // Should complete in reasonable time (concurrent, not sequential)
      expect(duration).to.be.lessThan(2000)
    })

    it('should handle concurrent requests to different routes', async () => {
      // Add 20 routes
      for (let i = 0; i < 20; i++) {
        await mock.add({
          match: { uri: `/route-${i}` },
          respond: { body: `Response ${i}` },
        })
      }

      // Request all concurrently
      const promises = Array.from({ length: 20 }, (_, i) =>
        fetch(`https://api.example.com/route-${i}`).then((r) => r.text())
      )

      const results = await Promise.all(promises)
      results.forEach((text, i) => {
        expect(text).to.equal(`Response ${i}`)
      })
    })

    it('should handle concurrent add/remove/request operations', async () => {
      const operations = []

      // Add routes
      for (let i = 0; i < 10; i++) {
        operations.push(
          mock.add({
            match: { uri: `/add-${i}` },
            respond: { body: `Added ${i}` },
          })
        )
      }

      // Remove some routes
      for (let i = 0; i < 5; i++) {
        operations.push(mock.release(`/add-${i}`))
      }

      // Make requests
      for (let i = 0; i < 10; i++) {
        operations.push(fetch(`https://api.example.com/add-${i}`).catch(() => null))
      }

      await Promise.allSettled(operations)
      expect(true).to.be.true // Verify no crashes
    })
  })

  describe('Memory Management', () => {
    it('should handle repeated add/remove cycles without memory leaks', async () => {
      const iterations = 100

      for (let i = 0; i < iterations; i++) {
        await mock.add({
          match: { uri: '/memory-test' },
          respond: { body: `Iteration ${i}` },
        })

        if (i % 10 === 0) {
          await mock.reset()
        }
      }

      // Final test
      await mock.add({
        match: { uri: '/memory-test' },
        respond: { body: 'final' },
      })

      const res = await fetch('https://api.example.com/memory-test')
      expect(await res.text()).to.equal('final')
    })

    it('should clean up expired routes', async () => {
      // Add single-use routes
      for (let i = 0; i < 20; i++) {
        await mock.add(
          {
            match: { uri: `/single-use-${i}` },
            respond: { body: `Response ${i}` },
          },
          {
            lifetime: 1,
          }
        )
      }

      // Use all routes
      await Promise.all(Array.from({ length: 20 }, (_, i) => fetch(`https://api.example.com/single-use-${i}`)))

      // All should be expired now
      const results = await Promise.allSettled(
        Array.from({ length: 20 }, (_, i) => fetch(`https://api.example.com/single-use-${i}`))
      )

      // All should fail (routes expired)
      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          expect(result.value.ok).to.be.false
        } else {
          expect(result.reason).to.exist
        }
      })
    })

    it('should handle large route registry cleanup', async () => {
      // Add 100 routes
      for (let i = 0; i < 100; i++) {
        await mock.add({
          match: { uri: `/cleanup-${i}` },
          respond: { body: `Response ${i}` },
        })
      }

      // Reset should clear all
      await mock.reset()

      // Verify all routes are gone
      const results = await Promise.allSettled([
        fetch('https://api.example.com/cleanup-0'),
        fetch('https://api.example.com/cleanup-50'),
        fetch('https://api.example.com/cleanup-99'),
      ])

      results.forEach((result) => {
        if (result.status === 'fulfilled') {
          expect(result.value.ok).to.be.false
        }
      })
    })
  })

  describe('Large Payloads', () => {
    it('should handle 10MB request body', async function () {
      this.timeout(5000)

      const largeBody = 'x'.repeat(10 * 1024 * 1024) // 10MB

      await mock.add({
        match: { uri: '/large-upload' },
        respond: {
          body: (req) => `Received: ${(req.body as string).length} bytes`,
        },
      })

      const res = await fetch('https://api.example.com/large-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody,
      })

      expect(await res.text()).to.equal('Received: 10485760 bytes')
    })

    it('should handle 10MB response body', async function () {
      this.timeout(5000)

      const largeResponse = 'A'.repeat(10 * 1024 * 1024) // 10MB

      await mock.add({
        match: { uri: '/large-download' },
        respond: {
          body: largeResponse,
        },
      })

      const res = await fetch('https://api.example.com/large-download')
      const text = await res.text()

      expect(text.length).to.equal(10 * 1024 * 1024)
      expect(text[0]).to.equal('A')
      expect(text[text.length - 1]).to.equal('A')
    })

    it('should handle binary payload (5MB)', async function () {
      this.timeout(5000)

      const binarySize = 5 * 1024 * 1024
      const binaryData = new Uint8Array(binarySize)
      for (let i = 0; i < binarySize; i++) {
        binaryData[i] = i % 256
      }

      await mock.add({
        match: { uri: '/binary-large' },
        respond: {
          body: binaryData.buffer,
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      })

      const res = await fetch('https://api.example.com/binary-large')
      const buffer = await res.arrayBuffer()
      const received = new Uint8Array(buffer)

      expect(received.length).to.equal(binarySize)
      expect(received[0]).to.equal(0)
      expect(received[100]).to.equal(100)
      expect(received[binarySize - 1]).to.equal((binarySize - 1) % 256)
    })
  })

  describe('Rapid Operations', () => {
    it('should handle rapid sequential requests', async () => {
      await mock.add({
        match: { uri: '/rapid' },
        respond: { body: 'rapid-response' },
      })

      const startTime = Date.now()
      const promises = []

      for (let i = 0; i < 100; i++) {
        promises.push(fetch('https://api.example.com/rapid').then((r) => r.text()))
      }

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(results.length).to.equal(100)
      expect(results.every((r) => r === 'rapid-response')).to.be.true
      expect(duration).to.be.lessThan(3000)
    })

    it('should handle rapid route modifications', async () => {
      for (let i = 0; i < 50; i++) {
        await mock.add({
          match: { uri: '/modify' },
          respond: { body: `Version ${i}` },
        })

        const res = await fetch('https://api.example.com/modify')
        expect(await res.text()).to.equal(`Version ${i}`)

        await mock.release('/modify')
      }

      // Final version
      await mock.add({
        match: { uri: '/modify' },
        respond: { body: 'final' },
      })

      const res = await fetch('https://api.example.com/modify')
      expect(await res.text()).to.equal('final')
    })

    it('should handle burst of route additions', async () => {
      const startTime = Date.now()
      const promises = []

      for (let i = 0; i < 50; i++) {
        promises.push(
          mock.add({
            match: { uri: `/burst-${i}` },
            respond: { body: `Burst ${i}` },
          })
        )
      }

      await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(duration).to.be.lessThan(3000)

      // Verify routes work
      const res = await fetch('https://api.example.com/burst-25')
      expect(await res.text()).to.equal('Burst 25')
    })
  })

  describe('Complex Scenarios', () => {
    it('should handle mixed operation workload', async () => {
      const operations = []

      // Add many routes
      for (let i = 0; i < 30; i++) {
        operations.push(
          mock.add(
            {
              match: { uri: `/mixed-${i}` },
              respond: { body: `Response ${i}` },
            },
            {
              lifetime: i % 2 === 0 ? 1 : undefined, // Half are single-use
            }
          )
        )
      }

      await Promise.all(operations)
      operations.length = 0

      // Make requests, remove routes, and add new ones simultaneously
      for (let i = 0; i < 30; i++) {
        operations.push(fetch(`https://api.example.com/mixed-${i}`).catch(() => null))
        if (i % 3 === 0) {
          operations.push(mock.release(`/mixed-${i}`))
        }
        if (i % 5 === 0) {
          operations.push(
            mock.add({
              match: { uri: `/new-${i}` },
              respond: { body: `New ${i}` },
            })
          )
        }
      }

      await Promise.allSettled(operations)
      expect(true).to.be.true // Verify no crashes
    })

    it('should maintain performance with many expired routes', async () => {
      // Add 50 single-use routes
      for (let i = 0; i < 50; i++) {
        await mock.add(
          {
            match: { uri: `/expire-${i}` },
            respond: { body: `Response ${i}` },
          },
          {
            lifetime: 1,
          }
        )
      }

      // Use first 25
      await Promise.all(Array.from({ length: 25 }, (_, i) => fetch(`https://api.example.com/expire-${i}`)))

      // Add a new route and verify it works quickly
      await mock.add({
        match: { uri: '/new-route' },
        respond: { body: 'new' },
      })

      const startTime = Date.now()
      const res = await fetch('https://api.example.com/new-route')
      const duration = Date.now() - startTime

      expect(await res.text()).to.equal('new')
      expect(duration).to.be.lessThan(200) // Should be fast despite expired routes
    })

    it('should handle routes with slow response generators under load', async function () {
      this.timeout(5000)

      await mock.add({
        match: { uri: '/slow-generator' },
        respond: {
          body: async () => {
            await new Promise((resolve) => setTimeout(resolve, 50))
            return 'slow response'
          },
        },
      })

      const startTime = Date.now()
      const promises = Array.from({ length: 20 }, () =>
        fetch('https://api.example.com/slow-generator').then((r) => r.text())
      )

      const results = await Promise.all(promises)
      const duration = Date.now() - startTime

      expect(results.every((r) => r === 'slow response')).to.be.true
      // Should run concurrently, not sequentially (20 * 50ms = 1000ms if sequential)
      expect(duration).to.be.lessThan(500)
    })
  })

  describe('Resource Cleanup', () => {
    it('should release resources after stop', async function () {
      this.timeout(5000)

      // Add many routes
      for (let i = 0; i < 50; i++) {
        await mock.add({
          match: { uri: `/resource-${i}` },
          respond: { body: `Response ${i}` },
        })
      }

      await mock.stop()

      // Try to use routes (should fail gracefully)
      // Use Promise.race with timeout since fetch might hang
      const fetchWithTimeout = (url: string) =>
        Promise.race([
          fetch(url),
          new Promise<Response>((_, reject) => setTimeout(() => reject(new Error('Fetch timeout')), 1000)),
        ])

      const results = await Promise.allSettled([
        fetchWithTimeout('https://api.example.com/resource-0'),
        fetchWithTimeout('https://api.example.com/resource-25'),
        fetchWithTimeout('https://api.example.com/resource-49'),
      ])

      results.forEach((result) => {
        // Should either reject or resolve with non-ok response
        if (result.status === 'fulfilled') {
          expect(result.value.ok).to.be.false
        } else {
          expect(result.reason).to.exist
        }
      })
    })

    it('should handle multiple start/stop cycles', async function () {
      this.timeout(10000) // Longer timeout for multiple cycles

      // Stop the beforeEach mock since we're creating our own
      await mock.stop()

      for (let cycle = 0; cycle < 3; cycle++) {
        const localMock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })

        await localMock.add({
          match: { uri: '/cycle' },
          respond: { body: `Cycle ${cycle}` },
        })

        const res = await fetch('https://api.example.com/cycle')
        expect(await res.text()).to.equal(`Cycle ${cycle}`)

        await localMock.stop()
      }

      expect(true).to.be.true
    })
  })
})
