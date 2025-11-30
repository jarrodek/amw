# AMW - API Mocking for Web

A modern TypeScript library for mocking API calls in web browsers using Service Workers. AMW provides a non-invasive way to intercept and mock HTTP requests with full access to test context, closures, and dynamic response generation.

## Features

- 🚀 **Service Worker-based**: Non-invasive network interception (no `fetch` patching)
- 🔄 **Distributed Registry**: Fast routing in SW, flexible execution on Main Thread
- 🎯 **Dynamic Responses**: Status, headers, and body can be static or async functions
- 🧪 **Closure Access**: Response generators access test variables and closures
- 🎯 **Modern APIs**: Uses URLPattern, MessageChannel, and ES2022+ features
- 📦 **Zero Dependencies**: Built entirely on native Web APIs
- 🔧 **Extensible**: Class-based SW design allows custom implementations
- 💪 **TypeScript**: Full type safety and IDE support
- ✅ **Well-tested**: 198 tests with 90% code coverage
- ⚡ **Evergreen Browsers**: Targets modern browsers only, no polyfills

## Installation

```bash
npm install @jarrodek/amw
```

## Quick Start

### 1. Copy the Service Worker

Copy the default Service Worker script to your public directory:

```bash
cp node_modules/@jarrodek/amw/dist/sw.js public/amw-sw.js
```

### 2. Setup in Your Tests

```typescript
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
  mock.reset(); // Clear mocks between tests
});
```

### 3. Add Mock Handlers

```typescript
it('mocks a GET request', async () => {
  await mock.add({
    match: { uri: '/users/:id' },
    respond: {
      status: 200,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ id: '123', name: 'John Doe' })
    }
  });

  const res = await fetch('https://api.example.com/v1/users/123');
  const data = await res.json();
  
  expect(data.name).toBe('John Doe');
});
```

## Advanced Usage

### Dynamic Responses

All response properties (status, headers, body) can be static values or async functions:

```typescript
it('generates dynamic responses', async () => {
  const localId = '456';
  const localName = 'Jane Smith';

  await mock.add({
    match: { uri: '/users/:id' },
    respond: {
      status: (req) => req.params.id === '999' ? 404 : 200,
      headers: (req) => ({
        'content-type': 'application/json',
        'x-user-id': req.params.id,
      }),
      body: async (req) => {
        // Full access to test scope!
        return JSON.stringify({ 
          id: localId, 
          name: localName,
          requestedId: req.params.id 
        });
      }
    }
  });

  const res = await fetch('https://api.example.com/v1/users/999');
  expect(res.status).toBe(404);
  const data = await res.json();
  
  expect(data.id).toBe('456'); // Uses closure variable
  expect(data.requestedId).toBe('999'); // From URL params
});
```

### Request Matching

Match requests by URI pattern, HTTP methods, and required headers:

```typescript
await mock.add({
  match: {
    uri: '/api/data',
    methods: ['POST', 'PUT'],
    headers: {
      'authorization': 'Bearer token123',
      'content-type': 'application/json'
    }
  },
  respond: {
    status: 201,
    body: 'Created'
  }
});
```

**URL Pattern Syntax:**

- `/users/:id` - Named parameter
- `/api/*` - Wildcard
- `/files/:name.:ext` - Multiple parameters
- Uses native [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)

### Transient Mocks (Lifetime)

Limit how many times a handler can be used:

```typescript
// This mock expires after 2 uses
await mock.add({
  match: { uri: '/one-time' },
  respond: { body: 'First call' }
}, { lifetime: 2 });

await fetch('/one-time'); // Mocked
await fetch('/one-time'); // Mocked
await fetch('/one-time'); // Goes to network
```

### Network Error Simulation

Simulate various network failure scenarios:

```typescript
// Network error
await mock.add({
  match: { uri: '/error' },
  respond: {
    error: 'network' // or 'timeout', 'offline'
  }
});

await fetch('/error'); // Throws TypeError: Failed to fetch
```

### Binary Data Support

Return binary data as ArrayBuffer:

```typescript
await mock.add({
  match: { uri: '/download/:filename' },
  respond: {
    status: 200,
    headers: { 'content-type': 'application/pdf' },
    body: async (req) => {
      // Return ArrayBuffer for binary data
      const pdfData = new Uint8Array([0x25, 0x50, 0x44, 0x46]); // %PDF
      return pdfData.buffer;
    }
  }
});

const res = await fetch('/download/document.pdf');
const buffer = await res.arrayBuffer();
const bytes = new Uint8Array(buffer);
console.log(bytes[0]); // 0x25 ('%')
```

### Custom Service Worker

For advanced use cases, extend the `MockServiceWorker` class:

```typescript
// custom-sw.ts
import { MockServiceWorker } from '@jarrodek/amw/worker';

class LoggingWorker extends MockServiceWorker {
  protected onFetch(event: FetchEvent) {
    console.log('[Custom SW] Intercepting:', event.request.url);
    super.onFetch(event);
  }
}

const worker = new LoggingWorker();
worker.start();
```

Build and use your custom worker:

```typescript
const mock = await setupWorker({
  swPath: '/custom-sw.js'
});
```

## API Reference

### `setupWorker(options?)`

Sets up the Service Worker and returns a `MockHandler` instance.

**Options:**

- `swPath?: string` - Path to SW script (default: `/amw-sw.js`)
- `scope?: string` - SW registration scope (default: `/`)
- `base?: string` - Base URL for resolving relative URIs

**Returns:** `Promise<MockHandler>`

### `MockHandler`

#### `add(handler, options?)`

Registers a mock interceptor.

**Handler:**

- `match: InterceptMatcher` - Matching criteria
  - `uri: string` - URLPattern string (e.g., `/users/:id`)
  - `methods?: string[]` - HTTP methods to match (default: all)
  - `headers?: Record<string, string>` - Required request headers
- `respond: ResponseGenerator` - Response generation logic
  - `status?: number | (req) => number | Promise<number>` - HTTP status (default: 200)
  - `headers?: Record<string, string> | (req) => Record<string, string> | Promise<Record<string, string>>` - Response headers
  - `body?: string | ArrayBuffer | null | (req) => string | ArrayBuffer | null | Promise<...>` - Response body
  - `error?: 'network' | 'timeout' | 'offline'` - Simulate network error

**Options:**

- `lifetime?: number` - Max usage count (default: `Infinity`)
- `strategy?: 'mock' | 'passthrough'` - Handling strategy (default: `'mock'`)

**Returns:** `Promise<void>`

#### `release(uri: string)`

Removes all handlers for a specific URI.

**Returns:** `Promise<void>`

#### `releaseMatch(matcher: InterceptMatcher)`

Removes handlers matching specific criteria.

**Returns:** `Promise<void>`

#### `reset()`

Removes all handlers.

**Returns:** `Promise<void>`

#### `stop()`

Unregisters the Service Worker and cleans up.

**Returns:** `Promise<void>`

### Package Exports

AMW provides multiple entry points for different use cases:

```typescript
// Main API (for tests)
import { setupWorker, type MockHandler } from '@jarrodek/amw';

// Service Worker exports (for custom SW)
import { MockServiceWorker } from '@jarrodek/amw/worker';

// Pre-built Service Worker (copy to public directory)
import '@jarrodek/amw/sw';
```

## Architecture

AMW uses a **Distributed Registry** model:

1. **Service Worker (Router)**: Holds URL patterns and matching logic
2. **Main Thread (Executor)**: Holds response generators with closure access
3. **MessageChannel**: Dedicated communication for each request

This design ensures:

- ⚡ Fast routing (native URLPattern in SW)
- 🎯 Closure access (generators run on Main Thread)
- 🔒 Isolated communication (MessagePort per request)
- 🚀 No fetch patching or monkey-patching
- ✅ Clean separation of concerns

### Request Flow

1. Browser makes a `fetch()` request
2. Service Worker intercepts via `FetchEvent`
3. SW matches request against stored URLPatterns
4. SW sends request details to Main Thread via MessagePort
5. Main Thread executes response generator with test context
6. Main Thread sends response data back to SW
7. SW constructs and returns `Response` object

## Browser Support

AMW requires modern evergreen browsers with:

- Service Workers
- URLPattern API
- MessageChannel
- ES2022+ features

Tested on:

- ✅ Chromium 95+ (Chrome, Edge, Opera)
- ✅ Firefox 106+
- ✅ WebKit/Safari 16.4+

**Note:** Some advanced features may have browser-specific limitations. For example, WebKit/Safari has known issues with Service Worker redirect responses.

## Testing

The library includes a comprehensive test suite:

```bash
npm test              # Run all tests
npm run test:chrome   # Chromium only
npm run test:firefox  # Firefox only
npm run test:webkit   # WebKit only
```

**Test Coverage:**

- 198 tests across 13 test suites
- ~90% code coverage
- Tests for setup, matching, dynamic responses, error handling, edge cases, performance, real-world patterns, and browser-specific HTTP features

## License

Apache-2.0

## Author

Pawel Uchida-Psztyc

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

For development:

```bash
npm install           # Install dependencies
npm run build         # Build TypeScript and bundle SW
npm test              # Run tests
npm run format        # Format code with ESLint & Prettier
```

## Changelog

See [GitHub Releases](https://github.com/jarrodek/amw/releases) for version history and changes.
