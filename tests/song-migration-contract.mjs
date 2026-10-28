import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { calculateRating } from '../public/rating.js';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json', import.meta.url), 'utf8'));
const newIds = new Map(catalog.songs.map(song => [song.nameId - 1000, song.id]));

// Run against temporary Node SQLite and real Workers D1 databases.
export async function songMigrationContract({ execute, query, migrate, assertUnavailable }) {
  await execute(`INSERT INTO users (id, username, username_key, salt, password_hash, created_at) VALUES
    (7001, 'LegacyA', 'legacya', 'salt-a', 'hash-a', '2026-10-01'),
    (7002, 'LegacyB', 'legacyb', 'salt-b', 'hash-b', '2026-10-02')`);
  await execute(`INSERT INTO sessions (token_hash, user_id, expires_at) VALUES ('legacy-session', 7001, 9999999999999)`);
  const before = [];
  for (const user of [7001, 7002]) {
    for (let oldId = 1001; oldId <= 1092; oldId++) {
      for (const [index, difficulty] of ['expert','hard','normal','easy'].entries()) {
        before.push({ user_id: user, song_id: oldId, difficulty,
          status: ['clear','fc','ap'][(oldId + index + user) % 3],
          updated_at: `2026-10-27T00:00:${String(index).padStart(2,'0')}.000Z` });
      }
    }
  }
  // An unrelated pre-existing ID must remain intact.
  before.push({ user_id: 7001, song_id: 9999, difficulty: 'expert', status: 'fc', updated_at: '2026-10-01' });
  await execute(`INSERT INTO records (user_id, song_id, difficulty, status, updated_at) VALUES ${before.map(r =>
    `(${r.user_id},${r.song_id},'${r.difficulty}','${r.status}','${r.updated_at}')`).join(',')}`);
  const users = await query('SELECT * FROM users ORDER BY id');
  const sessions = await query('SELECT * FROM sessions ORDER BY token_hash');
  await assertUnavailable();
  await migrate();
  const records = await query('SELECT * FROM records WHERE user_id IN (7001,7002) ORDER BY user_id,song_id,difficulty');
  const expected = before.map(r => ({...r, song_id:newIds.get(r.song_id) ?? r.song_id}))
    .sort((a,b)=>a.user_id-b.user_id || a.song_id-b.song_id || a.difficulty.localeCompare(b.difficulty));
  assert.deepEqual(records, expected);
  assert.equal(records.length, 737);
  const legacySongs = catalog.songs.map(song=>({...song,id:song.nameId-1000}));
  for (const userId of [7001,7002]) {
    const recordMap = rows=>new Map(rows.filter(r=>r.user_id===userId).map(r=>[`${r.song_id}:${r.difficulty}`,r.status]));
    assert.equal(calculateRating(catalog.songs,recordMap(records)),calculateRating(legacySongs,recordMap(before)));
  }
  assert.deepEqual(await query('SELECT * FROM users ORDER BY id'), users);
  assert.deepEqual(await query('SELECT * FROM sessions ORDER BY token_hash'), sessions);
  await migrate();
  assert.deepEqual(await query('SELECT * FROM records WHERE user_id IN (7001,7002) ORDER BY user_id,song_id,difficulty'), records);

  // A conflicting new ID must abort the entire UPDATE, including unrelated moves.
  await execute(`INSERT INTO users (id, username, username_key, salt, password_hash, created_at)
    VALUES (7003,'Conflict','conflict','salt','hash','2026-10-28')`);
  await execute(`INSERT INTO records VALUES
    (7003,1001,'expert','clear','old'), (7003,101001,'expert','ap','new'), (7003,1002,'hard','fc','old')`);
  const snapshot = await query('SELECT * FROM records ORDER BY user_id,song_id,difficulty');
  await assert.rejects(async () => migrate());
  assert.deepEqual(await query('SELECT * FROM records ORDER BY user_id,song_id,difficulty'), snapshot);
}
