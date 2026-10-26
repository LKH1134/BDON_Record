import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server/app.mjs';

test('local accounts and play records', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bdon-test-'));
  const dbPath = join(directory, 'test.sqlite');
  let app;
  let origin;
  async function start() {
    app = createApp({ dbPath });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  await start();
  t.after(async () => { await app.close(); await rm(directory, { recursive: true, force: true }); });
  function client() {
    return {
      cookie: '',
      async request(path, { method = 'GET', body, expected = 200, headers = {} } = {}) {
        const response = await fetch(origin + path, {
          method, headers: { 'Content-Type': 'application/json', Origin: origin, ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
          ...(body === undefined ? {} : { body: JSON.stringify(body) })
        });
        const json = await response.json();
        assert.equal(response.status, expected, JSON.stringify(json));
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
          assert.match(cookie, /HttpOnly/);
          assert.match(cookie, /SameSite=Strict/);
          this.cookie = cookie.split(';')[0];
        }
        return json;
      }
    };
  }
  const alice = client(), bob = client(), guest = client();
  const password = 'test-password-42';
  let aliceId;

  await t.test('catalog resolves all 91 string references', async () => {
    const catalog = await guest.request('/api/catalog');
    assert.equal(catalog.songs.length, 91);
    const strings = new Map(catalog.strings.map(s => [s.id, s]));
    for (const song of catalog.songs) {
      assert.ok(strings.has(song.nameId));
      assert.deepEqual(Object.keys(song.levels), ['expert','hard','normal','easy']);
    }
    assert.equal(strings.get(2001).original, '迷星叫');
  });
  await t.test('guest cannot read or change private records', async () => {
    assert.deepEqual(await guest.request('/api/me'), { user: null });
    await guest.request('/api/records', { expected: 401 });
    await guest.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'ap' }, expected: 401 });
  });
  await t.test('registers users with hashed passwords and private cookies', async () => {
    const result = await alice.request('/api/register', { method: 'POST', body: { username: 'Alice', password }, expected: 201 });
    aliceId = result.user.id;
    assert.equal(result.user.username, 'Alice');
    assert.deepEqual(Object.keys(result.user).sort(), ['id','username']);
    const stored = app.db.prepare('SELECT * FROM users WHERE id=?').get(aliceId);
    assert.notEqual(stored.password_hash, password);
    assert.equal(stored.password_hash.length, 128);
    assert.equal(stored.salt.length, 32);
    assert.notEqual(app.db.prepare('SELECT token_hash FROM sessions WHERE user_id=?').get(aliceId).token_hash, alice.cookie.split('=')[1]);
    await bob.request('/api/register', { method: 'POST', body: { username: 'Bob', password }, expected: 201 });
  });
  await t.test('rejects duplicate accounts and invalid credentials', async () => {
    await guest.request('/api/register', { method: 'POST', body: { username: 'alice', password }, expected: 409 });
    await guest.request('/api/register', { method: 'POST', body: { username: 'x', password: 'short' }, expected: 400 });
    await guest.request('/api/login', { method: 'POST', body: { username: 'Alice', password: 'wrong-password' }, expected: 401 });
  });
  await t.test('replaces clear with FC and AP using one exclusive record', async () => {
    for (const status of ['clear','fc','ap']) {
      await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status } });
      const { records } = await alice.request('/api/records');
      assert.equal(records.length, 1);
      assert.equal(records[0].status, status);
      assert.equal(records[0].songId, 1001);
    }
  });
  await t.test('separates accounts, songs, and difficulties', async () => {
    assert.deepEqual(await bob.request('/api/records'), { records: [] });
    await bob.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'clear', userId: aliceId } });
    await alice.request('/api/records/1001/hard', { method: 'PUT', body: { status: 'fc' } });
    await alice.request('/api/records/1002/expert', { method: 'PUT', body: { status: 'clear' } });
    const aliceRecords = (await alice.request('/api/records')).records;
    assert.equal(aliceRecords.length, 3);
    assert.equal(aliceRecords.find(r => r.songId === 1001 && r.difficulty === 'expert').status, 'ap');
    assert.equal((await bob.request('/api/records')).records[0].status, 'clear');
  });
  await t.test('unchecking removes just the selected chart record', async () => {
    await alice.request('/api/records/1001/hard', { method: 'PUT', body: { status: null } });
    const { records } = await alice.request('/api/records');
    assert.equal(records.length, 2);
    assert.ok(!records.some(r => r.difficulty === 'hard'));
    assert.equal((await bob.request('/api/records')).records.length, 1);
  });
  await t.test('rejects invalid status, nonexistent songs, invalid difficulties, and untrusted origins', async () => {
    await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'all-three' }, expected: 400 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', body: {}, expected: 400 });
    await alice.request('/api/records/9999/expert', { method: 'PUT', body: { status: 'ap' }, expected: 404 });
    await alice.request('/api/records/1001/master', { method: 'PUT', body: { status: 'ap' }, expected: 404 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'clear' }, headers: { Origin: 'https://example.com' }, expected: 403 });
    assert.equal((await alice.request('/api/records')).records.find(r => r.songId === 1001).status, 'ap');
  });
  await t.test('serves UI and does not expose local database or workbook', async () => {
    const response = await fetch(origin);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await response.text(), /곡 라이브러리/);
    for (const path of ['/app.js','/rating.js','/styles.css']) assert.equal((await fetch(origin + path)).status, 200);
    for (const path of ['/.local/bdon.sqlite','/Data.xlsx','/server/app.mjs','/.git/config']) assert.equal((await fetch(origin + path)).status, 404);
  });
  await t.test('logout invalidates session and login restores stored records', async () => {
    const oldCookie = alice.cookie;
    await alice.request('/api/logout', { method: 'POST', body: {} });
    await alice.request('/api/records', { expected: 401 });
    const stolen = client(); stolen.cookie = oldCookie;
    await stolen.request('/api/records', { expected: 401 });
    await alice.request('/api/login', { method: 'POST', body: { username: 'ALICE', password } });
    assert.equal((await alice.request('/api/records')).records.length, 2);
  });
  await t.test('preserves users, sessions and records across server restart', async () => {
    await app.close();
    await start();
    assert.equal((await alice.request('/api/me')).user.username, 'Alice');
    assert.equal((await alice.request('/api/records')).records.length, 2);
    assert.equal((await bob.request('/api/records')).records[0].status, 'clear');
  });
  await t.test('expired sessions cannot read records', async () => {
    const userId = (await bob.request('/api/me')).user.id;
    app.db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').run(userId);
    await bob.request('/api/records', { expected: 401 });
    assert.deepEqual(await bob.request('/api/me'), { user: null });
  });
  await t.test('workbook remains the catalog source', async () => {
    const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
    assert.equal(catalog.source, 'Data.xlsx');
    assert.equal(catalog.songs[0].id, 1001);
    assert.equal(catalog.songs[0].nameId, 2001);
  });
});
