import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { build } from 'esbuild';
import { Miniflare, Log, LogLevel, convertV4MiniflareOptions } from 'miniflare';
import { buildWorker } from '../scripts/build-worker.mjs';
import { calculateRating } from '../public/rating.js';

test('Workers API with a real local D1 database', { timeout: 120000 }, async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bdon-worker-test-'));
  let mf;
  t.after(async () => { if (mf) await mf.dispose(); await rm(directory, { recursive: true, force: true }); });
  const assets = await buildWorker(join(directory, 'assets'));
  const bundle = join(directory, 'worker.mjs');
  await build({ entryPoints: [resolve('worker/index.mjs')], outfile: bundle, bundle: true, format: 'esm', platform: 'neutral', target: 'es2022', external: ['node:*'] });
  async function start() {
    const options = convertV4MiniflareOptions({
      name: 'bdon-test', modules: true, script: await readFile(bundle, 'utf8'),
      compatibilityDate: '2026-10-26', compatibilityFlags: ['nodejs_compat'],
      d1Databases: { DB: 'bdon-test-db' },
      assets: { directory: assets, binding: 'ASSETS', run_worker_first: true },
      log: new Log(LogLevel.ERROR)
    });
    options.workers[0].config.assets.hasUserWorker = true;
    options.resourcePersistencePath = join(directory, 'storage');
    options.isolatedResourcePersistencePath = join(directory, 'isolated');
    mf = new Miniflare(options);
    await mf.ready;
  }
  await start();
  let db = await mf.getD1Database('DB');
  const schema = await readFile(new URL('../migrations/0001_accounts.sql', import.meta.url), 'utf8');
  await db.batch(schema.split(';').filter(sql => sql.trim()).map(sql => db.prepare(sql)));
  const origin = 'https://bdon.example';
  function client(ip = '192.0.2.1') {
    return {
      cookie: '',
      async request(path, { method = 'GET', body, raw, headers = {}, expected = 200 } = {}) {
        const response = await mf.dispatchFetch(origin + path, {
          method,
          headers: { Origin: origin, 'Content-Type': 'application/json', 'CF-Connecting-IP': ip,
            ...(this.cookie ? { Cookie: this.cookie } : {}), ...headers },
          ...((body !== undefined || raw !== undefined) ? { body: raw ?? JSON.stringify(body) } : {})
        });
        const data = await response.json();
        assert.equal(response.status, expected, JSON.stringify(data));
        assert.equal(response.headers.get('cache-control'), 'no-store');
        assert.equal(response.headers.get('x-content-type-options'), 'nosniff');
        const cookie = response.headers.get('set-cookie');
        if (cookie) {
          assert.match(cookie, /^__Host-bdon_session=/);
          assert.match(cookie, /; Secure/);
          assert.match(cookie, /; HttpOnly/);
          assert.match(cookie, /; SameSite=Strict/);
          this.cookie = cookie.split(';')[0];
        }
        return data;
      }
    };
  }
  const alice = client(), bob = client('192.0.2.2'), guest = client('192.0.2.3');
  const password = 'worker-test-password-42';
  let aliceId;

  await t.test('serves cloud UI, image and catalog without exposing private source files', async () => {
    const response = await mf.dispatchFetch(origin + '/');
    assert.equal(response.status, 200);
    assert.match(response.headers.get('content-security-policy'), /frame-ancestors 'none'/);
    assert.match(await response.text(), /name="bdon-mode" content="cloud"/);
    const image = await mf.dispatchFetch(origin + '/brand-icon.webp');
    assert.equal(image.status, 200);
    assert.match(image.headers.get('content-type'), /image\/webp/);
    assert.ok((await image.arrayBuffer()).byteLength > 0);
    for (const path of ['/Data.xlsx', '/wrangler.jsonc', '/worker/index.mjs', '/.git/config', '/.local/bdon.sqlite'])
      assert.equal((await mf.dispatchFetch(origin + path)).status, 404);
    const catalog = await guest.request('/api/catalog');
    assert.equal(catalog.songs.length, 91);
  });
  await t.test('guest cannot read or write records', async () => {
    assert.deepEqual(await guest.request('/api/me'), { user: null });
    await guest.request('/api/records', { expected: 401 });
    await guest.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'ap' }, expected: 401 });
  });
  await t.test('registers users with real Workers scrypt and hashed sessions', async () => {
    const result = await alice.request('/api/register', { method: 'POST', body: { username: 'Alice', password }, expected: 201 });
    aliceId = result.user.id;
    assert.deepEqual(Object.keys(result.user).sort(), ['id', 'username']);
    const stored = await db.prepare('SELECT * FROM users WHERE id = ?').bind(aliceId).first();
    assert.match(stored.password_hash, /^[a-f0-9]{128}$/);
    assert.match(stored.salt, /^[a-f0-9]{32}$/);
    const session = await db.prepare('SELECT token_hash FROM sessions WHERE user_id = ?').bind(aliceId).first();
    assert.notEqual(session.token_hash, alice.cookie.split('=')[1]);
    await bob.request('/api/register', { method: 'POST', body: { username: 'Bob', password }, expected: 201 });
    await guest.request('/api/register', { method: 'POST', body: { username: 'ＡＬＩＣＥ', password }, expected: 409 });
    await guest.request('/api/login', { method: 'POST', body: { username: 'Alice', password: 'incorrect' }, expected: 401 });
    await guest.request('/api/login', { method: 'POST', body: { username: 'Unknown', password }, expected: 401 });
  });
  await t.test('records replace exclusively and stay isolated by account and difficulty', async () => {
    for (const status of ['clear', 'fc', 'ap']) {
      await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status, userId: 999 } });
      const { records } = await alice.request('/api/records');
      assert.equal(records.length, 1);
      assert.equal(records[0].status, status);
    }
    await alice.request('/api/records/1001/hard', { method: 'PUT', body: { status: 'fc' } });
    await bob.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'clear', userId: aliceId } });
    const records = (await alice.request('/api/records')).records;
    assert.equal(records.length, 2);
    assert.equal(records.find(r => r.difficulty === 'expert').status, 'ap');
    assert.equal((await bob.request('/api/records')).records[0].status, 'clear');
    const catalog = await guest.request('/api/catalog');
    assert.equal(calculateRating(catalog.songs, new Map(records.map(r => [`${r.songId}:${r.difficulty}`, r.status]))), 27.5);
    await alice.request('/api/records/1001/hard', { method: 'PUT', body: { status: null } });
    assert.equal((await alice.request('/api/records')).records.length, 1);
  });
  await t.test('rejects malformed inputs and foreign origins without changing saved records', async () => {
    for (const originHeader of ['https://attacker.example', 'null', ''])
      await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'clear' }, headers: { Origin: originHeader }, expected: 403 });
    for (const status of ['invalid', '', 1, undefined])
      await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status }, expected: 400 });
    await alice.request('/api/records/9999/expert', { method: 'PUT', body: { status: 'clear' }, expected: 404 });
    await alice.request('/api/records/1001/master', { method: 'PUT', body: { status: 'clear' }, expected: 404 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', raw: '{', expected: 400 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', raw: '[]', expected: 400 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', raw: 'x'.repeat(4097), expected: 413 });
    await alice.request('/api/records/1001/expert', { method: 'PUT', body: { status: 'clear' }, headers: { 'Content-Type': 'text/plain' }, expected: 415 });
    assert.equal((await alice.request('/api/records')).records[0].status, 'ap');
    assert.equal((await mf.dispatchFetch('http://bdon.example/api/me')).status, 400);
  });
  await t.test('logout invalidates tokens and login rotates an existing session', async () => {
    const old = alice.cookie;
    await alice.request('/api/logout', { method: 'POST', body: {} });
    const stolen = client(); stolen.cookie = old;
    await stolen.request('/api/records', { expected: 401 });
    await alice.request('/api/login', { method: 'POST', body: { username: 'ALICE', password } });
    const previous = alice.cookie;
    await alice.request('/api/login', { method: 'POST', body: { username: 'Alice', password } });
    assert.notEqual(alice.cookie, previous);
    stolen.cookie = previous;
    await stolen.request('/api/records', { expected: 401 });
    assert.equal((await alice.request('/api/records')).records[0].status, 'ap');
  });
  await t.test('D1 rate limit survives Worker restarts', async () => {
    const limited = client('198.51.100.9');
    for (let i = 0; i < 20; i++)
      await limited.request('/api/login', { method: 'POST', body: {}, expected: 400 });
    await limited.request('/api/login', { method: 'POST', body: {}, expected: 429 });
    await mf.dispose(); mf = null;
    await start();
    db = await mf.getD1Database('DB');
    await limited.request('/api/login', { method: 'POST', body: {}, expected: 429 });
    assert.equal((await alice.request('/api/me')).user.username, 'Alice');
    assert.equal((await alice.request('/api/records')).records[0].status, 'ap');
    assert.equal((await bob.request('/api/records')).records[0].status, 'clear');
  });
  await t.test('expired and fabricated sessions cannot access records', async () => {
    const bobId = (await bob.request('/api/me')).user.id;
    await db.prepare('UPDATE sessions SET expires_at=0 WHERE user_id=?').bind(bobId).run();
    assert.deepEqual(await bob.request('/api/me'), { user: null });
    await bob.request('/api/records', { expected: 401 });
    guest.cookie = '__Host-bdon_session=' + '0'.repeat(64);
    await guest.request('/api/records', { expected: 401 });
  });
});
