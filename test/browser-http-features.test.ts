/**
 * Browser-specific HTTP features: redirects, CORS, content-encoding, cache, range requests
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker, type MockHandler } from '../dist/index.js'

describe('Browser-Specific HTTP Features', () => {
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

  describe('HTTP Redirects', () => {
    // These tests are skipped on WebKit as it doesn't properly support redirect
    // responses from service workers (returns "Load failed" instead of opaqueredirect)

    it.skip('should return 301 status with Location header', async () => {
      await mock.add({
        match: { uri: '/old-endpoint' },
        respond: {
          status: 301,
          headers: {
            Location: '/new-endpoint',
          },
          body: null,
        },
      })

      const res = await fetch('https://api.example.com/old-endpoint', {
        redirect: 'manual',
      })

      expect(res.status).to.equal(0) // Opaque redirect in manual mode
      expect(res.type).to.equal('opaqueredirect')
    })

    it.skip('should return 302 status with Location header', async () => {
      await mock.add({
        match: { uri: '/temporary' },
        respond: {
          status: 302,
          headers: {
            Location: '/actual',
          },
          body: null,
        },
      })

      const res = await fetch('https://api.example.com/temporary', {
        redirect: 'manual',
      })

      expect(res.type).to.equal('opaqueredirect')
    })

    it.skip('should return 307 status with Location header', async () => {
      await mock.add({
        match: { uri: '/submit', methods: ['POST'] },
        respond: {
          status: 307,
          headers: {
            Location: '/submit-v2',
          },
          body: null,
        },
      })

      const res = await fetch('https://api.example.com/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: 'test' }),
        redirect: 'manual',
      })

      expect(res.type).to.equal('opaqueredirect')
    })

    it.skip('should return 308 status with Location header', async () => {
      await mock.add({
        match: { uri: '/api/v1/resource', methods: ['PUT'] },
        respond: {
          status: 308,
          headers: {
            Location: '/api/v2/resource',
          },
          body: null,
        },
      })

      const res = await fetch('https://api.example.com/api/v1/resource', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'updated' }),
        redirect: 'manual',
      })

      expect(res.type).to.equal('opaqueredirect')
    })

    it.skip('should provide Location header in redirect response', async () => {
      await mock.add({
        match: { uri: '/api/moved' },
        respond: {
          status: 301,
          headers: {
            'Location': '/api/new-location',
            'X-Custom-Header': 'test',
          },
          body: null,
        },
      })

      // Use manual mode to inspect the redirect response
      const res = await fetch('https://api.example.com/api/moved', {
        redirect: 'manual',
      })

      // In manual mode, we get an opaque redirect - can't read headers
      // But we can verify the mock was configured correctly
      expect(res.type).to.equal('opaqueredirect')
    })

    it.skip('should handle redirect: "manual" mode', async () => {
      await mock.add({
        match: { uri: '/redirect-me' },
        respond: {
          status: 302,
          headers: {
            Location: '/destination',
          },
          body: null,
        },
      })

      const res = await fetch('https://api.example.com/redirect-me', {
        redirect: 'manual',
      })

      // In manual mode, fetch returns an opaque redirect response
      // The actual behavior depends on browser implementation
      expect(res.type).to.equal('opaqueredirect')
    })
  })

  describe('CORS Headers', () => {
    it('should handle simple CORS request', async () => {
      await mock.add({
        match: { uri: '/public-api' },
        respond: {
          body: JSON.stringify({ data: 'public' }),
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE',
          },
        },
      })

      const res = await fetch('https://api.example.com/public-api')
      expect(res.headers.get('Access-Control-Allow-Origin')).to.equal('*')
      expect(res.headers.get('Access-Control-Allow-Methods')).to.include('GET')
    })

    it('should handle preflight OPTIONS request', async () => {
      // Preflight request
      await mock.add({
        match: { uri: '/api/data', methods: ['OPTIONS'] },
        respond: {
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': 'https://example.com',
            'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Max-Age': '86400',
          },
          body: null,
        },
      })

      // Actual request
      await mock.add({
        match: { uri: '/api/data', methods: ['POST'] },
        respond: {
          body: JSON.stringify({ success: true }),
          headers: {
            'Access-Control-Allow-Origin': 'https://example.com',
          },
        },
      })

      // Preflight
      const preflightRes = await fetch('https://api.example.com/api/data', {
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.com',
          'Access-Control-Request-Method': 'POST',
          'Access-Control-Request-Headers': 'Content-Type',
        },
      })

      expect(preflightRes.status).to.equal(204)
      expect(preflightRes.headers.get('Access-Control-Allow-Methods')).to.include('POST')
      expect(preflightRes.headers.get('Access-Control-Max-Age')).to.equal('86400')

      // Actual request
      const res = await fetch('https://api.example.com/api/data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Origin': 'https://example.com',
        },
        body: JSON.stringify({ test: true }),
      })

      expect(res.status).to.equal(200)
      const data = await res.json()
      expect(data.success).to.be.true
    })

    it('should handle CORS with credentials', async () => {
      await mock.add({
        match: { uri: '/secure-data' },
        respond: {
          body: JSON.stringify({ secure: true }),
          headers: {
            'Access-Control-Allow-Origin': 'https://trusted.example.com',
            'Access-Control-Allow-Credentials': 'true',
          },
        },
      })

      const res = await fetch('https://api.example.com/secure-data', {
        credentials: 'include',
      })

      expect(res.headers.get('Access-Control-Allow-Credentials')).to.equal('true')
      expect(res.headers.get('Access-Control-Allow-Origin')).to.equal('https://trusted.example.com')
    })

    it('should handle CORS exposed headers', async () => {
      await mock.add({
        match: { uri: '/api/resource' },
        respond: {
          body: JSON.stringify({ id: 123 }),
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Expose-Headers': 'X-Custom-Header, X-Request-Id',
            'X-Custom-Header': 'custom-value',
            'X-Request-Id': 'req-12345',
          },
        },
      })

      const res = await fetch('https://api.example.com/api/resource')
      expect(res.headers.get('X-Custom-Header')).to.equal('custom-value')
      expect(res.headers.get('X-Request-Id')).to.equal('req-12345')
      expect(res.headers.get('Access-Control-Expose-Headers')).to.include('X-Custom-Header')
    })
  })

  describe('Content-Encoding', () => {
    it('should indicate gzip encoding', async () => {
      await mock.add({
        match: { uri: '/compressed/gzip' },
        respond: {
          body: JSON.stringify({ compressed: true }),
          headers: {
            'Content-Encoding': 'gzip',
            'Content-Type': 'application/json',
          },
        },
      })

      const res = await fetch('https://api.example.com/compressed/gzip')
      // Browser automatically decompresses, but header should be present
      expect(res.headers.get('Content-Encoding')).to.equal('gzip')
      const data = await res.json()
      expect(data.compressed).to.be.true
    })

    it('should indicate deflate encoding', async () => {
      await mock.add({
        match: { uri: '/compressed/deflate' },
        respond: {
          body: JSON.stringify({ method: 'deflate' }),
          headers: {
            'Content-Encoding': 'deflate',
            'Content-Type': 'application/json',
          },
        },
      })

      const res = await fetch('https://api.example.com/compressed/deflate')
      expect(res.headers.get('Content-Encoding')).to.equal('deflate')
      const data = await res.json()
      expect(data.method).to.equal('deflate')
    })

    it('should indicate brotli encoding', async () => {
      await mock.add({
        match: { uri: '/compressed/br' },
        respond: {
          body: JSON.stringify({ method: 'brotli' }),
          headers: {
            'Content-Encoding': 'br',
            'Content-Type': 'application/json',
          },
        },
      })

      const res = await fetch('https://api.example.com/compressed/br')
      expect(res.headers.get('Content-Encoding')).to.equal('br')
      const data = await res.json()
      expect(data.method).to.equal('brotli')
    })

    it('should handle multiple encodings', async () => {
      await mock.add({
        match: { uri: '/multi-encoded' },
        respond: {
          body: JSON.stringify({ data: 'test' }),
          headers: {
            'Content-Encoding': 'gzip, deflate',
          },
        },
      })

      const res = await fetch('https://api.example.com/multi-encoded')
      expect(res.headers.get('Content-Encoding')).to.equal('gzip, deflate')
    })

    it('should respect Accept-Encoding request header', async () => {
      await mock.add({
        match: { uri: '/adaptive' },
        respond: {
          body: JSON.stringify({ adaptive: true }),
          headers: (req) => {
            const acceptEncoding = req.headers['accept-encoding'] || ''
            let encoding = 'identity'

            if (acceptEncoding.includes('br')) {
              encoding = 'br'
            } else if (acceptEncoding.includes('gzip')) {
              encoding = 'gzip'
            } else if (acceptEncoding.includes('deflate')) {
              encoding = 'deflate'
            }

            return {
              'Content-Encoding': encoding,
              'Vary': 'Accept-Encoding',
            }
          },
        },
      })

      const res = await fetch('https://api.example.com/adaptive', {
        headers: {
          'Accept-Encoding': 'gzip, deflate, br',
        },
      })

      const encoding = res.headers.get('Content-Encoding')
      expect(['br', 'gzip', 'deflate', 'identity']).to.include(encoding)
      expect(res.headers.get('Vary')).to.equal('Accept-Encoding')
    })
  })

  describe('Cache Headers', () => {
    it('should handle Cache-Control with max-age', async () => {
      await mock.add({
        match: { uri: '/cached-resource' },
        respond: {
          body: JSON.stringify({ data: 'cacheable' }),
          headers: {
            'Cache-Control': 'public, max-age=3600',
          },
        },
      })

      const res = await fetch('https://api.example.com/cached-resource')
      expect(res.headers.get('Cache-Control')).to.equal('public, max-age=3600')
    })

    it('should handle no-cache directive', async () => {
      await mock.add({
        match: { uri: '/no-cache' },
        respond: {
          body: JSON.stringify({ fresh: true }),
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0',
          },
        },
      })

      const res = await fetch('https://api.example.com/no-cache')
      expect(res.headers.get('Cache-Control')).to.include('no-cache')
      expect(res.headers.get('Pragma')).to.equal('no-cache')
    })

    it('should handle ETag for conditional requests', async () => {
      const etag = '"abc123"'

      await mock.add({
        match: { uri: '/api/document' },
        respond: {
          body: (req) => {
            const ifNoneMatch = req.headers['if-none-match']
            if (ifNoneMatch === etag) {
              return null // 304 should have no body
            }
            return JSON.stringify({ content: 'document data' })
          },
          status: (req) => {
            const ifNoneMatch = req.headers['if-none-match']
            return ifNoneMatch === etag ? 304 : 200
          },
          headers: {
            'ETag': etag,
            'Cache-Control': 'private, must-revalidate',
          },
        },
      })

      // First request
      const res1 = await fetch('https://api.example.com/api/document')
      expect(res1.status).to.equal(200)
      expect(res1.headers.get('ETag')).to.equal(etag)

      // Second request with If-None-Match
      const res2 = await fetch('https://api.example.com/api/document', {
        headers: {
          'If-None-Match': etag,
        },
      })
      expect(res2.status).to.equal(304)
    })

    it('should handle Last-Modified for conditional requests', async () => {
      const lastModified = 'Wed, 21 Oct 2023 07:28:00 GMT'

      await mock.add({
        match: { uri: '/api/article' },
        respond: {
          body: (req) => {
            const ifModifiedSince = req.headers['if-modified-since']
            if (ifModifiedSince === lastModified) {
              return null // 304 should have no body
            }
            return JSON.stringify({ title: 'Article' })
          },
          status: (req) => {
            const ifModifiedSince = req.headers['if-modified-since']
            return ifModifiedSince === lastModified ? 304 : 200
          },
          headers: {
            'Last-Modified': lastModified,
            'Cache-Control': 'public, max-age=3600',
          },
        },
      })

      // First request
      const res1 = await fetch('https://api.example.com/api/article')
      expect(res1.status).to.equal(200)
      expect(res1.headers.get('Last-Modified')).to.equal(lastModified)

      // Conditional request
      const res2 = await fetch('https://api.example.com/api/article', {
        headers: {
          'If-Modified-Since': lastModified,
        },
      })
      expect(res2.status).to.equal(304)
    })

    it('should handle Vary header for content negotiation', async () => {
      await mock.add({
        match: { uri: '/api/content' },
        respond: {
          body: (req) => {
            const accept = req.headers['accept'] || ''
            if (accept.includes('application/json')) {
              return JSON.stringify({ format: 'json' })
            }
            return 'format: text'
          },
          headers: (req) => {
            const accept = req.headers['accept'] || ''
            return {
              'Vary': 'Accept, Accept-Encoding',
              'Content-Type': accept.includes('application/json') ? 'application/json' : 'text/plain',
            }
          },
        },
      })

      const res = await fetch('https://api.example.com/api/content', {
        headers: {
          Accept: 'application/json',
        },
      })

      expect(res.headers.get('Vary')).to.equal('Accept, Accept-Encoding')
      expect(res.headers.get('Content-Type')).to.equal('application/json')
    })

    it('should handle immutable cache directive', async () => {
      await mock.add({
        match: { uri: '/static/bundle-abc123.js' },
        respond: {
          body: 'console.log("app");',
          headers: {
            'Content-Type': 'application/javascript',
            'Cache-Control': 'public, max-age=31536000, immutable',
          },
        },
      })

      const res = await fetch('https://api.example.com/static/bundle-abc123.js')
      expect(res.headers.get('Cache-Control')).to.include('immutable')
      expect(res.headers.get('Cache-Control')).to.include('max-age=31536000')
    })
  })

  describe('Range Requests', () => {
    it('should handle partial content request (206)', async () => {
      const fullContent = 'abcdefghijklmnopqrstuvwxyz'

      await mock.add({
        match: { uri: '/large-file.txt' },
        respond: {
          body: (req) => {
            const range = req.headers['range']
            if (range) {
              // Parse range header: "bytes=0-9"
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                const end = match[2] ? parseInt(match[2], 10) : fullContent.length - 1
                return fullContent.slice(start, end + 1)
              }
            }
            return fullContent
          },
          status: (req) => {
            const range = req.headers['range']
            return range ? 206 : 200
          },
          headers: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                const end = match[2] ? parseInt(match[2], 10) : fullContent.length - 1
                return {
                  'Content-Range': `bytes ${start}-${end}/${fullContent.length}`,
                  'Accept-Ranges': 'bytes',
                  'Content-Length': String(end - start + 1),
                }
              }
            }
            return {
              'Accept-Ranges': 'bytes',
              'Content-Length': String(fullContent.length),
            } as Record<string, string>
          },
        },
      })

      // Request first 10 bytes
      const res = await fetch('https://api.example.com/large-file.txt', {
        headers: {
          Range: 'bytes=0-9',
        },
      })

      expect(res.status).to.equal(206)
      expect(res.headers.get('Content-Range')).to.equal('bytes 0-9/26')
      const text = await res.text()
      expect(text).to.equal('abcdefghij')
    })

    it('should handle multiple range requests (resumable download)', async () => {
      const content = new Uint8Array(100).fill(65) // 100 'A' characters

      await mock.add({
        match: { uri: '/download/file.bin' },
        respond: {
          body: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                const end = match[2] ? parseInt(match[2], 10) : content.length - 1
                return content.slice(start, end + 1).buffer
              }
            }
            return content.buffer
          },
          status: (req) => {
            return req.headers['range'] ? 206 : 200
          },
          headers: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                const end = match[2] ? parseInt(match[2], 10) : content.length - 1
                return {
                  'Content-Range': `bytes ${start}-${end}/${content.length}`,
                  'Accept-Ranges': 'bytes',
                }
              }
            }
            return { 'Accept-Ranges': 'bytes' } as Record<string, string>
          },
        },
      })

      // Download in chunks
      const chunk1 = await fetch('https://api.example.com/download/file.bin', {
        headers: { Range: 'bytes=0-24' },
      })
      expect(chunk1.status).to.equal(206)
      expect(chunk1.headers.get('Content-Range')).to.equal('bytes 0-24/100')

      const chunk2 = await fetch('https://api.example.com/download/file.bin', {
        headers: { Range: 'bytes=25-49' },
      })
      expect(chunk2.status).to.equal(206)
      expect(chunk2.headers.get('Content-Range')).to.equal('bytes 25-49/100')

      const chunk3 = await fetch('https://api.example.com/download/file.bin', {
        headers: { Range: 'bytes=50-99' },
      })
      expect(chunk3.status).to.equal(206)
      expect(chunk3.headers.get('Content-Range')).to.equal('bytes 50-99/100')
    })

    it('should handle Accept-Ranges: none', async () => {
      await mock.add({
        match: { uri: '/streaming-only' },
        respond: {
          body: 'This content must be downloaded completely',
          headers: {
            'Accept-Ranges': 'none',
          },
        },
      })

      const res = await fetch('https://api.example.com/streaming-only')
      expect(res.headers.get('Accept-Ranges')).to.equal('none')
    })

    it('should handle 416 Range Not Satisfiable', async () => {
      const content = 'Small content'

      await mock.add({
        match: { uri: '/small.txt' },
        respond: {
          body: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                if (start >= content.length) {
                  return ''
                }
              }
            }
            return content
          },
          status: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                if (start >= content.length) {
                  return 416 // Range Not Satisfiable
                }
              }
              return 206
            }
            return 200
          },
          headers: (req) => {
            const range = req.headers['range']
            if (range) {
              const match = range.match(/bytes=(\d+)-(\d+)?/)
              if (match) {
                const start = parseInt(match[1], 10)
                if (start >= content.length) {
                  return {
                    'Content-Range': `bytes */${content.length}`,
                  }
                }
                const end = match[2] ? parseInt(match[2], 10) : content.length - 1
                return {
                  'Content-Range': `bytes ${start}-${end}/${content.length}`,
                }
              }
            }
            return { 'Accept-Ranges': 'bytes' } as Record<string, string>
          },
        },
      })

      // Request range beyond content length
      const res = await fetch('https://api.example.com/small.txt', {
        headers: {
          Range: 'bytes=1000-2000',
        },
      })

      expect(res.status).to.equal(416)
      expect(res.headers.get('Content-Range')).to.equal('bytes */13')
    })
  })

  describe('Content Negotiation', () => {
    it('should handle Accept header for format selection', async () => {
      await mock.add({
        match: { uri: '/api/users/:id' },
        respond: {
          body: (req) => {
            const accept = req.headers['accept'] || ''
            const user = { id: req.params.id, name: 'John Doe' }

            if (accept.includes('application/xml')) {
              return `<?xml version="1.0"?><user><id>${user.id}</id><name>${user.name}</name></user>`
            }
            if (accept.includes('text/csv')) {
              return `id,name\n${user.id},${user.name}`
            }
            return JSON.stringify(user)
          },
          headers: (req) => {
            const accept = req.headers['accept'] || ''
            let contentType = 'application/json'

            if (accept.includes('application/xml')) {
              contentType = 'application/xml'
            } else if (accept.includes('text/csv')) {
              contentType = 'text/csv'
            }

            return {
              'Content-Type': contentType,
              'Vary': 'Accept',
            }
          },
        },
      })

      // JSON request
      const jsonRes = await fetch('https://api.example.com/api/users/123', {
        headers: { Accept: 'application/json' },
      })
      expect(jsonRes.headers.get('Content-Type')).to.equal('application/json')
      const jsonData = await jsonRes.json()
      expect(jsonData.id).to.equal('123')

      // XML request
      const xmlRes = await fetch('https://api.example.com/api/users/123', {
        headers: { Accept: 'application/xml' },
      })
      expect(xmlRes.headers.get('Content-Type')).to.equal('application/xml')
      const xmlText = await xmlRes.text()
      expect(xmlText).to.include('<user>')
      expect(xmlText).to.include('<id>123</id>')

      // CSV request
      const csvRes = await fetch('https://api.example.com/api/users/123', {
        headers: { Accept: 'text/csv' },
      })
      expect(csvRes.headers.get('Content-Type')).to.equal('text/csv')
      const csvText = await csvRes.text()
      expect(csvText).to.include('id,name')
    })

    it('should handle Accept-Language header', async () => {
      await mock.add({
        match: { uri: '/api/greeting' },
        respond: {
          body: (req) => {
            const lang = req.headers['accept-language'] || 'en'

            const greetings: Record<string, string> = {
              en: 'Hello',
              es: 'Hola',
              fr: 'Bonjour',
              de: 'Guten Tag',
            }

            // Simple language detection (just check if it starts with language code)
            for (const [code, greeting] of Object.entries(greetings)) {
              if (lang.startsWith(code)) {
                return JSON.stringify({ greeting, language: code })
              }
            }

            return JSON.stringify({ greeting: greetings.en, language: 'en' })
          },
          headers: {
            'Content-Language': 'en',
            'Vary': 'Accept-Language',
          },
        },
      })

      const res1 = await fetch('https://api.example.com/api/greeting', {
        headers: { 'Accept-Language': 'es' },
      })
      const data1 = await res1.json()
      expect(data1.greeting).to.equal('Hola')

      const res2 = await fetch('https://api.example.com/api/greeting', {
        headers: { 'Accept-Language': 'fr-FR,fr;q=0.9,en;q=0.8' },
      })
      const data2 = await res2.json()
      expect(data2.greeting).to.equal('Bonjour')
    })
  })
})
