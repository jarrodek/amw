#!/usr/bin/env node

/**
 * Build script to bundle the Service Worker using esbuild.
 * Service Workers need to be bundled as a single file without external imports.
 */

import { build } from 'esbuild';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

async function buildServiceWorker() {
  try {
    // Bundle the Service Worker
    await build({
      entryPoints: [join(rootDir, 'src/sw.ts')],
      bundle: true,
      outfile: join(rootDir, 'dist/sw.js'),
      format: 'iife', // Immediately Invoked Function Expression - no module system
      target: 'es2022',
      platform: 'browser',
      sourcemap: true,
      minify: false, // Keep readable for debugging
      legalComments: 'inline',
    });

    console.log('✓ Service Worker bundled successfully');
  } catch (error) {
    console.error('✗ Failed to bundle Service Worker:', error);
    process.exit(1);
  }
}

buildServiceWorker();
