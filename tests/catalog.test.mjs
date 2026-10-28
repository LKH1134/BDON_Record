import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';

const catalog = JSON.parse(await readFile(new URL('../data/catalog.json',import.meta.url),'utf8'));

test('six-digit IDs group all songs by band and original/cover without changing string references', () => {
  const groups = new Map([[101,18],[102,7],[201,18],[202,7],[301,17],[302,5],[401,5],[402,5],[501,5],[502,5],[601,1]]);
  const bands = {10:'MyGO!!!!!',20:'Ave Mujica',30:'무겐다이 뮤타입',40:'millsage',50:'일가 Dumb Rock!',60:'CRYCHIC'};
  assert.equal(new Set(catalog.songs.map(s=>s.id)).size,93);
  assert.equal(new Set(catalog.songs.map(s=>s.nameId)).size,93);
  assert.equal(catalog.songs.filter(s=>s.category==='오리지널').length,64);
  assert.equal(catalog.songs.filter(s=>s.category==='커버').length,29);
  for (const [prefix,count] of groups) {
    const songs = catalog.songs.filter(s=>Math.floor(s.id/1000)===prefix);
    assert.deepEqual(songs.map(s=>s.id),Array.from({length:count},(_,i)=>prefix*1000+i+1));
    for (const song of songs) {
      assert.equal(song.category, prefix%10===1?'오리지널':'커버');
      assert.equal(song.band,bands[Math.floor(prefix/10)]);
      assert.ok(catalog.strings.some(s=>s.id===song.nameId));
    }
  }
  for (const [nameId,id] of [[2001,101001],[2019,201001],[2037,301001],[2054,401001],[2059,501001],
      [2064,601001],[2065,102001],[2071,202001],[2076,302001],[2081,402001],[2086,502001],[2091,202006],[2092,102007],[2093,202007]])
    assert.equal(catalog.songs.find(s=>s.nameId===nameId).id,id);
});

test('Python importer enforces workbook schema, category, IDs, references and difficulty bounds', () => {
  execFileSync('python',['-X','utf8','tests/import_data_test.py'],{cwd:new URL('../',import.meta.url),stdio:'pipe'});
  const data = JSON.parse(execFileSync('python',['-X','utf8','-c',
    'import json; from scripts.import_data import ROOT, read_workbook, build_catalog; print(json.dumps(build_catalog(read_workbook(ROOT / "Data.xlsx"))))'],
    {cwd:new URL('../',import.meta.url),encoding:'utf8'}));
  assert.deepEqual(data.songs,catalog.songs);
  assert.deepEqual(data.strings,catalog.strings);
});
