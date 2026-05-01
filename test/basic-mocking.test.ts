/**
 * Basic mocking functionality tests
 */

import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../src/index.js'

describe('Basic Mocking', () => {
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

  it('should mock a simple GET request', async () => {
    await mock.add({
      match: { uri: '/users/123' },
      respond: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '123', name: 'John Doe' }),
      },
    })

    const response = await fetch('https://api.example.com/users/123')
    const data = await response.json()

    expect(response.status).to.equal(200)
    expect(data.id).to.equal('123')
    expect(data.name).to.equal('John Doe')
  })

  it('should support dynamic responses with closures', async () => {
    const localData = { id: '456', role: 'admin' }

    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        body: async (req) => {
          return JSON.stringify({
            ...localData,
            requestedId: req.params.id,
          })
        },
      },
    })

    const response = await fetch('https://api.example.com/users/999')
    const data = await response.json()

    expect(data.id).to.equal('456')
    expect(data.role).to.equal('admin')
    expect(data.requestedId).to.equal('999')
  })

  it('should match POST requests', async () => {
    await mock.add({
      match: {
        uri: '/users',
        methods: ['POST'],
      },
      respond: {
        status: 201,
        body: JSON.stringify({ id: 'new-id', created: true }),
      },
    })

    const response = await fetch('https://api.example.com/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'New User' }),
    })

    const data = await response.json()

    expect(response.status).to.equal(201)
    expect(data.id).to.equal('new-id')
    expect(data.created).to.be.true
  })

  it('should match specific headers', async () => {
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

    // Request with matching header
    const authorized = await fetch('https://api.example.com/protected', {
      headers: {
        authorization: 'Bearer secret-token',
      },
    })

    expect(authorized.status).to.equal(200)
    expect(await authorized.text()).to.equal('Authorized')

    // Request without header should go to network (and fail in test)
    try {
      await fetch('https://api.example.com/protected')
      // If it doesn't throw, the mock matched (shouldn't happen)
      expect.fail('Should not have matched without header')
    } catch (error) {
      // Expected - network request failed
      expect((error as Error).message).to.not.eq('Should not have matched without header')
    }
  })

  it('should pass request data to response generator', async () => {
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

    const response = await fetch('https://api.example.com/echo', {
      method: 'POST',
      headers: { 'x-custom': 'test-value' },
      body: 'test payload',
    })

    const data = await response.json()

    expect(data.method).to.equal('POST')
    expect(data.headers['x-custom']).to.equal('test-value')
    expect(data.body).to.equal('test payload')
  })
})
