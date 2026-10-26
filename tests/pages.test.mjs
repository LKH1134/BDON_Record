import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildPages } from '../scripts/build-pages.mjs';

test('Pages artifact contains only public assets and works under a repository path', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bdon-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await buildPages(directory);
  assert.deepEqual((await readdir(directory)).sort(), ['.nojekyll', 'app.js', 'catalog.json', 'index.html', 'rating.js', 'styles.css']);
  const html = await readFile(join(directory, 'index.html'), 'utf8');
  assert.match(html, /<meta name="bdon-mode" content="static">/);
  const base = 'https://example.github.io/BDON_Record/';
  for (const match of html.matchAll(/(?:src|href)="([^"]+)"/g)) {
    if (match[1].startsWith('data:')) continue;
    assert.ok(new URL(match[1], base).href.startsWith(base), match[1]);
  }
  assert.equal(await readFile(join(directory, 'catalog.json'), 'utf8'), await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
  assert.doesNotMatch(await readFile(new URL('../public/index.html', import.meta.url), 'utf8'), /name="bdon-mode"/);
});

test('Pages build refuses to publish unexpected files', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bdon-pages-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await writeFile(join(directory, 'private.txt'), 'test fixture');
  await assert.rejects(buildPages(directory), /Unexpected file in Pages output/);
});
