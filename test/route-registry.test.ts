/**
 * Unit tests for RouteRegistry
 */
import { expect } from '@esm-bundle/chai'
import { RouteRegistry } from '../dist/main/RouteRegistry.js'
import { DEFAULT_STATUS } from '../dist/shared/constants.js'
import type { SerializedRequest, ResponseGenerator } from '../dist/types/index.js'

function makeRequest(overrides: Partial<SerializedRequest> = {}): SerializedRequest {
  return {
    url: 'https://api.example.com/users/123',
    method: 'GET',
    headers: { 'content-type': 'application/json' },
    body: null,
    params: { id: '123' },
    ...overrides,
  }
}

describe('RouteRegistry', () => {
  let registry: RouteRegistry

  beforeEach(() => {
    registry = new RouteRegistry()
  })

  it('register() should add a generator and count() reflects it', () => {
    expect(registry.count()).to.equal(0)
    registry.register('route-1', { body: 'hello' })
    expect(registry.count()).to.equal(1)
  })

  it('execute() should return static body and default status when status not provided', async () => {
    registry.register('r1', { body: 'static-response' })
    const res = await registry.execute('r1', makeRequest())
    expect(res.status).to.equal(DEFAULT_STATUS)
    expect(res.body).to.equal('static-response')
    expect(res.headers).to.deep.equal({})
  })

  it('execute() should return explicit status and headers', async () => {
    registry.register('r2', { body: 'ok', status: 201, headers: { 'x-test': 'yes' } })
    const res = await registry.execute('r2', makeRequest())
    expect(res.status).to.equal(201)
    expect(res.headers).to.deep.equal({ 'x-test': 'yes' })
    expect(res.body).to.equal('ok')
  })

  it('execute() should call dynamic body function with SerializedRequest', async () => {
    let received: SerializedRequest | null = null
    const gen: ResponseGenerator = {
      body: (req) => {
        received = req
        return `user:${req.params.id}`
      },
    }
    registry.register('dyn', gen)
    const req = makeRequest()
    const res = await registry.execute('dyn', req)
    expect(received).to.equal(req)
    expect(res.body).to.equal('user:123')
  })

  it('execute() supports async body function', async () => {
    registry.register('async', {
      body: async (req) => {
        await new Promise((r) => setTimeout(r, 5))
        return `async:${req.method}`
      },
    })
    const res = await registry.execute('async', makeRequest({ method: 'POST' }))
    expect(res.body).to.equal('async:POST')
  })

  it('execute() returns error structure when generator.error set', async () => {
    registry.register('err', { error: 'network' })
    const res = await registry.execute('err', makeRequest())
    expect(res.status).to.equal(0)
    expect(res.body).to.equal(null)
    expect(res.error).to.equal('network')
    expect(res.headers).to.deep.equal({})
  })

  it('remove() should delete a generator', async () => {
    registry.register('a', { body: 'one' })
    registry.register('b', { body: 'two' })
    expect(registry.count()).to.equal(2)
    registry.remove('a')
    expect(registry.count()).to.equal(1)
    // executing removed should throw
    try {
      await registry.execute('a', makeRequest())
      expect.fail('Expected execute to throw for removed route')
    } catch (err) {
      expect((err as Error).message).to.include('No generator found for route ID: a')
    }
  })

  it('reset() should clear all generators', () => {
    registry.register('a', { body: 'one' })
    registry.register('b', { body: 'two' })
    expect(registry.count()).to.equal(2)
    registry.reset()
    expect(registry.count()).to.equal(0)
  })

  it('execute() should throw when id not registered', async () => {
    try {
      await registry.execute('missing', makeRequest())
      expect.fail('Expected execute to throw for missing route')
    } catch (err) {
      expect((err as Error).message).to.include('No generator found for route ID: missing')
    }
  })
})
