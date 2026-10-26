const difficulties = new Set(['expert', 'hard', 'normal', 'easy']);
const statuses = new Set(['clear', 'fc', 'ap']);
export const batchBodyLimit = 1024 * 1024;

// Validate the complete request before either database performs any writes.
export function validateRecordChanges(input, songIds) {
  const invalid = () => Object.assign(new Error('올바른 곡·난이도·기록을 선택해 주세요. 중복 항목은 허용되지 않습니다.'), { status: 400 });
  if (!Array.isArray(input.records) || input.records.length > songIds.size * difficulties.size) throw invalid();
  const seen = new Set();
  return input.records.map(record => {
    if (!record || typeof record !== 'object' || Array.isArray(record)) throw invalid();
    const { songId, difficulty, status } = record;
    if (!Number.isSafeInteger(songId) || !songIds.has(songId) || !difficulties.has(difficulty)
        || (status !== null && !statuses.has(status))) throw invalid();
    const key = `${songId}:${difficulty}`;
    if (seen.has(key)) throw invalid();
    seen.add(key);
    return { songId, difficulty, status };
  });
}

// Two JSON-backed statements keep query/parameter counts constant even for all charts.
// Run both in one transaction (D1 batch / SQLite BEGIN) so delete and upsert are atomic.
export const deleteRecordsSql = `DELETE FROM records WHERE user_id = ? AND (song_id, difficulty) IN (
  SELECT json_extract(changes.value, '$.songId'), json_extract(changes.value, '$.difficulty')
  FROM json_each(?) AS changes WHERE json_type(changes.value, '$.status') = 'null'
)`;
export const upsertRecordsSql = `INSERT INTO records (user_id, song_id, difficulty, status, updated_at)
  SELECT ?, json_extract(changes.value, '$.songId'), json_extract(changes.value, '$.difficulty'),
    json_extract(changes.value, '$.status'), ? FROM json_each(?) AS changes
  WHERE json_extract(changes.value, '$.status') IS NOT NULL
  ON CONFLICT(user_id, song_id, difficulty) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`;
