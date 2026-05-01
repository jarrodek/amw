/**
 * Core behavior tests: matching precedence, methods, headers, base handling, lifetime concurrency
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../src/index.js'

describe('Core Behavior', () => {
  let mock: MockHandler

  before(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
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

  it('newer overlapping pattern should take precedence (LIFO)', async () => {
    await mock.add({
      match: { uri: '/users/:id' },
      respond: { body: 'old-user' },
    })
    await mock.add({
      match: { uri: '/users/:id' },
      respond: { body: 'new-user' },
    })

    const res = await fetch('https://api.example.com/users/123')
    expect(await res.text()).to.equal('new-user')
  })

  it('pattern specificity: more specific path should match when added later', async () => {
    await mock.add({ match: { uri: '/users/:id' }, respond: { body: 'generic-user' } })
    await mock.add({ match: { uri: '/users/:id/details' }, respond: { body: 'user-details' } })

    const res1 = await fetch('https://api.example.com/users/123')
    expect(await res1.text()).to.equal('generic-user')

    const res2 = await fetch('https://api.example.com/users/123/details')
    expect(await res2.text()).to.equal('user-details')
  })

  it('method specificity: route restricted to POST should not intercept GET', async () => {
    await mock.add({
      match: { uri: '/action', methods: ['GET'] },
      respond: { body: 'GET-response' },
    })
    await mock.add({
      match: { uri: '/action', methods: ['POST'] },
      respond: { body: 'POST-response' },
    })

    // GET should see newest matching GET or fallback
    const getRes = await fetch('https://api.example.com/action')
    expect(await getRes.text()).to.equal('GET-response')

    // POST should hit POST-response
    const postRes = await fetch('https://api.example.com/action', { method: 'POST' })
    expect(await postRes.text()).to.equal('POST-response')
  })

  it('header specificity: route with header must only match when header present', async () => {
    await mock.add({ match: { uri: '/feature' }, respond: { body: 'no-header' } })
    await mock.add({ match: { uri: '/feature', headers: { 'X-Feature': 'on' } }, respond: { body: 'header-on' } })

    const res1 = await fetch('https://api.example.com/feature')
    expect(await res1.text()).to.equal('no-header')

    const res2 = await fetch('https://api.example.com/feature', { headers: { 'X-Feature': 'on' } })
    expect(await res2.text()).to.equal('header-on')
  })

  it('base mismatch: route with base should not match different host', async () => {
    await mock.add({ match: { uri: '/external' }, respond: { body: 'base-external' } })

    // Fetch to different host should not be intercepted by our SW
    // Since other.example.com is not a real endpoint, this will fail with network error
    // If SW incorrectly intercepted it, we'd get our mock response instead
    try {
      await fetch('https://other.example.com/external')
      // If fetch succeeds, something is wrong (either network reached or SW intercepted)
      expect.fail('Should have failed - either network error or SW should not intercept different host')
    } catch (error) {
      // Expected: network failure (TypeError with message like 'Failed to fetch' or 'Load failed')
      // NOT expected: our mock response would succeed
      expect(error).to.be.instanceOf(TypeError)
      // Different browsers use different error messages, just verify it's a TypeError
    }
  })

  it('lifetime concurrency: single-use mock should serve only one of concurrent requests', async () => {
    await mock.add({ match: { uri: '/once-concurrent' }, respond: { body: 'only-once' } }, { lifetime: 1 })

    const [a, b] = await Promise.allSettled([
      fetch('https://api.example.com/once-concurrent'),
      fetch('https://api.example.com/once-concurrent'),
    ])

    const texts = []
    for (const r of [a, b]) {
      if (r.status === 'fulfilled') {
        try {
          texts.push(await r.value.text())
        } catch {
          /* ignore */
        }
      }
    }

    // Exactly one response should be the mock body
    const mockCount = texts.filter((t) => t === 'only-once').length
    expect(mockCount).to.equal(1)
  })

  describe('Passthrough Strategy', () => {
    it('passthrough route should not intercept request', async () => {
      await mock.add({ match: { uri: '/pass' }, respond: { body: 'should-not-see' } }, { strategy: 'passthrough' })

      // Request should go to network and fail (no real endpoint)
      try {
        await fetch('https://api.example.com/pass')
        expect.fail('Should have failed with network error')
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError)
      }
    })

    it('passthrough consumes lifetime (falls back after expiration)', async () => {
      // Add fallback mock first
      await mock.add({ match: { uri: '/pass-life' }, respond: { body: 'fallback-mock' } }, { strategy: 'mock' })
      // Add passthrough with lifetime 1 on top
      await mock.add(
        { match: { uri: '/pass-life' }, respond: { body: 'ignored' } },
        { strategy: 'passthrough', lifetime: 1 }
      )

      // First request: passthrough is active, goes to network (fails)
      try {
        await fetch('https://api.example.com/pass-life')
        expect.fail('First request should fail (passthrough)')
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError)
      }

      // Second request: passthrough has expired (lifetime consumed), falls back to mock
      const res2 = await fetch('https://api.example.com/pass-life')
      expect(await res2.text()).to.equal('fallback-mock')

      // Third request: still using fallback mock
      const res3 = await fetch('https://api.example.com/pass-life')
      expect(await res3.text()).to.equal('fallback-mock')
    })

    it('mock should take precedence over passthrough when added later (LIFO)', async () => {
      await mock.add({ match: { uri: '/mixed' }, respond: { body: 'pass-body' } }, { strategy: 'passthrough' })
      await mock.add({ match: { uri: '/mixed' }, respond: { body: 'mock-body' } }, { strategy: 'mock' })

      const res = await fetch('https://api.example.com/mixed')
      expect(await res.text()).to.equal('mock-body')
    })

    it('passthrough should take precedence over mock when added later (LIFO)', async () => {
      await mock.add({ match: { uri: '/mixed2' }, respond: { body: 'mock-body' } }, { strategy: 'mock' })
      await mock.add({ match: { uri: '/mixed2' }, respond: { body: 'pass-body' } }, { strategy: 'passthrough' })

      // Newer passthrough should prevent interception
      try {
        await fetch('https://api.example.com/mixed2')
        expect.fail('Should have failed with network error')
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError)
      }
    })

    it('passthrough with method filter should only passthrough matching method', async () => {
      await mock.add(
        { match: { uri: '/method-pass', methods: ['GET'] }, respond: { body: 'ignored' } },
        { strategy: 'passthrough' }
      )
      await mock.add(
        { match: { uri: '/method-pass', methods: ['POST'] }, respond: { body: 'post-mock' } },
        { strategy: 'mock' }
      )

      // GET should passthrough (fail)
      try {
        await fetch('https://api.example.com/method-pass')
        expect.fail('GET should have failed with network error')
      } catch (error) {
        expect(error).to.be.instanceOf(TypeError)
      }

      // POST should be mocked
      const postRes = await fetch('https://api.example.com/method-pass', { method: 'POST' })
      expect(await postRes.text()).to.equal('post-mock')
    })
  })
})
