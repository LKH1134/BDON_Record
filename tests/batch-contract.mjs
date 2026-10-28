import assert from 'node:assert/strict';

// Run the same HTTP contract against Node SQLite and real Workers D1.
export async function batchContract(t, { client, catalog, exec }) {
  const user = client(), other = client(), guest = client();
  const password = 'batch-test-password-42';
  const { user: identity } = await user.request('/api/register', { method: 'POST', body: { username: 'BatchUser', password }, expected: 201 });
  await other.request('/api/register', { method: 'POST', body: { username: 'BatchOther', password }, expected: 201 });
  const chart = (songId, difficulty, status) => ({ songId, difficulty, status });
  const put = (records, expected = 200, headers) => user.request('/api/records', { method: 'PUT', body: { records, userId: 999 }, expected, headers });
  const read = async () => (await user.request('/api/records')).records;

  await t.test('batch enforces login and same-origin protection', async () => {
    await guest.request('/api/records', { method: 'PUT', body: { records: [] }, expected: 401 });
    await put([], 403, { Origin: 'https://attacker.example' });
  });
  await t.test('one batch creates, replaces and deletes across difficulties without touching other records', async () => {
    await put([chart(101001, 'expert', 'clear'), chart(101001, 'hard', 'fc'), chart(101002, 'easy', 'ap')]);
    await other.request('/api/records', { method: 'PUT', body: { records: [chart(101001, 'expert', 'fc')], userId: identity.id } });
    await put([chart(101001, 'expert', 'ap'), chart(101001, 'hard', null), chart(101003, 'normal', 'clear')]);
    const records = await read();
    assert.equal(records.length, 3);
    assert.equal(records.find(r => r.songId === 101001).status, 'ap');
    assert.equal(records.find(r => r.songId === 101002).status, 'ap');
    assert.equal(records.find(r => r.songId === 101003).difficulty, 'normal');
    assert.equal((await other.request('/api/records')).records[0].status, 'fc');
    const before = await read();
    await put([]);
    assert.deepEqual(await read(), before);
  });
  await t.test('invalid or duplicate entries reject the whole batch before writes', async () => {
    const before = await read();
    for (const invalid of [null, [], {}, chart(9999, 'expert', 'clear'), chart('101002', 'expert', 'clear'),
      chart(101002, 'master', 'clear'), chart(101002, 'expert', 'invalid'), { songId: 101002, difficulty: 'expert' },
      chart({ toString: null }, 'expert', 'ap')]) {
      await put([chart(101001, 'expert', null), invalid], 400);
      assert.deepEqual(await read(), before);
    }
    await put([chart(101001, 'expert', null), chart(101001, 'expert', 'clear')], 400);
    for (const records of [null, {}, 'invalid']) await put(records, 400);
    await put(Array(catalog.songs.length * 4 + 1).fill(chart(101001, 'expert', 'clear')), 400);
    await put([], 415, { 'Content-Type': 'text/plain' });
    await user.request('/api/records', { method: 'PUT', body: { padding: 'x'.repeat(1024 * 1024) }, expected: 413 });
    assert.deepEqual(await read(), before);
  });
  await t.test('a database error rolls back deletions and inserts together', async () => {
    const before = await read();
    await exec(`CREATE TRIGGER reject_batch_test BEFORE INSERT ON records
      WHEN NEW.user_id = ${identity.id} AND NEW.song_id = 101004
      BEGIN SELECT RAISE(ABORT, 'forced batch failure'); END`);
    try {
      await put([chart(101001, 'expert', null), chart(101004, 'hard', 'ap')], 500);
      assert.deepEqual(await read(), before);
    } finally { await exec('DROP TRIGGER reject_batch_test'); }
  });
  await t.test('all catalog charts fit one request and can be retried idempotently', async () => {
    const records = catalog.songs.flatMap(song => Object.keys(song.levels).map(difficulty => chart(song.id, difficulty, 'ap')));
    assert.ok(JSON.stringify({ records }).length > 4096);
    await put(records);
    assert.equal((await read()).length, records.length);
    const before = (await read()).map(({ updatedAt, ...r }) => r);
    await put(records);
    assert.deepEqual((await read()).map(({ updatedAt, ...r }) => r), before);
    await put(records.map(record => ({ ...record, status: null })));
    assert.deepEqual(await read(), []);
    assert.equal((await other.request('/api/records')).records[0].status, 'fc');
  });
}
