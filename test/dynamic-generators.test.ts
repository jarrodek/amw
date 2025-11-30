/**
 * Dynamic response generator tests: errors, ArrayBuffer, async, request data access
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker } from '../dist/index.js'
import type { MockHandler } from '../src/index.js'

describe('Dynamic Response Generators', () => {
  let mock: MockHandler

  beforeEach(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
  })

  afterEach(async () => {
    if (mock) {
      await mock.stop()
    }
  })

  it('generator can access request URL params', async () => {
    await mock.add({
      match: { uri: '/users/:id/posts/:postId' },
      respond: {
        body: (req) => `User ${req.params.id}, Post ${req.params.postId}`,
      },
    })

    const res = await fetch('https://api.example.com/users/42/posts/99')
    expect(await res.text()).to.equal('User 42, Post 99')
  })

  it('generator can access request headers', async () => {
    await mock.add({
      match: { uri: '/auth' },
      respond: {
        body: (req) => `Token: ${req.headers.authorization || 'none'}`,
      },
    })

    const res = await fetch('https://api.example.com/auth', {
      headers: { Authorization: 'Bearer secret123' },
    })
    expect(await res.text()).to.equal('Token: Bearer secret123')
  })

  it('generator can access request method', async () => {
    await mock.add({
      match: { uri: '/echo-method' },
      respond: {
        body: (req) => `Method: ${req.method}`,
      },
    })

    const res1 = await fetch('https://api.example.com/echo-method')
    expect(await res1.text()).to.equal('Method: GET')

    const res2 = await fetch('https://api.example.com/echo-method', { method: 'POST' })
    expect(await res2.text()).to.equal('Method: POST')
  })

  it('generator can access request body', async () => {
    await mock.add({
      match: { uri: '/echo-body' },
      respond: {
        body: (req) => `Received: ${req.body}`,
      },
    })

    const res = await fetch('https://api.example.com/echo-body', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'hello' }),
    })
    expect(await res.text()).to.equal('Received: {"message":"hello"}')
  })

  it('async generator should work', async () => {
    await mock.add({
      match: { uri: '/async' },
      respond: {
        body: async (req) => {
          await new Promise((r) => setTimeout(r, 10))
          return `Async result for ${req.params.id || 'default'}`
        },
      },
    })

    const res = await fetch('https://api.example.com/async')
    expect(await res.text()).to.equal('Async result for default')
  })

  it('generator returning ArrayBuffer should work', async () => {
    const binaryData = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]) // PNG header
    await mock.add({
      match: { uri: '/binary' },
      respond: {
        body: () => binaryData.buffer,
        headers: { 'Content-Type': 'image/png' },
      },
    })

    const res = await fetch('https://api.example.com/binary')
    const buffer = await res.arrayBuffer()
    const received = new Uint8Array(buffer)
    expect(received).to.deep.equal(binaryData)
  })

  it('generator returning null body should work', async () => {
    await mock.add({
      match: { uri: '/no-body' },
      respond: {
        body: () => null,
        status: 204,
      },
    })

    const res = await fetch('https://api.example.com/no-body')
    expect(res.status).to.equal(204)
    const text = await res.text()
    expect(text).to.equal('')
  })

  it('generator throwing sync error should return 500', async () => {
    await mock.add({
      match: { uri: '/sync-error' },
      respond: {
        body: () => {
          throw new Error('Sync error in generator')
        },
      },
    })

    const res = await fetch('https://api.example.com/sync-error')
    expect(res.status).to.equal(500)
  })

  it('generator throwing async error should return 500', async () => {
    await mock.add({
      match: { uri: '/async-error' },
      respond: {
        body: async () => {
          await new Promise((r) => setTimeout(r, 5))
          throw new Error('Async error in generator')
        },
      },
    })

    const res = await fetch('https://api.example.com/async-error')
    expect(res.status).to.equal(500)
  })

  it('generator can return large text response', async () => {
    const largeText = 'x'.repeat(100000) // 100KB
    await mock.add({
      match: { uri: '/large-text' },
      respond: {
        body: () => largeText,
      },
    })

    const res = await fetch('https://api.example.com/large-text')
    const text = await res.text()
    expect(text.length).to.equal(100000)
    expect(text).to.equal(largeText)
  })

  it('generator can return large binary response', async () => {
    const largeBuffer = new Uint8Array(100000).fill(0xab) // 100KB
    await mock.add({
      match: { uri: '/large-binary' },
      respond: {
        body: () => largeBuffer.buffer,
      },
    })

    const res = await fetch('https://api.example.com/large-binary')
    const buffer = await res.arrayBuffer()
    expect(buffer.byteLength).to.equal(100000)
    const received = new Uint8Array(buffer)
    expect(received[0]).to.equal(0xab)
    expect(received[50000]).to.equal(0xab)
  })

  it('generator can conditionally return different responses', async () => {
    await mock.add({
      match: { uri: '/conditional/:type' },
      respond: {
        body: (req) => {
          if (req.params.type === 'json') {
            return JSON.stringify({ type: 'json' })
          } else if (req.params.type === 'text') {
            return 'plain text'
          }
          return 'unknown'
        },
      },
    })

    const res1 = await fetch('https://api.example.com/conditional/json')
    expect(await res1.text()).to.equal('{"type":"json"}')

    const res2 = await fetch('https://api.example.com/conditional/text')
    expect(await res2.text()).to.equal('plain text')

    const res3 = await fetch('https://api.example.com/conditional/other')
    expect(await res3.text()).to.equal('unknown')
  })
})
