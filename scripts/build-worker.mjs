import { readFile, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPages } from './build-pages.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));

export async function buildWorker(outputDirectory = resolve(root, 'dist-worker')) {
  await buildPages(outputDirectory);
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  await writeFile(join(outputDirectory, 'index.html'), html.replace('<head>', '<head>\n  <meta name="bdon-mode" content="cloud">'));
  return outputDirectory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(`Cloudflare assets built: ${await buildWorker()}`);
