import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateRating, calculateChartRating } from '../public/rating.js';

test('individual chart rating uses the selected difficulty and clear state', () => {
  assert.equal(calculateChartRating(20, undefined), 0);
  assert.equal(calculateChartRating(20, 'clear'), 20);
  assert.equal(calculateChartRating(20, 'fc'), 21);
  assert.equal(calculateChartRating(20, 'ap'), 22);
  assert.equal(calculateChartRating(29, 'fc'), 30.45);
  assert.equal(calculateChartRating(21, 'fc'), 22.05);
});

test('rating applies coefficients without multiplying the result by 100', () => {
  const songs = [{id: 1, levels: {expert: 29, hard: 21, normal: 13, easy: 8}}];
  assert.equal(calculateRating(songs, new Map()), 0);
  assert.equal(calculateRating(songs, new Map([['1:expert','clear']])), 29);
  assert.equal(calculateRating(songs, new Map([['1:expert','fc']])), 30.45);
  assert.equal(calculateRating(songs, new Map([['1:expert','ap']])), 31.9);
});

test('each song contributes its best chart, updating when that record is removed', () => {
  const songs = [
    {id: 1, levels: {expert: 29, hard: 21}},
    {id: 2, levels: {expert: 20}},
    {id: 3, levels: {expert: 30}}
  ];
  const records = new Map([['1:expert','ap'], ['1:hard','fc'], ['2:expert','fc']]);
  assert.equal(calculateRating(songs, records), 52.9);
  records.delete('1:expert');
  assert.equal(calculateRating(songs, records), 43.05);
  records.delete('1:hard');
  assert.equal(calculateRating(songs, records), 21);
});

test('50 level-29 AP songs total 1595 and extra charts do not inflate it', () => {
  const songs = Array.from({length:50}, (_,i) => ({id:i+1,levels:{expert:29,hard:23}}));
  const records = new Map(songs.flatMap(song => [[`${song.id}:expert`, 'ap'], [`${song.id}:hard`, 'ap']]));
  assert.equal(calculateRating(songs, records), 1595);
});

test('top-50 cutoff compares rating scores, including a stronger chart replacing an excluded song', () => {
  const songs = Array.from({length:49}, (_,i) => ({id:i+1,levels:{expert:29}}));
  songs.push({id:50,levels:{expert:28,hard:29}}, {id:51,levels:{expert:29}}, {id:52,levels:{expert:30}});
  const records = new Map(songs.slice(0,49).map(song => [`${song.id}:expert`, 'ap']));
  records.set('50:expert', 'ap'); // 30.8 beats both 29 and 30.45.
  records.set('50:hard', 'clear');
  records.set('51:expert', 'fc');
  assert.equal(calculateRating(songs, records), 1593.9);
  records.set('51:expert', 'ap');
  assert.equal(calculateRating(songs, records), 1595);
});
