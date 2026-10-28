import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.mjs';

test('deployment maintenance blocks every record route while keeping the catalog available', async () => {
  const origin='https://bdon.example';
  const env={RECORDS_MAINTENANCE:'1'};
  for(const [path,method] of [['/api/records','GET'],['/api/records','PUT'],['/api/records/101001/expert','PUT']]) {
    const response=await worker.fetch(new Request(origin+path,{method,headers:{Origin:origin}}),env);
    assert.equal(response.status,503);
    assert.match((await response.json()).error,/곡 데이터 업데이트 중/);
    assert.equal(response.headers.get('Cache-Control'),'no-store');
  }
  const catalog=await worker.fetch(new Request(origin+'/api/catalog'),env);
  assert.equal(catalog.status,200);
  assert.equal((await catalog.json()).songs.length,93);
  const resumed=await worker.fetch(new Request(origin+'/api/records'),{RECORDS_MAINTENANCE:'0'});
  assert.equal(resumed.status,503);
  assert.match((await resumed.json()).error,/계정 저장소 연결/);
});
