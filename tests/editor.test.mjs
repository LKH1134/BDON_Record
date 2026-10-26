import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { build } from 'esbuild';
import { JSDOM } from 'jsdom';

const sourceHtml = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const { outputFiles } = await build({ entryPoints: ['public/app.js'], bundle: true, write: false, format: 'iife', platform: 'browser' });
async function until(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  assert.fail('UI did not reach the expected state');
}
async function editor(t, { guest = false, preview = false } = {}) {
  const html = preview ? sourceHtml.replace('<head>', '<head><meta name="bdon-mode" content="static">') : sourceHtml;
  const dom = new JSDOM(html, { url: 'http://localhost:3000/', runScripts: 'outside-only' });
  t.after(() => dom.window.close());
  const { window } = dom;
  const $ = id => window.document.getElementById(id);
  // jsdom does not implement native dialog opening/closing.
  window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
  const requests = [];
  let saved = [{ songId: 1001, difficulty: 'expert', status: 'clear' }];
  let failure, release;
  window.fetch = async (url, options = {}) => {
    const path = new URL(url, window.location.href).pathname;
    const body = options.body && JSON.parse(options.body);
    requests.push({ path, method: options.method || 'GET', body });
    if (options.method === 'PUT') {
      if (release) await new Promise(resolve => { release.resolve = resolve; });
      if (failure === 'network') throw new Error('offline');
      if (failure) return Response.json({ error: '테스트 저장 실패' }, { status: failure });
      for (const change of body.records) {
        saved = saved.filter(r => r.songId !== change.songId || r.difficulty !== change.difficulty);
        if (change.status !== null) saved.push(change);
      }
      return Response.json({ ok: true });
    }
    if (path === '/api/catalog' || path === '/catalog.json') return Response.json(catalog);
    if (path === '/api/me') return Response.json({ user: guest ? null : { id: 1, username: 'Editor' } });
    if (path === '/api/records') return Response.json({ records: saved });
    throw new Error(`Unexpected request: ${path}`);
  };
  window.eval(outputFiles[0].text);
  await until(() => $('song-list').querySelector('input') && (preview || !$('edit-button').disabled));
  requests.length = 0;
  return {
    window, $, requests,
    check: (song, status) => $('song-list').querySelector(`input[data-song="${song}"][data-status="${status}"]`),
    difficulty: value => window.document.querySelector(`[data-difficulty="${value}"]`).click(),
    saved: () => saved, fail: value => { failure = value; },
    pause: () => { release = {}; }, resume: () => { release.resolve(); release = null; }
  };
}

test('editing across difficulties stays local and Save sends exactly one request with final changes', async t => {
  const ui = await editor(t);
  assert.ok(ui.check(1001, 'clear').disabled);
  ui.$('edit-button').click();
  ui.check(1001, 'fc').click();
  ui.check(1001, 'ap').click();
  assert.equal(ui.check(1001, 'fc').checked, false);
  ui.check(1002, 'clear').click();
  ui.difficulty('hard');
  ui.check(1003, 'fc').click();
  ui.$('search').value = '迷星叫';
  ui.$('search').dispatchEvent(new ui.window.Event('input'));
  ui.difficulty('expert');
  assert.ok(ui.check(1001, 'ap').checked);
  assert.equal(ui.requests.length, 0);
  assert.match(ui.$('save-state').textContent, /3개 변경/);
  ui.$('save-button').click();
  await until(() => ui.$('save-button').hidden);
  assert.deepEqual(ui.requests, [{ path: '/api/records', method: 'PUT', body: { records: [
    { songId: 1001, difficulty: 'expert', status: 'ap' },
    { songId: 1002, difficulty: 'expert', status: 'clear' },
    { songId: 1003, difficulty: 'hard', status: 'fc' }
  ] } }]);
  assert.ok(ui.check(1001, 'ap').disabled);
  assert.match(ui.$('save-state').textContent, /모든 기록 저장됨/);
});

test('Cancel restores saved records and ratings; unchanged or reverted edits send no requests', async t => {
  const ui = await editor(t);
  const rating = ui.$('stat-rating').textContent;
  ui.$('edit-button').click();
  ui.check(1001, 'clear').click();
  ui.difficulty('easy');
  ui.check(1002, 'ap').click();
  ui.$('cancel-button').click();
  ui.difficulty('expert');
  assert.ok(ui.check(1001, 'clear').checked);
  assert.equal(ui.$('stat-rating').textContent, rating);
  ui.$('edit-button').click();
  ui.$('save-button').click();
  ui.$('edit-button').click();
  ui.check(1001, 'ap').click();
  ui.check(1001, 'clear').click();
  ui.check(1002, 'fc').click();
  ui.check(1002, 'fc').click();
  assert.match(ui.$('save-state').textContent, /0개 변경/);
  ui.$('save-button').click();
  assert.ok(ui.$('save-button').hidden);
  assert.equal(ui.requests.length, 0);
});

test('failed saves retain the draft for retry and in-flight saves cannot submit twice', async t => {
  const ui = await editor(t);
  ui.$('edit-button').click();
  ui.check(1001, 'clear').click();
  ui.check(1002, 'ap').click();
  for (const failure of [500, 'network']) {
    ui.fail(failure);
    ui.$('save-button').click();
    await until(() => !ui.$('save-button').disabled);
    assert.equal(ui.$('save-button').hidden, false);
    assert.ok(ui.check(1002, 'ap').checked);
    assert.equal(ui.check(1001, 'clear').checked, false);
    assert.equal(ui.saved().length, 1);
    assert.match(ui.$('save-state').textContent, /저장 실패/);
  }
  ui.requests.length = 0;
  ui.fail(null); ui.pause();
  ui.$('save-button').click();
  ui.$('save-button').click();
  ui.$('cancel-button').click();
  assert.ok(ui.$('cancel-button').disabled);
  assert.ok(ui.check(1002, 'ap').disabled);
  assert.equal(ui.requests.length, 1);
  ui.resume();
  await until(() => ui.$('save-button').hidden);
  assert.deepEqual(ui.saved(), [{ songId: 1002, difficulty: 'expert', status: 'ap' }]);
});

test('unsaved edits warn on navigation and expired sessions keep drafts until explicit cancellation', async t => {
  const ui = await editor(t);
  const leaving = () => {
    const event = new ui.window.Event('beforeunload', { cancelable: true });
    ui.window.dispatchEvent(event);
    return event.defaultPrevented;
  };
  ui.$('edit-button').click();
  assert.equal(leaving(), false);
  ui.check(1002, 'ap').click();
  assert.equal(leaving(), true);
  ui.$('account-button').click();
  assert.equal(ui.$('account-dialog').open, false);
  ui.fail(401); ui.$('save-button').click();
  await until(() => !ui.$('save-button').disabled);
  assert.ok(ui.check(1002, 'ap').checked);
  assert.match(ui.$('save-state').textContent, /로그인 만료/);
  ui.$('cancel-button').click();
  assert.ok(ui.$('auth-dialog').open);
  assert.equal(leaving(), false);
});

test('guests enter login from Edit and static previews remain read-only', async t => {
  const guest = await editor(t, { guest: true });
  guest.$('edit-button').click();
  assert.ok(guest.$('auth-dialog').open);
  assert.ok(guest.check(1001, 'clear').disabled);
  assert.equal(guest.requests.length, 0);
  const preview = await editor(t, { preview: true });
  assert.ok(preview.$('edit-controls').hidden);
  assert.ok(preview.check(1001, 'clear').disabled);
  assert.equal(preview.requests.length, 0);
});
