# Quick Start Guide

## Installation

```bash
npm install @jarrodek/amw
```

## Setup

### 1. Copy Service Worker

Copy the default Service Worker to your public directory:

```bash
cp node_modules/@jarrodek/amw/dist/sw.js public/amw-sw.js
```

### 2. Configure Your Test Suite

```typescript
// test-setup.ts
import { setupWorker, type MockHandler } from '@jarrodek/amw';

let mock: MockHandler;

beforeAll(async () => {
  mock = await setupWorker({
    swPath: '/amw-sw.js',
    base: 'https://api.example.com/v1'
  });
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => {
  mock.reset();
});

export { mock };
```

### 3. Use in Tests

```typescript
// user.test.ts
import { mock } from './test-setup';

describe('User API', () => {
  it('fetches user by ID', async () => {
    // Setup mock
    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        status: 200,
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ id: '123', name: 'John Doe' })
      }
    });

    // Make request
    const response = await fetch('https://api.example.com/v1/users/123');
    const user = await response.json();

    // Assert
    expect(user.name).toBe('John Doe');
  });

  it('uses test variables in responses', async () => {
    const testData = { id: '456', role: 'admin' };

    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        body: async (req) => {
          // Full access to closure variables!
          return JSON.stringify({
            ...testData,
            requestedId: req.params.id
          });
        }
      }
    });

    const response = await fetch('https://api.example.com/v1/users/999');
    const user = await response.json();

    expect(user.id).toBe('456');
    expect(user.role).toBe('admin');
    expect(user.requestedId).toBe('999');
  });
});
```

## Common Patterns

### POST Requests

```typescript
await mock.add({
  match: {
    uri: '/users',
    methods: ['POST']
  },
  respond: {
    status: 201,
    body: async (req) => {
      const data = JSON.parse(req.body as string);
      return JSON.stringify({ id: 'new-id', ...data });
    }
  }
});
```

### Header Matching

```typescript
await mock.add({
  match: {
    uri: '/protected',
    headers: {
      'authorization': 'Bearer token123'
    }
  },
  respond: {
    status: 200,
    body: 'Authorized'
  }
});
```

### One-Time Mocks

```typescript
await mock.add({
  match: { uri: '/one-time' },
  respond: { body: 'First call only' }
}, { lifetime: 1 });
```

### Network Errors

```typescript
await mock.add({
  match: { uri: '/error' },
  respond: {
    error: 'network' // or 'timeout', 'offline'
  }
});
```

### Binary Data

```typescript
await mock.add({
  match: { uri: '/image.png' },
  respond: {
    headers: { 'content-type': 'image/png' },
    body: new ArrayBuffer(1024)
  }
});
```

## Advanced Usage

### Custom Service Worker

Create `custom-sw.ts`:

```typescript
import { MockServiceWorker } from '@jarrodek/amw/worker';

class LoggingWorker extends MockServiceWorker {
  protected onFetch(event: FetchEvent) {
    console.log('[SW]', event.request.method, event.request.url);
    super.onFetch(event);
  }
}

const worker = new LoggingWorker();
worker.start();
```

Then build and use it:

```typescript
const mock = await setupWorker({
  swPath: '/custom-sw.js'
});
```

## Troubleshooting

### Service Worker Not Activating

Make sure your SW is served from the same origin and check the browser console.

### Mocks Not Matching

- Verify the URI pattern syntax
- Check that methods/headers match (methods are case-sensitive)
- Remember: most recent mocks are checked first (LIFO)

### TypeScript Errors

Ensure you have the latest TypeScript version (5.3+) and proper lib configuration.

## Next Steps

- Read the [README](./README.md) for complete documentation
- Check [examples](./examples/) for more patterns
- See [DEVELOPMENT](./DEVELOPMENT.md) for architecture details
