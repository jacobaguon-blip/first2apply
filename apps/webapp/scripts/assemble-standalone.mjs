// Post-build step: Next's standalone output copies tracing deps into
// .next/standalone/ but does NOT copy .next/static or public/. Without these,
// the server boots but serves no JS/CSS/images. This script copies them into
// the standalone tree so the bundle is self-contained for rsync to the Pi.

import { cp } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');

const standaloneApp = path.join(appRoot, '.next', 'standalone', 'apps', 'webapp');

await cp(path.join(appRoot, '.next', 'static'), path.join(standaloneApp, '.next', 'static'), {
  recursive: true,
  force: true,
});

await cp(path.join(appRoot, 'public'), path.join(standaloneApp, 'public'), {
  recursive: true,
  force: true,
});

console.log('[assemble-standalone] copied .next/static and public/ into standalone bundle');
