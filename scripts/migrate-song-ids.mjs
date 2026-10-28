import { DatabaseSync } from 'node:sqlite';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const migration = readFileSync(new URL('../migrations/0002_song_ids.sql', import.meta.url), 'utf8');

// Only run explicitly against a named database; the default is a read-only preview.
export function migrateSongIds({ dbPath, apply = false }) {
  if (!dbPath) throw new Error('DB 경로를 --db로 지정하세요.');
  const path = resolve(dbPath);
  if (!statSync(path).isFile()) throw new Error('기존 SQLite DB 파일을 지정하세요.');
  const db = new DatabaseSync(path, { readOnly: !apply });
  try {
    const { count } = db.prepare('SELECT COUNT(*) AS count FROM records WHERE song_id BETWEEN 1001 AND 1092').get();
    const result = { dbPath: path, pendingRecords: count, migratedRecords: 0, backupPath: null, applied: apply };
    if (!apply || !count) return result;
    result.backupPath = `${path}.before-song-ids-${Date.now()}.sqlite`;
    db.prepare('VACUUM INTO ?').run(result.backupPath);
    db.exec('BEGIN IMMEDIATE');
    try {
      db.exec(migration);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }
    result.migratedRecords = count;
    return result;
  } finally { db.close(); }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = process.argv.slice(2);
    if (args[0] !== '--db' || !args[1] || args[1].startsWith('--')
        || args.length > 3 || (args.length === 3 && args[2] !== '--apply'))
      throw new Error('사용법: npm run migrate:song-ids -- --db <DB 경로> [--apply] (서버 종료 후 실행)');
    console.log(JSON.stringify(migrateSongIds({ dbPath: args[1], apply: args[2] === '--apply' }), null, 2));
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
