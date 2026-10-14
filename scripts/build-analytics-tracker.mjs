import { build } from 'esbuild';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Deploy this small asset into an existing static site without replacing its UI build.
const output = resolve(process.argv[2] || 'temp/analytics-tracker');
const result = await build({ stdin: { contents: "import { startVisitTracking } from './src/lib/analytics.ts'; startVisitTracking();", resolveDir: process.cwd(), loader: 'ts' },
  bundle: true, write: false, minify: true, format: 'iife', target: 'es2020',
  define: { 'import.meta.env.VITE_ANALYTICS_ENABLED': '"true"' },
});
const code = result.outputFiles[0].contents;
const filename = 'site-analytics-' + createHash('sha256').update(code).digest('hex').slice(0, 12) + '.js';
await mkdir(output, { recursive: true });
await writeFile(resolve(output, filename), code);
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ filename, bytes: code.length }));
console.log(filename + ' (' + code.length + ' bytes)');
