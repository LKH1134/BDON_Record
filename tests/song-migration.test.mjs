import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../server/app.mjs';
import { migrateSongIds } from '../scripts/migrate-song-ids.mjs';
import { songMigrationContract } from './song-migration-contract.mjs';

test('explicit SQLite song migration preserves all records, accounts and sessions; conflicts roll back', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'bdon-song-migration-'));
  const dbPath = join(directory,'test.sqlite');
  const db = new DatabaseSync(dbPath);
  t.after(async()=>{db.close(); await rm(directory,{recursive:true,force:true});});
  db.exec(await readFile(new URL('../migrations/0001_accounts.sql',import.meta.url),'utf8'));
  let backupChecked = false;
  await songMigrationContract({
    execute: sql => db.exec(sql),
    query: sql => db.prepare(sql).all().map(r=>({...r})),
    assertUnavailable: () => {
      assert.throws(()=>createApp({dbPath}),/기존 곡 ID 기록/);
      const preview = migrateSongIds({dbPath});
      assert.equal(preview.pendingRecords,736);
      assert.equal(preview.migratedRecords,0);
      assert.equal(preview.backupPath,null);
      assert.equal(db.prepare('SELECT COUNT(*) AS n FROM records WHERE song_id BETWEEN 1001 AND 1092').get().n,736);
    },
    migrate: () => {
      const result = migrateSongIds({dbPath,apply:true});
      if (!backupChecked) {
        assert.equal(result.migratedRecords,736);
        const backup = new DatabaseSync(result.backupPath,{readOnly:true});
        try { assert.equal(backup.prepare('SELECT COUNT(*) AS n FROM records WHERE song_id BETWEEN 1001 AND 1092').get().n,736); }
        finally {backup.close();}
        const app = createApp({dbPath});
        app.db.close();
        backupChecked = true;
      }
      return result;
    }
  });
});
