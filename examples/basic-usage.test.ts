/**
 * Example usage of AMW in a test suite
 */

import { setupWorker, type MockHandler } from '@jarrodek/amw'

let mock: MockHandler

// Setup once for all tests
beforeAll(async () => {
  mock = await setupWorker({
    // Defaults to `@jarrodek/amw/sw`
    swPath: '/amw-sw.js',
    base: 'https://api.example.com/v1',
  })
})

// Cleanup after all tests
afterAll(async () => {
  await mock.stop()
})

// Reset between tests
afterEach(() => {
  mock.reset()
})

describe('User API', () => {
  it('mocks a simple GET request', async () => {
    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '123', name: 'John Doe' }),
      },
    })

    const res = await fetch('https://api.example.com/v1/users/123')
    const data = await res.json()

    expect(data.name).toBe('John Doe')
  })

  it('uses closure variables', async () => {
    const testUser = { id: '456', name: 'Jane Smith' }

    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        body: async (req) => {
          // Access test scope variables!
          return JSON.stringify({
            ...testUser,
            requestedId: req.params.id,
          })
        },
      },
    })

    const res = await fetch('https://api.example.com/v1/users/999')
    const data = await res.json()

    expect(data.id).toBe('456') // From closure
    expect(data.requestedId).toBe('999') // From URL
  })

  it('matches specific methods', async () => {
    await mock.add({
      match: {
        uri: '/users',
        methods: ['POST'],
      },
      respond: {
        status: 201,
        body: JSON.stringify({ id: 'new-user' }),
      },
    })

    const res = await fetch('https://api.example.com/v1/users', {
      method: 'POST',
      body: JSON.stringify({ name: 'New User' }),
    })

    expect(res.status).toBe(201)
  })

  it('matches specific headers', async () => {
    await mock.add({
      match: {
        uri: '/protected',
        headers: {
          authorization: 'Bearer secret-token',
        },
      },
      respond: {
        status: 200,
        body: 'Authorized',
      },
    })

    const res = await fetch('https://api.example.com/v1/protected', {
      headers: {
        authorization: 'Bearer secret-token',
      },
    })

    expect(res.status).toBe(200)
    expect(await res.text()).toBe('Authorized')
  })

  it('handles transient mocks', async () => {
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
    ) // Expires after 2 uses

    const res1 = await fetch('https://api.example.com/v1/one-time')
    expect(await res1.text()).toBe('Call 1')

    const res2 = await fetch('https://api.example.com/v1/one-time')
    expect(await res2.text()).toBe('Call 2')

    // Third call goes to network (will fail in test environment)
    try {
      await fetch('https://api.example.com/v1/one-time')
    } catch (error) {
      expect(error).toBeDefined() // Network error
    }
  })

  it('simulates network errors', async () => {
    await mock.add({
      match: { uri: '/error' },
      respond: {
        error: 'network',
      },
    })

    try {
      await fetch('https://api.example.com/v1/error')
      fail('Should have thrown')
    } catch (error) {
      expect(error).toBeDefined()
    }
  })

  it('handles binary data', async () => {
    const imageBuffer = new ArrayBuffer(1024)

    await mock.add({
      match: { uri: '/images/:id' },
      respond: {
        status: 200,
        headers: { 'content-type': 'image/png' },
        body: imageBuffer,
      },
    })

    const res = await fetch('https://api.example.com/v1/images/123')
    const buffer = await res.arrayBuffer()

    expect(buffer.byteLength).toBe(1024)
  })

  it('accesses request data', async () => {
    await mock.add({
      match: { uri: '/echo' },
      respond: {
        body: async (req) => {
          return JSON.stringify({
            url: req.url,
            method: req.method,
            headers: req.headers,
            body: req.body,
          })
        },
      },
    })

    const res = await fetch('https://api.example.com/v1/echo', {
      method: 'POST',
      headers: { 'x-custom': 'value' },
      body: 'test payload',
    })

    const data = await res.json()
    expect(data.method).toBe('POST')
    expect(data.headers['x-custom']).toBe('value')
    expect(data.body).toBe('test payload')
  })
})

describe('LIFO Routing', () => {
  it('uses most recent mock first', async () => {
    // First mock
    await mock.add({
      match: { uri: '/users/:id' },
      respond: { body: 'Old mock' },
    })

    // Second mock (takes precedence)
    await mock.add({
      match: { uri: '/users/:id' },
      respond: { body: 'New mock' },
    })

    const res = await fetch('https://api.example.com/v1/users/123')
    expect(await res.text()).toBe('New mock')
  })
})

describe('Cleanup', () => {
  it('releases specific routes', async () => {
    await mock.add({
      match: { uri: '/route1' },
      respond: { body: 'Route 1' },
    })

    await mock.add({
      match: { uri: '/route2' },
      respond: { body: 'Route 2' },
    })

    await mock.release('/route1')

    // route2 still works
    const res = await fetch('https://api.example.com/v1/route2')
    expect(await res.text()).toBe('Route 2')
  })

  it('releases by matcher', async () => {
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

    await mock.releaseMatch({
      uri: '/api',
      methods: ['GET'],
    })

    // POST still works
    const res = await fetch('https://api.example.com/v1/api', {
      method: 'POST',
    })
    expect(await res.text()).toBe('POST')
  })
})
