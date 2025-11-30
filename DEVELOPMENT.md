# Development Guide

## Building the Project

```bash
# Install dependencies
npm install

# Build TypeScript
npm run build

# Clean build artifacts
npm run clean
```

## Project Structure

```plain
src/
├── types/             # TypeScript interfaces and types
│   ├── index.ts       # Main type definitions
│   └── messages.ts    # Message protocol types
├── shared/            # Code shared between Main and Worker
│   ├── constants.ts   # Constants and defaults
│   └── utils.ts       # Utility functions
├── main/              # Main Thread code
│   ├── MockHandlerImpl.ts   # Main controller implementation
│   ├── RouteRegistry.ts     # Response generator storage
│   └── setupWorker.ts       # Setup function
├── worker/            # Service Worker code
│   ├── MockServiceWorker.ts # SW class implementation
│   ├── RouteMatcher.ts      # URL/header matching
│   └── RouteStore.ts        # Route storage (LIFO)
├── index.ts           # Main entry point
├── sw.ts              # Default SW script
└── worker.ts          # Exports for custom SW
```

## Communication Flow

1. **Setup Phase**:
   - Main Thread registers Service Worker
   - Creates two MessageChannels:
     - `mainPort`: For control messages (register, remove, reset)
     - `executePort`: For execution requests from SW to Main
   - Sends `executePort` to SW via INIT message

2. **Registration Phase**:
   - Main Thread calls `mock.add(handler)`
   - Stores response generator in RouteRegistry
   - Sends matcher to SW via REGISTER_ROUTE message
   - SW creates RouteDefinition and adds to RouteStore (LIFO)

3. **Interception Phase**:
   - Browser makes fetch request
   - SW `fetch` event fires
   - SW searches RouteStore for match (LIFO order)
   - If match found, SW calls `event.respondWith()`

4. **Execution Phase**:
   - SW serializes request (URL, method, headers, body, params)
   - SW creates new MessageChannel for this request
   - SW sends EXECUTE_ROUTE message via executePort
   - Main Thread receives message, executes generator
   - Main Thread sends response data back via MessagePort
   - SW constructs Response and resolves respondWith()

## Key Design Decisions

### Distributed Registry

- **Why**: Service Workers can't access Main Thread closures
- **Solution**: Split state across threads
  - SW: Fast routing with URLPattern
  - Main: Generator execution with closure access

### LIFO Stack

- **Why**: Most recent mocks should take precedence
- **Implementation**: `Array.unshift()` for new routes, iterate from start

### Dedicated MessagePorts

- **Why**: Avoid broadcast pollution, enable parallel requests
- **Implementation**: New MessageChannel per request execution

### Lifetime Management

- **Why**: Support one-time/transient mocks
- **Implementation**: SW tracks usage count, auto-removes when expired

### URLPattern API

- **Why**: Native, performant, supports named groups
- **Trade-off**: Requires modern browsers (no IE11)

## Testing the Library

Since this is a library for testing, you'll need a test harness:

1. Create a simple HTTP server
2. Serve a test page with the SW
3. Use a testing framework (Jest, Vitest, etc.)

Example test setup:

```typescript
// test-setup.ts
import { setupWorker } from '@jarrodek/amw';

export let mock;

beforeAll(async () => {
  mock = await setupWorker({
    swPath: '/dist/sw.js'
  });
});

afterAll(async () => {
  await mock.stop();
});

afterEach(() => {
  mock.reset();
});
```

## Publishing

```bash
# Build and publish
npm run prepublishOnly
npm publish
```

The `prepublishOnly` script ensures the package is built before publishing.

## Browser Compatibility

Requires:

- Service Workers (Chrome 40+, Firefox 44+, Safari 11.1+)
- URLPattern (Chrome 95+, Firefox 106+, Safari 16.4+)
- MessageChannel (All modern browsers)
- ES2022 (top-level await, etc.)

## Performance Considerations

1. **SW Routing**: O(n) linear search through routes (LIFO)
   - Usually fast due to small route count in tests
   - URLPattern matching is native and optimized

2. **Serialization**: Request body read once, cloned for parsing
   - Supports both text and binary efficiently

3. **MessagePort**: Dedicated channels prevent contention
   - Parallel requests don't block each other

## Extending the Library

### Custom Service Worker

```typescript
import { MockServiceWorker } from '@jarrodek/amw/worker';

class CustomWorker extends MockServiceWorker {
  protected onFetch(event: FetchEvent) {
    // Add custom logic
    super.onFetch(event);
  }
}

const worker = new CustomWorker();
worker.start();
```

### Custom Matching Logic

Extend `RouteMatcher` to add custom matching rules:

```typescript
import { RouteMatcher } from '@jarrodek/amw/worker';

class CustomMatcher extends RouteMatcher {
  // Add custom methods
}
```

## Common Issues

### SW Not Activating

- Check scope configuration
- Ensure SW file is served from same origin
- Check browser console for errors

### Mocks Not Matching

- Verify URLPattern syntax
- Check method/header matching (case-sensitive for methods)
- Review LIFO order (recent mocks first)

### Port Communication Errors

- Ensure SW is fully activated before use
- Check message timeout configuration
- Verify MessagePort transfer in postMessage

## License

Apache-2.0
