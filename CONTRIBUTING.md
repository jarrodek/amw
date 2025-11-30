# Contributor Guide

Thank you for contributing to AMW! Your help is appreciated.

## Getting Started

1. **Fork and clone the repository**

   ```bash
   git clone https://github.com/jarrodek/amw.git
   cd amw
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Build the project**

   ```bash
   npm run build
   ```

4. **Run tests**

   ```bash
   npm test
   ```

## Development Workflow

### Making Changes

1. Create a feature branch:

   ```bash
   git checkout -b feature/my-feature
   ```

2. Make your changes in `src/`

3. Build and test:

   ```bash
   npm run build
   npm test
   ```

4. Commit with clear messages:

   ```bash
   git commit -m "feat: add new feature"
   ```

### Commit Message Convention

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `test:` - Test additions or changes
- `refactor:` - Code refactoring
- `perf:` - Performance improvements
- `chore:` - Build process or tooling changes

Examples:

```plain
feat: add support for wildcard URL patterns
fix: correct header matching case sensitivity
docs: update README with new examples
test: add coverage for binary data handling
```

## Testing

### Running Tests

```bash
# All browsers
npm test

# Specific browser
npm run test:chrome
npm run test:firefox
npm run test:webkit

# Watch mode
npm run test:watch
```

### Writing Tests

1. Create test file in `test/` directory
2. Follow existing test patterns
3. Ensure cleanup in `afterEach`
4. Test across browsers when possible

See [TESTING.md](./TESTING.md) for detailed testing guide.

### Test Coverage

Maintain coverage above:

- Statements: 80%
- Branches: 70%
- Functions: 80%
- Lines: 80%

## Code Style

### TypeScript

- Use strict TypeScript
- Export types for public API
- Add JSDoc comments for public methods
- Prefer `async/await` over callbacks

### File Organization

```plain
src/
├── types/      # Type definitions
├── shared/     # Code shared between main/worker
├── main/       # Main thread code
├── worker/     # Service Worker code
├── index.ts    # Main entry point
├── sw.ts       # Default SW script
└── worker.ts   # Worker exports
```

### Code Examples

**Good:**

```typescript
/**
 * Registers a mock interceptor.
 * @param handler - The intercept handler configuration
 * @param options - Optional configuration
 */
async add(handler: InterceptHandler, options?: InterceptOptions): Promise<void> {
  // Implementation
}
```

**Avoid:**

```typescript
// No docs, unclear parameter names
async add(h: any, o?: any): Promise<void> {
  // Implementation
}
```

## Pull Request Process

1. **Update documentation**
   - Add/update JSDoc comments
   - Update README if adding features
   - Update DEVELOPMENT.md for architecture changes

2. **Add tests**
   - All new features need tests
   - Bug fixes should include regression tests
   - Maintain coverage thresholds

3. **Build and test**

   ```bash
   npm run build
   npm test
   ```

4. **Create PR**
   - Clear title following commit conventions
   - Describe what changed and why
   - Reference related issues
   - Include test results

5. **Review process**
   - Address review comments
   - Keep commits clean
   - Rebase if needed

## Architecture Guidelines

### Distributed Registry Pattern

Remember AMW's core architecture:

- **Service Worker**: Fast routing, no closures
- **Main Thread**: Response generation, closure access
- **MessageChannel**: Dedicated communication

### Adding Features

#### Example: Adding a new matcher option

1. **Update types** (`src/types/index.ts`):

   ```typescript
   export interface InterceptMatcher {
     // ... existing
     newOption?: string;
   }
   ```

2. **Update Service Worker** (`src/worker/RouteMatcher.ts`):

   ```typescript
   static createRouteDefinition(/*...*/) {
     // Handle new option
   }
   ```

3. **Add tests** (`test/new-feature.test.js`):

   ```javascript
   it('should support new option', async () => {
     await mock.add({
       match: { uri: '/test', newOption: 'value' },
       respond: { body: 'Test' }
     });
     // Test it works
   });
   ```

4. **Update docs** (README.md, DEVELOPMENT.md)

## Common Tasks

### Adding a New Message Type

1. Add to `src/types/messages.ts`:

   ```typescript
   export interface NewMessage extends BaseMessage {
     type: MessageType.NEW_MESSAGE;
     payload: { /* ... */ };
   }
   ```

2. Update `Message` union type

3. Handle in `MockServiceWorker.onMessage()`

4. Handle in `MockHandlerImpl` if needed

### Extending the Service Worker

Document in examples:

```typescript
// examples/custom-sw.ts
import { MockServiceWorker } from '@jarrodek/amw/worker';

class CustomWorker extends MockServiceWorker {
  protected onFetch(event: FetchEvent) {
    // Custom logic
    super.onFetch(event);
  }
}
```

## Debugging

### Service Worker Issues

1. Check SW registration:

   ```javascript
   const reg = await navigator.serviceWorker.getRegistration();
   console.log('SW state:', reg?.active?.state);
   ```

2. View SW in DevTools:
   - Chrome: `chrome://serviceworker-internals/`
   - Firefox: `about:debugging#/runtime/this-firefox`

3. Check message flow:

   ```typescript
   // Add logging in MockServiceWorker
   protected onMessage(event: ExtendableMessageEvent) {
     console.log('[SW] Message:', event.data);
     super.onMessage(event);
   }
   ```

### Build Issues

```bash
# Clean build
npm run clean
npm run build

# Check TypeScript errors
npx tsc --noEmit
```

## Resources

- [Service Worker API](https://developer.mozilla.org/en-US/docs/Web/API/Service_Worker_API)
- [URLPattern API](https://developer.mozilla.org/en-US/docs/Web/API/URLPattern)
- [Web Test Runner](https://modern-web.dev/docs/test-runner/overview/)
- [Playwright](https://playwright.dev/)

## Questions?

- Open an issue for bugs
- Start a discussion for questions
- Check existing issues/PRs first

## License

By contributing, you agree that your contributions will be licensed under the Apache 2.0 License.
