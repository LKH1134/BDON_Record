import { copyFile, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const logoFilenames = ['mygo.webp', 'avemujica.webp', 'ymmt.webp', 'millsage.webp', 'dr.webp'];
const filenames = ['index.html', 'app.js', 'rating.js', 'styles.css', 'brand-icon.webp', 'catalog.json', '.nojekyll', 'band-logos'];

export async function buildPages(outputDirectory = resolve(root, 'dist')) {
  await mkdir(outputDirectory, { recursive: true });
  // Reject unexpected files instead of publishing stale or private material.
  for (const name of await readdir(outputDirectory)) {
    if (!filenames.includes(name)) throw new Error(`Unexpected file in Pages output: ${name}`);
    if (name === 'band-logos') for (const logo of await readdir(join(outputDirectory, name))) {
      if (!logoFilenames.includes(logo)) throw new Error(`Unexpected file in Pages output: band-logos/${logo}`);
    }
  }
  const html = await readFile(resolve(root, 'public/index.html'), 'utf8');
  await writeFile(join(outputDirectory, 'index.html'), html.replace('<head>', '<head>\n  <meta name="bdon-mode" content="static">'));
  for (const name of ['app.js', 'rating.js', 'styles.css', 'brand-icon.webp'])
    await copyFile(resolve(root, 'public', name), join(outputDirectory, name));
  await mkdir(join(outputDirectory, 'band-logos'), { recursive: true });
  for (const name of logoFilenames)
    await copyFile(resolve(root, 'public/band-logos', name), join(outputDirectory, 'band-logos', name));
  await copyFile(resolve(root, 'data/catalog.json'), join(outputDirectory, 'catalog.json'));
  await writeFile(join(outputDirectory, '.nojekyll'), '');
  return outputDirectory;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(`GitHub Pages preview built: ${await buildPages()}`);
