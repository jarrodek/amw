/**
 * Unit tests for shared utility functions
 */

import { expect } from '@esm-bundle/chai'
import {
  generateId,
  normalizeHeaders,
  headersToObject,
  headersMatch,
  withTimeout,
  readRequestBody,
} from '../dist/shared/utils.js'

describe('Shared Utils', () => {
  describe('generateId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateId()
      const id2 = generateId()

      expect(id1).to.be.a('string')
      expect(id2).to.be.a('string')
      expect(id1).to.not.equal(id2)
    })

    it('should generate IDs with timestamp prefix', () => {
      const id = generateId()
      const timestamp = parseInt(id.split('-')[0], 10)
      const now = Date.now()

      expect(timestamp).to.be.closeTo(now, 100)
    })
  })

  describe('normalizeHeaders', () => {
    it('should convert all header keys to lowercase', () => {
      const headers = {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'value',
        'ACCEPT': 'text/html',
      }

      const normalized = normalizeHeaders(headers)

      expect(normalized).to.deep.equal({
        'content-type': 'application/json',
        'x-custom-header': 'value',
        'accept': 'text/html',
      })
    })

    it('should handle empty object', () => {
      const normalized = normalizeHeaders({})
      expect(normalized).to.deep.equal({})
    })

    it('should preserve header values', () => {
      const headers = { 'X-Custom': 'CaseSensitiveValue' }
      const normalized = normalizeHeaders(headers)

      expect(normalized['x-custom']).to.equal('CaseSensitiveValue')
    })
  })

  describe('headersToObject', () => {
    it('should convert Headers object to plain object', () => {
      const headers = new Headers({
        'Content-Type': 'application/json',
        'X-API-Key': 'secret',
      })

      const obj = headersToObject(headers)

      expect(obj).to.deep.equal({
        'content-type': 'application/json',
        'x-api-key': 'secret',
      })
    })

    it('should handle empty Headers', () => {
      const headers = new Headers()
      const obj = headersToObject(headers)

      expect(obj).to.deep.equal({})
    })

    it('should normalize keys to lowercase', () => {
      const headers = new Headers({ ACCEPT: 'text/plain' })
      const obj = headersToObject(headers)

      expect(obj.accept).to.equal('text/plain')
    })
  })

  describe('headersMatch', () => {
    it('should return true when all required headers match', () => {
      const requestHeaders = {
        'content-type': 'application/json',
        'x-api-key': 'secret',
        'accept': 'application/json',
      }

      const requiredHeaders = {
        'content-type': 'application/json',
        'x-api-key': 'secret',
      }

      expect(headersMatch(requestHeaders, requiredHeaders)).to.be.true
    })

    it('should return false when required header is missing', () => {
      const requestHeaders = {
        'content-type': 'application/json',
      }

      const requiredHeaders = {
        'content-type': 'application/json',
        'x-api-key': 'secret',
      }

      expect(headersMatch(requestHeaders, requiredHeaders)).to.be.false
    })

    it('should return false when required header value differs', () => {
      const requestHeaders = {
        'content-type': 'application/xml',
      }

      const requiredHeaders = {
        'content-type': 'application/json',
      }

      expect(headersMatch(requestHeaders, requiredHeaders)).to.be.false
    })

    it('should be case-insensitive for header keys', () => {
      const requestHeaders = {
        'Content-Type': 'application/json',
      }

      const requiredHeaders = {
        'content-type': 'application/json',
      }

      expect(headersMatch(requestHeaders, requiredHeaders)).to.be.true
    })

    it('should return true when no headers are required', () => {
      const requestHeaders = {
        'content-type': 'application/json',
      }

      expect(headersMatch(requestHeaders, {})).to.be.true
    })

    it('should allow extra headers in request', () => {
      const requestHeaders = {
        'content-type': 'application/json',
        'x-extra': 'value',
        'accept': 'text/html',
      }

      const requiredHeaders = {
        'content-type': 'application/json',
      }

      expect(headersMatch(requestHeaders, requiredHeaders)).to.be.true
    })
  })

  describe('withTimeout', () => {
    it('should resolve when promise completes before timeout', async () => {
      const promise = Promise.resolve('success')
      const result = await withTimeout(promise, 1000, 'Timeout error')

      expect(result).to.equal('success')
    })

    it('should reject with timeout error when promise takes too long', async () => {
      const slowPromise = new Promise((resolve) => setTimeout(() => resolve('late'), 200))

      try {
        await withTimeout(slowPromise, 50, 'Operation timed out')
        expect.fail('Should have timed out')
      } catch (error) {
        expect(error).to.be.instanceOf(Error)
        expect((error as Error).message).to.equal('Operation timed out')
      }
    })

    it('should reject with original error if promise rejects before timeout', async () => {
      const promise = Promise.reject(new Error('Original error'))

      try {
        await withTimeout(promise, 1000, 'Timeout error')
        expect.fail('Should have rejected')
      } catch (error) {
        expect((error as Error).message).to.equal('Original error')
      }
    })
  })

  describe('readRequestBody', () => {
    it('should return empty string for request without body', async () => {
      const request = new Request('https://example.com/api')
      const body = await readRequestBody(request)

      expect(body).to.equal('')
    })

    it('should read text for JSON content-type', async () => {
      const payload = JSON.stringify({ name: 'test', value: 42 })
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: payload,
      })

      const body = await readRequestBody(request)

      expect(body).to.equal(payload)
    })

    it('should read text for form data content-type', async () => {
      const payload = 'name=test&value=42'
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: payload,
      })

      const body = await readRequestBody(request)

      expect(body).to.equal(payload)
    })

    it('should read ArrayBuffer for binary content-type', async () => {
      const buffer = new Uint8Array([1, 2, 3, 4, 5]).buffer
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'application/octet-stream' },
        body: buffer,
      })

      const body = await readRequestBody(request)

      expect(body).to.be.instanceOf(ArrayBuffer)
      expect(new Uint8Array(body as ArrayBuffer)).to.deep.equal(new Uint8Array([1, 2, 3, 4, 5]))
    })

    it('should read ArrayBuffer for image content-type', async () => {
      const buffer = new Uint8Array([137, 80, 78, 71]).buffer // PNG header
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'image/png' },
        body: buffer,
      })

      const body = await readRequestBody(request)

      expect(body).to.be.instanceOf(ArrayBuffer)
    })

    it('should read ArrayBuffer for PDF content-type', async () => {
      const buffer = new Uint8Array([0x25, 0x50, 0x44, 0x46]).buffer // %PDF header
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'application/pdf' },
        body: buffer,
      })

      const body = await readRequestBody(request)
      expect(body).to.be.instanceOf(ArrayBuffer)
    })

    // eslint-disable-next-line max-len
    it('should return empty string for empty text/plain body even if content-length header ignored by browser', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'content-length': '5' }, // content-length is forbidden and ignored
        body: '',
      })

      const body = await readRequestBody(request)
      expect(body).to.equal('')
    })

    it('should read text by default when content-type is unknown', async () => {
      const payload = 'Plain text data'
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: payload,
      })

      const body = await readRequestBody(request)

      expect(body).to.equal(payload)
    })

    it('should not consume the original request body (uses clone)', async () => {
      const payload = 'test data'
      const request = new Request('https://example.com/api', {
        method: 'POST',
        body: payload,
      })

      await readRequestBody(request)

      // Should still be able to read the original request
      const text = await request.text()
      expect(text).to.equal(payload)
    })

    it('should handle requests with content-length but empty body', async () => {
      const request = new Request('https://example.com/api', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: '',
      })

      const body = await readRequestBody(request)

      expect(body).to.equal('')
    })
  })
})
