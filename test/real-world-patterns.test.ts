/**
 * Real-world integration patterns: authentication, pagination, file uploads, GraphQL
 */
import { expect } from '@esm-bundle/chai'
import { setupWorker, type MockHandler } from '../dist/index.js'

describe('Real-World Integration Patterns', () => {
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

  describe('Authentication Flows', () => {
    it('should handle login flow with token', async () => {
      let authToken: string | null = null

      // Mock login endpoint
      await mock.add({
        match: { uri: '/auth/login', methods: ['POST'] },
        respond: {
          body: (req) => {
            const body = JSON.parse(req.body as string)
            if (body.username === 'user' && body.password === 'pass') {
              authToken = 'token-12345'
              return JSON.stringify({ token: authToken, expiresIn: 3600 })
            }
            return JSON.stringify({ error: 'Invalid credentials' })
          },
          status: (req) => {
            const body = JSON.parse(req.body as string)
            return body.username === 'user' && body.password === 'pass' ? 200 : 401
          },
        },
      })

      // Mock protected endpoint
      await mock.add({
        match: { uri: '/api/profile' },
        respond: {
          body: (req) => {
            const authHeader = req.headers['authorization']
            if (authHeader === `Bearer ${authToken}`) {
              return JSON.stringify({ id: 1, name: 'John Doe', email: 'john@example.com' })
            }
            return JSON.stringify({ error: 'Unauthorized' })
          },
          status: (req) => {
            const authHeader = req.headers['authorization']
            return authHeader === `Bearer ${authToken}` ? 200 : 401
          },
        },
      })

      // Login
      const loginRes = await fetch('https://api.example.com/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'user', password: 'pass' }),
      })
      expect(loginRes.status).to.equal(200)
      const loginData = await loginRes.json()
      expect(loginData.token).to.equal('token-12345')

      // Access protected resource
      const profileRes = await fetch('https://api.example.com/api/profile', {
        headers: { Authorization: `Bearer ${loginData.token}` },
      })
      expect(profileRes.status).to.equal(200)
      const profile = await profileRes.json()
      expect(profile.name).to.equal('John Doe')

      // Access without token
      const unauthorizedRes = await fetch('https://api.example.com/api/profile')
      expect(unauthorizedRes.status).to.equal(401)
    })

    it('should handle token refresh flow', async () => {
      let currentToken = 'token-initial'
      let refreshToken = 'refresh-initial'

      // Mock token refresh
      await mock.add({
        match: { uri: '/auth/refresh', methods: ['POST'] },
        respond: {
          body: (req) => {
            const body = JSON.parse(req.body as string)
            if (body.refreshToken === refreshToken) {
              currentToken = 'token-refreshed'
              refreshToken = 'refresh-new'
              return JSON.stringify({ token: currentToken, refreshToken })
            }
            return JSON.stringify({ error: 'Invalid refresh token' })
          },
          status: (req) => {
            const body = JSON.parse(req.body as string)
            return body.refreshToken === refreshToken ? 200 : 401
          },
        },
      })

      const res = await fetch('https://api.example.com/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: 'refresh-initial' }),
      })

      expect(res.status).to.equal(200)
      const data = await res.json()
      expect(data.token).to.equal('token-refreshed')
      expect(data.refreshToken).to.equal('refresh-new')
    })

    it('should handle OAuth callback flow', async () => {
      const state = 'random-state-123'
      const code = 'auth-code-456'

      // Mock OAuth callback
      await mock.add({
        match: { uri: '/auth/callback' },
        respond: {
          body: () => {
            // Query params would be in the URL, but we can access via params if pattern includes them
            return JSON.stringify({
              message: 'Authentication successful',
              userId: 12345,
            })
          },
        },
      })

      const res = await fetch(`https://api.example.com/auth/callback?code=${code}&state=${state}`)
      expect(res.status).to.equal(200)
      const data = await res.json()
      expect(data.userId).to.equal(12345)
    })
  })

  describe('Pagination', () => {
    it('should handle cursor-based pagination', async () => {
      const allItems = Array.from({ length: 50 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
      }))

      await mock.add({
        match: { uri: '/api/items' },
        respond: {
          body: () => {
            // In real scenario, cursor would be in query params
            // For now, we'll use a simple approach
            const items = allItems.slice(0, 10)
            return JSON.stringify({
              items,
              nextCursor: items.length > 0 ? 'cursor-10' : null,
              hasMore: allItems.length > 10,
            })
          },
        },
      })

      await mock.add({
        match: { uri: '/api/items/next' },
        respond: {
          body: () => {
            const items = allItems.slice(10, 20)
            return JSON.stringify({
              items,
              nextCursor: items.length > 0 ? 'cursor-20' : null,
              hasMore: allItems.length > 20,
            })
          },
        },
      })

      // First page
      const page1 = await fetch('https://api.example.com/api/items')
      const data1 = await page1.json()
      expect(data1.items.length).to.equal(10)
      expect(data1.hasMore).to.be.true
      expect(data1.nextCursor).to.equal('cursor-10')

      // Second page
      const page2 = await fetch('https://api.example.com/api/items/next')
      const data2 = await page2.json()
      expect(data2.items.length).to.equal(10)
      expect(data2.hasMore).to.be.true
    })

    it('should handle offset-based pagination', async () => {
      const allItems = Array.from({ length: 100 }, (_, i) => ({
        id: i + 1,
        name: `Item ${i + 1}`,
      }))

      await mock.add({
        match: { uri: '/api/products/:page' },
        respond: {
          body: (req) => {
            const page = parseInt(req.params.page || '1', 10)
            const limit = 20
            const offset = (page - 1) * limit
            const items = allItems.slice(offset, offset + limit)

            return JSON.stringify({
              items,
              page,
              totalPages: Math.ceil(allItems.length / limit),
              total: allItems.length,
            })
          },
        },
      })

      // Page 1
      const res1 = await fetch('https://api.example.com/api/products/1')
      const data1 = await res1.json()
      expect(data1.items.length).to.equal(20)
      expect(data1.page).to.equal(1)
      expect(data1.totalPages).to.equal(5)

      // Page 3
      const res3 = await fetch('https://api.example.com/api/products/3')
      const data3 = await res3.json()
      expect(data3.items.length).to.equal(20)
      expect(data3.items[0].id).to.equal(41)
    })

    it('should handle link header pagination (GitHub style)', async () => {
      await mock.add({
        match: { uri: '/api/repos' },
        respond: {
          body: () =>
            JSON.stringify([
              { id: 1, name: 'repo1' },
              { id: 2, name: 'repo2' },
            ]),
          headers: {
            Link: '<https://api.example.com/api/repos?page=2>; rel="next", <https://api.example.com/api/repos?page=5>; rel="last"',
          },
        },
      })

      const res = await fetch('https://api.example.com/api/repos')
      const linkHeader = res.headers.get('Link')
      expect(linkHeader).to.include('rel="next"')
      expect(linkHeader).to.include('rel="last"')
    })
  })

  describe('File Upload/Download', () => {
    it('should handle file upload', async () => {
      await mock.add({
        match: { uri: '/api/upload', methods: ['POST'] },
        respond: {
          body: (req) => {
            const contentType = req.headers['content-type'] || ''
            if (contentType.includes('multipart/form-data') || contentType.includes('application/octet-stream')) {
              // Get body size - handle both string and ArrayBuffer
              let bodySize = 0
              if (req.body instanceof ArrayBuffer) {
                bodySize = req.body.byteLength
              } else if (typeof req.body === 'string') {
                bodySize = req.body.length
              }

              return JSON.stringify({
                fileId: 'file-123',
                filename: 'document.pdf',
                size: bodySize,
                uploadedAt: new Date().toISOString(),
              })
            }
            return JSON.stringify({ error: 'Invalid content type' })
          },
          status: (req) => {
            const contentType = req.headers['content-type'] || ''
            return contentType.includes('multipart/form-data') || contentType.includes('application/octet-stream')
              ? 201
              : 400
          },
        },
      })

      const fileData = new Uint8Array([0x25, 0x50, 0x44, 0x46]) // PDF header
      const res = await fetch('https://api.example.com/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: fileData.buffer,
      })

      expect(res.status).to.equal(201)
      const data = await res.json()
      expect(data.fileId).to.equal('file-123')
      expect(data.size).to.equal(4)
    })

    it('should handle file download with binary data', async () => {
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) // PDF-1.4

      await mock.add({
        match: { uri: '/api/files/:id/download' },
        respond: {
          body: () => pdfData.buffer,
          headers: {
            'Content-Type': 'application/pdf',
            'Content-Disposition': 'attachment; filename="document.pdf"',
          },
        },
      })

      const res = await fetch('https://api.example.com/api/files/123/download')
      expect(res.headers.get('Content-Type')).to.equal('application/pdf')
      expect(res.headers.get('Content-Disposition')).to.include('document.pdf')

      const buffer = await res.arrayBuffer()
      const received = new Uint8Array(buffer)
      expect(received.length).to.equal(8)
      expect(received[0]).to.equal(0x25) // %
      expect(received[1]).to.equal(0x50) // P
      expect(received[2]).to.equal(0x44) // D
      expect(received[3]).to.equal(0x46) // F
    })

    it('should handle chunked upload simulation', async () => {
      let uploadedChunks = 0

      await mock.add({
        match: { uri: '/api/upload/chunk/:id', methods: ['POST'] },
        respond: {
          body: (req) => {
            uploadedChunks++
            const chunkNumber = parseInt(req.headers['x-chunk-number'] || '0', 10)
            const totalChunks = parseInt(req.headers['x-total-chunks'] || '1', 10)

            return JSON.stringify({
              uploadId: req.params.id,
              chunkNumber,
              received: true,
              complete: chunkNumber === totalChunks - 1,
            })
          },
        },
      })

      // Upload 3 chunks
      for (let i = 0; i < 3; i++) {
        const res = await fetch('https://api.example.com/api/upload/chunk/upload-456', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/octet-stream',
            'X-Chunk-Number': String(i),
            'X-Total-Chunks': '3',
          },
          body: new Uint8Array([i, i + 1, i + 2]).buffer,
        })

        const data = await res.json()
        expect(data.received).to.be.true
        if (i === 2) {
          expect(data.complete).to.be.true
        }
      }

      expect(uploadedChunks).to.equal(3)
    })
  })

  describe('GraphQL', () => {
    it('should handle GraphQL query', async () => {
      await mock.add({
        match: { uri: '/graphql', methods: ['POST'] },
        respond: {
          body: (req) => {
            const body = JSON.parse(req.body as string)
            const query = body.query

            if (query.includes('getUser')) {
              return JSON.stringify({
                data: {
                  user: {
                    id: '1',
                    name: 'John Doe',
                    email: 'john@example.com',
                  },
                },
              })
            }

            if (query.includes('listPosts')) {
              return JSON.stringify({
                data: {
                  posts: [
                    { id: '1', title: 'Post 1', author: 'John' },
                    { id: '2', title: 'Post 2', author: 'Jane' },
                  ],
                },
              })
            }

            return JSON.stringify({ errors: [{ message: 'Unknown query' }] })
          },
        },
      })

      // Query user
      const userRes = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ getUser(id: "1") { id name email } }',
        }),
      })

      const userData = await userRes.json()
      expect(userData.data.user.name).to.equal('John Doe')

      // Query posts
      const postsRes = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: '{ listPosts { id title author } }',
        }),
      })

      const postsData = await postsRes.json()
      expect(postsData.data.posts.length).to.equal(2)
    })

    it('should handle GraphQL mutation', async () => {
      const users: { id: string; name: string; email: string }[] = []

      await mock.add({
        match: { uri: '/graphql', methods: ['POST'] },
        respond: {
          body: (req) => {
            const body = JSON.parse(req.body as string)
            const query = body.query

            if (query.includes('createUser')) {
              const variables = body.variables || {}
              const newUser = {
                id: String(users.length + 1),
                name: variables.name,
                email: variables.email,
              }
              users.push(newUser)

              return JSON.stringify({
                data: {
                  createUser: newUser,
                },
              })
            }

            return JSON.stringify({ errors: [{ message: 'Unknown mutation' }] })
          },
        },
      })

      const res = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query:
            // eslint-disable-next-line max-len
            'mutation CreateUser($name: String!, $email: String!) { createUser(name: $name, email: $email) { id name email } }',
          variables: {
            name: 'Alice Smith',
            email: 'alice@example.com',
          },
        }),
      })

      const data = await res.json()
      expect(data.data.createUser.name).to.equal('Alice Smith')
      expect(data.data.createUser.id).to.equal('1')
      expect(users.length).to.equal(1)
    })

    it('should handle GraphQL errors', async () => {
      await mock.add({
        match: { uri: '/graphql', methods: ['POST'] },
        respond: {
          body: (req) => {
            const body = JSON.parse(req.body as string)
            if (!body.query) {
              return JSON.stringify({
                errors: [
                  {
                    message: 'Query is required',
                    extensions: { code: 'BAD_USER_INPUT' },
                  },
                ],
              })
            }
            return JSON.stringify({ data: null })
          },
        },
      })

      const res = await fetch('https://api.example.com/graphql', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ variables: {} }),
      })

      const data = await res.json()
      expect(data.errors).to.exist
      expect(data.errors[0].message).to.equal('Query is required')
      expect(data.errors[0].extensions.code).to.equal('BAD_USER_INPUT')
    })
  })

  describe('Webhook/Callback Patterns', () => {
    it('should handle webhook with signature verification', async () => {
      let webhookReceived = false

      await mock.add({
        match: { uri: '/webhooks/payment', methods: ['POST'] },
        respond: {
          body: (req) => {
            const signature = req.headers['x-webhook-signature']
            // In real scenario, would verify signature with HMAC
            if (signature === 'valid-signature') {
              webhookReceived = true
              const payload = JSON.parse(req.body as string)
              return JSON.stringify({ received: true, eventId: payload.id })
            }
            return JSON.stringify({ error: 'Invalid signature' })
          },
          status: (req) => {
            const signature = req.headers['x-webhook-signature']
            return signature === 'valid-signature' ? 200 : 401
          },
        },
      })

      const res = await fetch('https://api.example.com/webhooks/payment', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Webhook-Signature': 'valid-signature',
        },
        body: JSON.stringify({
          id: 'evt_123',
          type: 'payment.succeeded',
          amount: 1000,
        }),
      })

      expect(res.status).to.equal(200)
      expect(webhookReceived).to.be.true
    })

    it('should handle async callback pattern', async () => {
      let jobStatus = 'pending'

      // Submit job
      await mock.add({
        match: { uri: '/api/jobs', methods: ['POST'] },
        respond: {
          body: () =>
            JSON.stringify({
              jobId: 'job-123',
              status: 'pending',
              callbackUrl: 'https://api.example.com/callbacks/job-123',
            }),
          status: 202, // Accepted
        },
      })

      // Status endpoint
      await mock.add({
        match: { uri: '/api/jobs/:id' },
        respond: {
          body: (req) => {
            return JSON.stringify({
              jobId: req.params.id,
              status: jobStatus,
            })
          },
        },
      })

      // Submit job
      const submitRes = await fetch('https://api.example.com/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ task: 'process-data' }),
      })

      expect(submitRes.status).to.equal(202)
      const submitData = await submitRes.json()
      expect(submitData.status).to.equal('pending')

      // Check status (still pending)
      const statusRes1 = await fetch('https://api.example.com/api/jobs/job-123')
      const statusData1 = await statusRes1.json()
      expect(statusData1.status).to.equal('pending')

      // Simulate job completion
      jobStatus = 'completed'

      // Check status again
      const statusRes2 = await fetch('https://api.example.com/api/jobs/job-123')
      const statusData2 = await statusRes2.json()
      expect(statusData2.status).to.equal('completed')
    })
  })

  describe('Complex Multi-Step Workflows', () => {
    it('should handle e-commerce checkout flow', async () => {
      const cart: unknown[] = []
      let orderId: string | null = null

      // Add to cart
      await mock.add({
        match: { uri: '/api/cart/items', methods: ['POST'] },
        respond: {
          body: (req) => {
            const item = JSON.parse(req.body as string)
            cart.push(item)
            return JSON.stringify({ cart, total: cart.length })
          },
        },
      })

      // Create order
      await mock.add({
        match: { uri: '/api/orders', methods: ['POST'] },
        respond: {
          body: () => {
            orderId = 'order-' + Date.now()
            return JSON.stringify({
              orderId,
              items: cart,
              total: 99.99,
              status: 'created',
            })
          },
        },
      })

      // Process payment
      await mock.add({
        match: { uri: '/api/payments', methods: ['POST'] },
        respond: {
          body: (req) => {
            const payment = JSON.parse(req.body as string)
            return JSON.stringify({
              paymentId: 'pay-123',
              orderId: payment.orderId,
              status: 'succeeded',
            })
          },
        },
      })

      // Step 1: Add items to cart
      await fetch('https://api.example.com/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'prod-1', quantity: 2 }),
      })

      await fetch('https://api.example.com/api/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ productId: 'prod-2', quantity: 1 }),
      })

      expect(cart.length).to.equal(2)

      // Step 2: Create order
      const orderRes = await fetch('https://api.example.com/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shippingAddress: '123 Main St' }),
      })

      const order = await orderRes.json()
      expect(order.orderId).to.exist
      expect(order.items.length).to.equal(2)

      // Step 3: Process payment
      const paymentRes = await fetch('https://api.example.com/api/payments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ orderId: order.orderId, amount: 99.99 }),
      })

      const payment = await paymentRes.json()
      expect(payment.status).to.equal('succeeded')
      expect(payment.orderId).to.equal(order.orderId)
    })
  })
})
