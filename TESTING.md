# Testing Guide

## Overview

AMW uses **Web Test Runner (WTR)** with **Playwright** for cross-browser testing. This setup allows us to:

- ✅ Test real Service Workers in actual browsers
- ✅ Run tests in Chromium, Firefox, and WebKit
- ✅ Get code coverage reports
- ✅ Watch mode for development
- ✅ No mocking needed - tests run in real browsers

## Installation

```bash
npm install
```

This installs:

- `@web/test-runner` - Modern test runner for web
- `@web/test-runner-playwright` - Playwright integration
- `@esm-bundle/chai` - Assertion library (ESM version)
- `@web/dev-server-esbuild` - TypeScript support in tests

## Running Tests

### Run all tests in all browsers

```bash
npm test
```

### Run in specific browsers

```bash
npm run test:chrome   # Chromium only
npm run test:firefox  # Firefox only
npm run test:webkit   # WebKit/Safari only
npm run test:all      # All browsers explicitly
```

### Watch mode (for development)

```bash
npm run test:watch
```

## Test Structure

```plain
test/
├── setup.test.js              # Service Worker setup tests
├── basic-mocking.test.js      # Core mocking functionality
├── advanced-features.test.js  # Lifetime, LIFO, errors, binary
└── cleanup.test.js            # Release, reset operations
```

### Setup Tests (`setup.test.js`)

- Service Worker registration
- Error handling for unsupported browsers
- Basic API verification

### Basic Mocking Tests (`basic-mocking.test.js`)

- Simple GET requests
- Dynamic responses with closures
- POST/PUT/DELETE methods
- Header matching
- Request data access

### Advanced Features Tests (`advanced-features.test.js`)

- **Lifetime Management**: One-time and limited-use mocks
- **LIFO Routing**: Most recent mock takes precedence
- **Network Errors**: Simulating network failures
- **Binary Data**: ArrayBuffer support
- **URL Parameters**: Path parameter extraction

### Cleanup Tests (`cleanup.test.js`)

- `release()` - Remove by URI
- `releaseMatch()` - Remove by matcher
- `reset()` - Clear all handlers

## Writing Tests

### Basic Test Structure

```javascript
import { expect } from '@esm-bundle/chai';
import { setupWorker } from '../dist/index.js';

describe('My Test Suite', () => {
  let mock;

  beforeEach(async () => {
    mock = await setupWorker({
      swPath: '/dist/sw.js',
      base: 'https://api.example.com',
    });
  });

  afterEach(async () => {
    if (mock) {
      await mock.reset();
      await mock.stop();
      mock = null;
    }
  });

  it('should mock a request', async () => {
    await mock.add({
      match: { uri: '/test' },
      respond: { body: 'Hello' },
    });

    const res = await fetch('https://api.example.com/test');
    expect(await res.text()).to.equal('Hello');
  });
});
```

### Important Patterns

#### 1. Always Clean Up

```javascript
afterEach(async () => {
  if (mock) {
    await mock.reset(); // Clear routes
    await mock.stop();  // Unregister SW
    mock = null;
  }
});
```

#### 2. Test Async Operations

```javascript
it('should handle async responses', async () => {
  await mock.add({
    match: { uri: '/data' },
    respond: {
      body: async () => {
        // Simulate async operation
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'Data';
      },
    },
  });

  const res = await fetch('https://api.example.com/data');
  expect(await res.text()).to.equal('Data');
});
```

#### 3. Test Error Cases

```javascript
it('should handle errors', async () => {
  await mock.add({
    match: { uri: '/error' },
    respond: { error: 'network' },
  });

  try {
    await fetch('https://api.example.com/error');
    expect.fail('Should have thrown');
  } catch (error) {
    expect(error).to.exist;
  }
});
```

## Code Coverage

Coverage is automatically collected when running tests:

```bash
npm test
```

Coverage reports are generated in `coverage/` directory.

### Coverage Thresholds

The project has the following coverage requirements:

- Statements: 80%
- Branches: 70%
- Functions: 80%
- Lines: 80%

## Debugging Tests

### Open Browser for Debugging

```javascript
// In web-test-runner.config.js
export default {
  // ...
  watch: true,
  open: true, // Opens browser UI
};
```

Then run:

```bash
npm run test:watch
```

### Add Console Logs

```javascript
it('should debug issue', async () => {
  console.log('Starting test...');
  
  await mock.add({
    match: { uri: '/test' },
    respond: {
      body: async (req) => {
        console.log('Request:', req);
        return 'Response';
      },
    },
  });

  const res = await fetch('https://api.example.com/test');
  console.log('Response status:', res.status);
});
```

### Browser DevTools

With `open: true`, you can:

- Inspect the Service Worker in DevTools
- Set breakpoints in your code
- View network requests
- Check console logs

## CI/CD Integration

### GitHub Actions Example

```yaml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test
      - name: Upload coverage
        uses: codecov/codecov-action@v3
```

### Running in Docker

```dockerfile
FROM mcr.microsoft.com/playwright:v1.40.0-jammy

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm test
```

## Troubleshooting

### Service Worker Not Registering

**Problem**: Tests fail with "Service Worker registration failed"

**Solution**: Ensure the SW file is being served correctly:

```javascript
// Check in test
const reg = await navigator.serviceWorker.getRegistration();
console.log('SW state:', reg?.active?.state);
```

### Tests Timeout

**Problem**: Tests hang or timeout

**Solutions**:

1. Increase timeout in config (web-test-runner.config.js):

    ```javascript
    export default {
      testsStartTimeout: 60000,
      testsFinishTimeout: 120000,
    };
    ```

2. Ensure cleanup is happening:

    ```javascript
    afterEach(async () => {
      await mock?.stop(); // Always clean up
    });
    ```

### Browser-Specific Failures

**Problem**: Tests pass in Chrome but fail in Firefox/WebKit

**Solution**: Check browser compatibility of APIs used. Use browser checks:

```javascript
it('should work in all browsers', async () => {
  // Check for URLPattern support
  if (!('URLPattern' in window)) {
    console.warn('URLPattern not supported, skipping');
    return;
  }
  // ... test
});
```

### Mock Not Matching

**Problem**: Fetch goes to network instead of mock

**Solutions**:

1. Verify SW is active:

    ```javascript
    const sw = await navigator.serviceWorker.ready;
    expect(sw.active).to.exist;
    ```

2. Check URL matching:

    ```javascript
    console.log('Mocking:', 'https://api.example.com/test');
    console.log('Fetching:', new URL('/test', 'https://api.example.com').href);
    ```

3. Verify LIFO order (most recent first)

## Performance Tips

### 1. Reuse Service Worker When Possible

```javascript
// Instead of stop/start in each test
describe('Fast Tests', () => {
  let mock;

  before(async () => {
    mock = await setupWorker({ swPath: '/dist/sw.js' });
  });

  afterEach(async () => {
    await mock.reset(); // Only reset, don't stop
  });

  after(async () => {
    await mock.stop(); // Stop once at the end
  });
});
```

### 2. Parallel Test Execution

WTR runs tests in parallel by default. Use `concurrency` to control:

```javascript
export default {
  concurrency: 4, // Number of parallel browsers
};
```

### 3. Focused Tests During Development

```javascript
it.only('should test this one thing', async () => {
  // Only this test runs
});
```

## Best Practices

1. ✅ Always clean up Service Workers in `afterEach`
2. ✅ Use descriptive test names
3. ✅ Test both success and error cases
4. ✅ Keep tests isolated (no shared state)
5. ✅ Use `beforeEach` for setup, `afterEach` for cleanup
6. ✅ Test edge cases (empty responses, large payloads, etc.)
7. ✅ Verify headers, status codes, and response bodies
8. ✅ Test across all target browsers

## Next Steps

- Run tests: `npm test`
- Check coverage: Open `coverage/index.html`
- Add new tests in `test/` directory
- Update thresholds in `web-test-runner.config.js`
