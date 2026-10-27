import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRating, calculateChartRating, getRatingBreakdown } from '../public/rating.js';

test('individual chart rating uses the selected difficulty and clear state', () => {
  assert.equal(calculateChartRating(20, undefined), 0);
  assert.equal(calculateChartRating(20, 'clear'), 40);
  assert.equal(calculateChartRating(20, 'fc'), 42);
  assert.equal(calculateChartRating(20, 'ap'), 44);
  assert.equal(calculateChartRating(29, 'fc'), 60.9);
  assert.equal(calculateChartRating(21, 'fc'), 44.1);
});

test('rating applies coefficients without multiplying the result by 100', () => {
  const songs = [{id: 1, levels: {expert: 29, hard: 21, normal: 13, easy: 8}}];
  assert.equal(calculateRating(songs, new Map()), 0);
  assert.equal(calculateRating(songs, new Map([['1:expert','clear']])), 58);
  assert.equal(calculateRating(songs, new Map([['1:expert','fc']])), 60.9);
  assert.equal(calculateRating(songs, new Map([['1:expert','ap']])), 63.8);
});

test('each song contributes its best chart, updating when that record is removed', () => {
  const songs = [
    {id: 1, levels: {expert: 29, hard: 21}},
    {id: 2, levels: {expert: 20}},
    {id: 3, levels: {expert: 30}}
  ];
  const records = new Map([['1:expert','ap'], ['1:hard','fc'], ['2:expert','fc']]);
  assert.equal(calculateRating(songs, records), 105.8);
  records.delete('1:expert');
  assert.equal(calculateRating(songs, records), 86.1);
  records.delete('1:hard');
  assert.equal(calculateRating(songs, records), 42);
});

test('50 level-29 AP songs total 3190 and extra charts do not inflate it', () => {
  const songs = Array.from({length:50}, (_,i) => ({id:i+1,levels:{expert:29,hard:23}}));
  const records = new Map(songs.flatMap(song => [[`${song.id}:expert`, 'ap'], [`${song.id}:hard`, 'ap']]));
  assert.equal(calculateRating(songs, records), 3190);
});

test('top-50 cutoff compares rating scores, including a stronger chart replacing an excluded song', () => {
  const songs = Array.from({length:49}, (_,i) => ({id:i+1,levels:{expert:29}}));
  songs.push({id:50,levels:{expert:28,hard:29}}, {id:51,levels:{expert:29}}, {id:52,levels:{expert:30}});
  const records = new Map(songs.slice(0,49).map(song => [`${song.id}:expert`, 'ap']));
  records.set('50:expert', 'ap'); // 61.6 beats both 58 and 60.9.
  records.set('50:hard', 'clear');
  records.set('51:expert', 'fc');
  assert.equal(calculateRating(songs, records), 3187.8);
  records.set('51:expert', 'ap');
  assert.equal(calculateRating(songs, records), 3190);
});

test('breakdown selects one best chart per song and preserves deterministic ties', () => {
  const songs = [
    { id: 1, levels: { expert: 20, hard: 19 } },
    { id: 2, levels: { expert: 21, hard: 20 } },
    { id: 3, levels: { expert: 21 } },
    { id: 4, levels: { expert: 30 } }
  ];
  const records = new Map([['1:expert', 'clear'], ['1:hard', 'ap'],
    ['2:expert', 'clear'], ['2:hard', 'fc'], ['3:expert', 'clear'], ['999:expert', 'ap']]);
  assert.deepEqual(getRatingBreakdown(songs, records), {
    total: 125.8,
    entries: [
      { songId: 2, difficulty: 'expert', level: 21, status: 'clear', rating: 42 },
      { songId: 3, difficulty: 'expert', level: 21, status: 'clear', rating: 42 },
      { songId: 1, difficulty: 'hard', level: 19, status: 'ap', rating: 41.8 }
    ]
  });
  assert.deepEqual(getRatingBreakdown(songs, new Map()), { total: 0, entries: [] });
});

test('breakdown contains only the top 50 distinct songs, sorted by earned rating', () => {
  const songs = Array.from({ length: 52 }, (_, i) => ({ id: i + 1, levels: { expert: 25, hard: 20 } }));
  const records = new Map(songs.flatMap(song => [[`${song.id}:expert`, 'fc'], [`${song.id}:hard`, 'ap']]));
  records.set('52:expert', 'ap');
  const { entries, total } = getRatingBreakdown(songs, records);
  assert.equal(total, 2627.5); // 55 + 49 × 52.5, with no floating-point summation drift.
  assert.equal(total, calculateRating(songs, records));
  assert.equal(entries.length, 50);
  assert.deepEqual(entries.map(entry => entry.songId), [52, ...Array.from({ length: 49 }, (_, i) => i + 1)]);
  assert.ok(entries.every(entry => entry.difficulty === 'expert'));
  assert.equal(new Set(entries.map(entry => entry.songId)).size, 50);
  assert.equal(records.size, 104);
});
