/**
 * Request/Response fidelity tests: special characters, encoding, large payloads, edge cases
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker, type MockHandler } from '../dist/index.js'

describe('Request/Response Fidelity', () => {
  let mock: MockHandler

  beforeEach(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js', base: 'https://api.example.com' })
  })

  afterEach(async () => {
    if (mock) {
      await mock.stop()
    }
  })

  describe('URL Parameters', () => {
    it('should handle URL params with special characters', async () => {
      await mock.add({
        match: { uri: '/items/:id' },
        respond: {
          body: (req) => `ID: ${req.params.id}`,
        },
      })

      const res = await fetch('https://api.example.com/items/item-123_test')
      expect(await res.text()).to.equal('ID: item-123_test')
    })

    it('should handle URL-encoded params', async () => {
      await mock.add({
        match: { uri: '/search/:query' },
        respond: {
          body: (req) => `Query: ${req.params.query}`,
        },
      })

      const res = await fetch('https://api.example.com/search/hello%20world')
      expect(await res.text()).to.equal('Query: hello%20world')
    })

    it('should handle unicode in URL params', async () => {
      await mock.add({
        match: { uri: '/unicode/:text' },
        respond: {
          body: (req) => `Text: ${req.params.text}`,
        },
      })

      const encoded = encodeURIComponent('你好世界')
      const res = await fetch(`https://api.example.com/unicode/${encoded}`)
      expect(await res.text()).to.equal(`Text: ${encoded}`)
    })
  })

  describe('Query Parameters', () => {
    it('should extract query parameters into req.query', async () => {
      await mock.add({
        match: { uri: '/query-test' },
        respond: {
          body: (req) => JSON.stringify(req.query),
        },
      })

      const res = await fetch('https://api.example.com/query-test?single=value&multiple=one&multiple=two')
      const query = await res.json()
      expect(query).to.deep.equal({
        single: 'value',
        multiple: ['one', 'two'],
      })
    })

    it('should ignore query parameters when matching routes', async () => {
      await mock.add({
        match: { uri: '/users/:id' },
        respond: {
          body: (req) => `User: ${req.params.id}`,
        },
      })

      const res = await fetch('https://api.example.com/users/123?foo=bar&baz=qux')
      expect(await res.text()).to.equal('User: 123')
    })

    it('should match routes with different query parameters', async () => {
      await mock.add({
        match: { uri: '/items' },
        respond: { body: 'items' },
      })

      const res1 = await fetch('https://api.example.com/items')
      expect(await res1.text()).to.equal('items')

      const res2 = await fetch('https://api.example.com/items?page=1')
      expect(await res2.text()).to.equal('items')

      const res3 = await fetch('https://api.example.com/items?page=2&limit=10')
      expect(await res3.text()).to.equal('items')
    })

    it('should match exact paths regardless of query string', async () => {
      await mock.add({
        match: { uri: '/search' },
        respond: { body: 'search-results' },
      })

      const res1 = await fetch('https://api.example.com/search?q=test')
      expect(await res1.text()).to.equal('search-results')

      const res2 = await fetch('https://api.example.com/search?q=another&filter=active')
      expect(await res2.text()).to.equal('search-results')
    })

    it('should handle query parameters with special characters', async () => {
      await mock.add({
        match: { uri: '/api/data' },
        respond: { body: 'data' },
      })

      const res = await fetch('https://api.example.com/api/data?name=John%20Doe&email=test%40example.com')
      expect(await res.text()).to.equal('data')
    })

    it('should match patterns with query parameters', async () => {
      await mock.add({
        match: { uri: '/posts/:id/comments' },
        respond: {
          body: (req) => `Comments for post ${req.params.id}`,
        },
      })

      const res = await fetch('https://api.example.com/posts/42/comments?sort=date&order=desc')
      expect(await res.text()).to.equal('Comments for post 42')
    })
  })

  describe('Request Body', () => {
    it('should handle empty request body', async () => {
      await mock.add({
        match: { uri: '/empty-body' },
        respond: {
          body: (req) => `Body: ${req.body === null ? 'null' : req.body}`,
        },
      })

      const res = await fetch('https://api.example.com/empty-body', {
        method: 'POST',
      })
      const text = await res.text()
      expect(text).to.satisfy((t: string) => t === 'Body: null' || t === 'Body: ')
    })

    it('should handle large request body (1MB)', async () => {
      const largeBody = 'x'.repeat(1024 * 1024) // 1MB
      await mock.add({
        match: { uri: '/large-request' },
        respond: {
          body: (req) => `Length: ${(req.body as string).length}`,
        },
      })

      const res = await fetch('https://api.example.com/large-request', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: largeBody,
      })
      expect(await res.text()).to.equal('Length: 1048576')
    })

    it('should handle JSON request body', async () => {
      await mock.add({
        match: { uri: '/json-echo' },
        respond: {
          body: (req) => req.body as string,
        },
      })

      const payload = { name: 'test', value: 42, nested: { key: 'value' } }
      const res = await fetch('https://api.example.com/json-echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const received = JSON.parse(await res.text())
      expect(received).to.deep.equal(payload)
    })

    it('should handle form-encoded request body', async () => {
      await mock.add({
        match: { uri: '/form-echo' },
        respond: {
          body: (req) => req.body as string,
        },
      })

      const formData = 'name=John+Doe&email=john%40example.com&age=30'
      const res = await fetch('https://api.example.com/form-echo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: formData,
      })
      expect(await res.text()).to.equal(formData)
    })

    it('should handle binary request body', async () => {
      const binaryData = new Uint8Array([0x00, 0x01, 0x02, 0xff, 0xfe])
      await mock.add({
        match: { uri: '/binary-upload' },
        respond: {
          body: (req) => {
            const buffer = req.body as ArrayBuffer
            return `Bytes: ${buffer.byteLength}`
          },
        },
      })

      const res = await fetch('https://api.example.com/binary-upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: binaryData.buffer,
      })
      expect(await res.text()).to.equal('Bytes: 5')
    })

    it('should handle unicode in request body', async () => {
      await mock.add({
        match: { uri: '/unicode-body' },
        respond: {
          body: (req) => req.body as string,
        },
      })

      const unicodeText = '你好世界 🌍 émojis'
      const res = await fetch('https://api.example.com/unicode-body', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        body: unicodeText,
      })
      expect(await res.text()).to.equal(unicodeText)
    })
  })

  describe('Response Body', () => {
    it('should handle empty response body with 204 status', async () => {
      await mock.add({
        match: { uri: '/no-content' },
        respond: {
          status: 204,
        },
      })

      const res = await fetch('https://api.example.com/no-content')
      expect(res.status).to.equal(204)
      const text = await res.text()
      expect(text).to.equal('')
    })

    it('should handle unicode in response body', async () => {
      const unicodeText = '你好世界 🚀 Привет мир'
      await mock.add({
        match: { uri: '/unicode-response' },
        respond: {
          body: unicodeText,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' },
        },
      })

      const res = await fetch('https://api.example.com/unicode-response')
      expect(await res.text()).to.equal(unicodeText)
    })

    it('should handle JSON response with special characters', async () => {
      const data = {
        message: 'Test "quotes" and \\backslashes\\',
        special: '<>&\'"',
        unicode: '你好',
      }
      await mock.add({
        match: { uri: '/json-special' },
        respond: {
          body: JSON.stringify(data),
          headers: { 'Content-Type': 'application/json' },
        },
      })

      const res = await fetch('https://api.example.com/json-special')
      const received = await res.json()
      expect(received).to.deep.equal(data)
    })

    it('should handle large response body (5MB)', async () => {
      const largeText = 'A'.repeat(5 * 1024 * 1024) // 5MB
      await mock.add({
        match: { uri: '/large-response' },
        respond: {
          body: largeText,
        },
      })

      const res = await fetch('https://api.example.com/large-response')
      const text = await res.text()
      expect(text.length).to.equal(5 * 1024 * 1024)
      expect(text[0]).to.equal('A')
      expect(text[text.length - 1]).to.equal('A')
    })

    it('should handle binary response with all byte values', async () => {
      const allBytes = new Uint8Array(256)
      for (let i = 0; i < 256; i++) {
        allBytes[i] = i
      }
      await mock.add({
        match: { uri: '/all-bytes' },
        respond: {
          body: allBytes.buffer,
          headers: { 'Content-Type': 'application/octet-stream' },
        },
      })

      const res = await fetch('https://api.example.com/all-bytes')
      const buffer = await res.arrayBuffer()
      const received = new Uint8Array(buffer)
      expect(received.length).to.equal(256)
      for (let i = 0; i < 256; i++) {
        expect(received[i]).to.equal(i)
      }
    })
  })

  describe('Headers', () => {
    it('should handle case-insensitive header matching', async () => {
      await mock.add({
        match: { uri: '/case-headers', headers: { 'X-Custom': 'value' } },
        respond: { body: 'matched' },
      })

      const res1 = await fetch('https://api.example.com/case-headers', {
        headers: { 'x-custom': 'value' }, // lowercase
      })
      expect(await res1.text()).to.equal('matched')

      const res2 = await fetch('https://api.example.com/case-headers', {
        headers: { 'X-CUSTOM': 'value' }, // uppercase
      })
      expect(await res2.text()).to.equal('matched')
    })

    it('should handle headers with special characters', async () => {
      await mock.add({
        match: { uri: '/special-headers' },
        respond: {
          body: (req) => req.headers['x-custom'] || 'missing',
        },
      })

      const res = await fetch('https://api.example.com/special-headers', {
        headers: { 'X-Custom': 'value-with-dashes_and_underscores.123' },
      })
      expect(await res.text()).to.equal('value-with-dashes_and_underscores.123')
    })

    it('should return custom response headers', async () => {
      await mock.add({
        match: { uri: '/custom-response-headers' },
        respond: {
          body: 'ok',
          headers: {
            'X-Custom-Header': 'custom-value',
            'X-Another': 'another-value',
          },
        },
      })

      const res = await fetch('https://api.example.com/custom-response-headers')
      expect(res.headers.get('x-custom-header')).to.equal('custom-value')
      expect(res.headers.get('x-another')).to.equal('another-value')
    })
  })

  describe('HTTP Status Codes', () => {
    it('should handle various success status codes', async () => {
      const statuses = [200, 201, 202, 204, 206]
      for (const status of statuses) {
        await mock.add({
          match: { uri: `/status-${status}` },
          respond: { body: status === 204 ? undefined : 'ok', status },
        })

        const res = await fetch(`https://api.example.com/status-${status}`)
        expect(res.status).to.equal(status)
      }
    })

    it('should handle various error status codes', async () => {
      const statuses = [400, 401, 403, 404, 409, 500, 502, 503]
      for (const status of statuses) {
        await mock.add({
          match: { uri: `/error-${status}` },
          respond: { body: 'error', status },
        })

        const res = await fetch(`https://api.example.com/error-${status}`)
        expect(res.status).to.equal(status)
      }
    })
  })
})
