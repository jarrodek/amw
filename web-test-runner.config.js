import { playwrightLauncher } from '@web/test-runner-playwright'
import { esbuildPlugin } from '@web/dev-server-esbuild'

export default {
  nodeResolve: true,

  files: 'test/**/*.test.ts',

  // Support TypeScript in test files
  plugins: [
    esbuildPlugin({
      ts: true,
      target: 'es2022',
      sourcemap: 'inline',
    }),
  ],

  // Browsers to test
  browsers: [
    playwrightLauncher({ product: 'chromium' }),
    playwrightLauncher({ product: 'firefox' }),
    playwrightLauncher({ product: 'webkit' }),
  ],

  // Service Worker support
  middleware: [
    function serviceWorkerMiddleware(context, next) {
      // Ensure SW files are served with correct MIME type
      if (context.url.endsWith('.js') && context.url.includes('/dist/')) {
        context.set('Service-Worker-Allowed', '/')
      }
      return next()
    },
  ],

  // Test configuration
  testsStartTimeout: 30000,
  testsFinishTimeout: 60000,
  browserStartTimeout: 30000,

  // Coverage
  coverage: true,
  coverageConfig: {
    // Instrument built JS (source maps map back to TS)
    include: ['dist/**/*.js'],
    exclude: ['dist/**/*.d.ts', 'test/**/*'],
    threshold: {
      statements: 80,
      branches: 70,
      functions: 80,
      lines: 80,
    },
  },

  // Useful for debugging
  // watch: true,
  // open: true,
}
