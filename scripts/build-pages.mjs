import { copyFile, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const filenames = ['index.html', 'app.js', 'rating.js', 'styles.css', 'catalog.json', '.nojekyll'];

export async function buildPages(outputDirectory = resolve(root, 'dist')) {
  await mkdir(outputDirectory, { recursive: true });
  // Reject unexpected files instead of publishing stale or private material.
  for (const name of await readdir(outputDirectory)) {
    if (!filenames.includes(name)) throw new Error(`Unexpected file in Pages output: ${name}`);
  }
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  await writeFile(join(outputDirectory, 'index.html'), html.replace('<head>', '<head>\n  <meta name="bdon-mode" content="static">'));
  for (const name of ['app.js', 'rating.js', 'styles.css'])
    await copyFile(resolve(root, 'public', name), join(outputDirectory, name));
  await copyFile(resolve(root, 'data/catalog.json'), join(outputDirectory, 'catalog.json'));
  await writeFile(join(outputDirectory, '.nojekyll'), '');
  return outputDirectory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(`GitHub Pages preview built: ${await buildPages()}`);
