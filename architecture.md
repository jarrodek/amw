# API Mocking for Web (amw) Architecture Document

## 1. Architectural Overview

**AMW** is a library that leverages Service Workers to intercept network requests at the browser level. Unlike traditional `window.fetch` patching, AMW acts as a non-invasive network proxy.

### 1.1 The Distributed Registry Model

To combine high-performance routing with the flexibility of closures (accessing local test variables), AMW employs a Distributed Registry architecture. The state of a mock is split across two threads:

1. **The Service Worker (The Router)**:

    - Holds the **Routing Table** (URL patterns, methods, headers).

    - Executes matching logic synchronously.
    - Decides whether to intercept or pass-through to the network.
    - _Constraint_: Cannot execute functions defined in the test context.
1. **The Main Thread (The Executor)**:
    - Holds the **Response Generators** (the user's callback functions).

    - Executes the logic to generate the response body.
    - Capability: Has full access to the test suite's scope and closures.

### 1.2 Communication Protocol

The two threads synchronize using the **MessageChannel** API. This ensures a dedicated, direct communication line for every intercepted request, avoiding global broadcast pollution.

### 1.3 Class-Based Service Worker Design

To ensure scalability and extensibility, the Service Worker logic is **not** hardcoded into a monolithic script. Instead, it is encapsulated in an exportable `MockServiceWorker` class.

- **Standard Usage**: The package provides a default SW script that simply instantiates this class.
- **Advanced Usage**: Developers can import `MockServiceWorker` to create their own Service Worker files, allowing them to override methods, add custom logging, or integrate with other SW logic (like caching strategies).

## 2. Request Lifecycle

The following flow describes the strict sequence of events for a mocked API call.

### Phase 1: Interception & Matching (Service Worker)

1. **Fetch Event**: The Service Worker listens for the `fetch` event.

1. **Matching**: The SW iterates through its internal Routing Table (LIFO - Last In, First Out).
    - **URL**: Matched using the native `URLPattern` API.

    - **Method**: Exact string match (e.g., `'POST'`).
    - **Headers**: Subset match (the request must contain all headers defined in the matcher).
1. **Decision**:
    - **No Match**: The SW returns immediately (`return;`). The browser handles the request normally (Network Pass-through).
    - **Match Found**: The SW calls `event.respondWith()` and proceeds to Phase 2.

### Phase 2: Serialization & Delegation (SW -> Main)

1. **Serialization**: The SW reads the request body (cloned) and constructs a lightweight **Serialized Payload** containing ONLY:
    - `url` (string)

    - `method` (string)
    - `headers` (Record<string, string>)
    - `body` (text string or Blob)
    - `params` (Route parameters extracted by `URLPattern`)
1. **Delegation**: The SW sends an `EXECUTE_ROUTE` message to the Main Thread via a `MessagePort`, passing the payload and the matched **Route ID**.

### Phase 3: Execution (Main Thread)

1. **Lookup**: The Main Thread receives the message, extracts the Route ID, and retrieves the corresponding **Generator Function** from its memory map.

1. **Execution**: The function is executed. Because this happens on the Main Thread, the function can access local variables (closures) from the test scope.

1. **Result**: The function returns a result object (status, headers, body).

1. **Reply**: The Main Thread posts the result back to the Service Worker via the same `MessagePort`.

### Phase 4: Response Construction (Service Worker)

1. The SW receives the result payload.

1. It constructs a standard native `Response` object.

1. It resolves the promise passed to `event.respondWith()`.

## 3. Developer Workflow

The API is designed for a "Global Setup, Per-Test Reset" workflow to maximize performance.

### 3.1 Global Initialization

The Service Worker is registered once at the start of the test suite. By default, `setupWorker` points to the standard SW script included in the package, but this can be overridden.

```typescript
import { setupWorker, type MockHandler } from '@jarrodek/amw';

let mock: MockHandler;

beforeAll(async () => {
  // Registers SW and establishes the message channel
  mock = await setupWorker({
    // Optional: Point to a custom SW if extending the class
    // Default: Points to '@jarrodek/amw/sw.js'
    swPath: '/mock-sw.js', 
    base: 'https://api.example.com/v1'
  });
});

afterAll(async () => {
  await mock.stop();
});
```

### 3.2 Test Usage

Inside individual tests, the developer registers mocks. The `add()` method automatically handles the "Distributed Registry" logic: sending the _Matcher_ to the SW and keeping the _Generator_ in the Main Thread.

```typescript
describe('User API', () => {
  afterEach(() => mock.reset()); // Clears routes in SW and Main Thread

  it('mocks with closure access', async () => {
    const localId = '123';

    await mock.add({
      match: { uri: '/users/:id' },
      respond: {
        // This function stays on the Main Thread!
        body: async (req) => JSON.stringify({ id: localId })
      }
    });

    const res = await fetch('https://api.example.com/v1/users/999');
    const data = await res.json();
    expect(data.id).toBe(localId); // '123'
  });
});
```

## 4. Matching Logic Details

All matching occurs in the Service Worker using native APIs for speed.

1. **URLPattern**:

    - We use the standardized `URLPattern` API.

    - Supports named groups (`/users/:id`), wildcards (`/assets/*`), and optional segments.

    - If a `base` is configured in options, relative paths in matchers are resolved against it automatically.

1. **Header Matching**:

    - **Case Insensitivity**: All request headers and matcher headers are normalized to lowercase before comparison.

    - **Partial Match**: A request matches if it contains at least the headers specified in the matcher. Extra headers in the request are ignored.

## 5. Lifecycle Management

AMW supports transient mocks for specific test cases (e.g., testing "one-time" errors).

- **LIFO Stack**: New handlers are pushed to the top of the stack. The SW checks the most recently added handlers first.

- **Lifetime**:

  - **Configuration**: `lifetime: number` (default: Infinity).

  - **Mechanism**: The **Service Worker** tracks the usage count.

  - **Expiration**: When `usage >= lifetime`, the SW removes the route from its internal table. Subsequent requests will either fall through to the next handler in the stack or go to the network.

## 6. TypeScript Interfaces

### 6.1 Main Controller

```typescript
interface MockHandler {
  /**
   * Registers a mock.
   * 1. Stores `respond` logic in Main Thread.
   * 2. Sends `match` config to Service Worker.
   */
  add(handler: InterceptHandler, options?: InterceptOptions): Promise<void>;

  /**
   * Removes all handlers for a specific URI string.
   */
  release(uri: string): Promise<void>;

  /**
   * Removes handlers based on a specific matcher configuration.
   */
  releaseMatch(matcher: InterceptMatcher): Promise<void>;

  /**
   * Resets all handlers (SW and Main Thread).
   */
  reset(): Promise<void>;
  
  /**
   * Unregisters SW and cleans up.
   */
  stop(): Promise<void>;
}
```

### 6.2 Handler Definitions

```typescript
interface InterceptHandler {
  match: InterceptMatcher;
  respond: ResponseGenerator;
}

interface InterceptMatcher {
  /**
   * URLPattern string (e.g., '/users/:id')
   */
  uri: string;
  
  /**
   * HTTP Methods. If undefined/empty, matches ALL methods.
   */
  methods?: string[];
  
  /**
   * Headers to require. Keys are case-insensitive.
   */
  headers?: Record<string, string>;
}

interface InterceptOptions {
  /**
   * How many times this handler can be used before expiring.
   * Default: Infinity.
   */
  lifetime?: number;
  /**
   * Default: 'mock' (Handle via Main Thread)
   * 'passthrough': Explicitly allow this specific route to hit the network,
   * even if a broader wildcard mock (like '/*') exists lower in the stack.
   */
  strategy?: 'mock' | 'passthrough';
}

interface ResponseGenerator {
  status?: number;
  headers?: Record<string, string>;
  /**
   * Executed on Main Thread.
   * Returns body string, binary buffer, or Promise.
   */
  body?: string | ArrayBuffer | ((req: SerializedRequest) => Promise<string | ArrayBuffer> | string | ArrayBuffer);
  /**
   * Simulates a network error (e.g., user is offline).
   * If set, 'status' and 'body' are ignored.
   */
  error?: 'network' | 'timeout' | 'offline';
}
```

### 6.3 Internal Protocol (SW <-> Main)

```typescript
/**
 * Passed from SW to Main Thread during execution.
 */
interface SerializedRequest {
  url: string;
  method: string;
  headers: Record<string, string>;
  /**
   * Supports binary uploads (images, PDFs) via ArrayBuffer.
   * FormData can be serialized or passed as a specific structure if needed.
   */
  body: string | ArrayBuffer | null;
  params: Record<string, string>; // Extracted from URLPattern
}
```

### 6.4 Service Worker Class Definition

The `MockServiceWorker` class is the core of the worker thread. It is exposed so developers can extend it.

```typescript
// Exposed via '@jarrodek/amw/worker.js'
class MockServiceWorker {
  constructor();
  
  /**
   * Initializes event listeners (fetch, message, install, activate).
   * Call this in the SW file global scope.
   */
  start(): void;

  /**
   * Overrideable method to intercept fetch requests.
   * Useful if the user wants to add logging or custom bypass logic.
   */
  protected onFetch(event: FetchEvent): void;

  /**
   * Internal method to handle message communication with Main Thread.
   */
  protected onMessage(event: ExtendableMessageEvent): void;
}
```

#### Example: Default Implementation

The package includes a default `sw.js` that effectively does this:

```typescript
import { MockServiceWorker } from '@jarrodek/amw/sw.js';

const worker = new MockServiceWorker();
worker.start();
```

#### Example: Custom Implementation

Developers can create `custom-sw.js` to extend behavior:

```typescript
import { MockServiceWorker } from '@jarrodek/amw/sw.js';

class LoggingWorker extends MockServiceWorker {
  protected onFetch(event: FetchEvent) {
    console.log('[AMW Custom] Fetching:', event.request.url);
    super.onFetch(event);
  }
}

const worker = new LoggingWorker();
worker.start();
```
