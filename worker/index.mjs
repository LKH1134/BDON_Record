import { randomBytes, createHash, scrypt as rawScrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import catalog from '../data/catalog.json' with { type: 'json' };
import { validateRecordChanges, batchBodyLimit, deleteRecordsSql, upsertRecordsSql } from '../shared/record-changes.mjs';

const scrypt = promisify(rawScrypt);
const songIds = new Set(catalog.songs.map(song => song.id));
const difficulties = new Set(['expert', 'hard', 'normal', 'easy']);
const statuses = new Set(['clear', 'fc', 'ap']);
const sessionAge = 30 * 24 * 60 * 60;
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"
};
class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const digest = value => createHash('sha256').update(value).digest('hex');
const publicUser = user => user ? { id: user.id, username: user.username } : null;

function json(status, value, headers = {}) {
  return Response.json(value, { status, headers: { ...securityHeaders, 'Cache-Control': 'no-store', ...headers } });
}
function cookieName(url) { return url.protocol === 'https:' ? '__Host-bdon_session' : 'bdon_session'; }
function tokenFrom(request, url) {
  const prefix = cookieName(url) + '=';
  return request.headers.get('Cookie')?.split(';').map(part => part.trim()).find(part => part.startsWith(prefix))?.slice(prefix.length);
}
function cookie(url, token, age = sessionAge) {
  return `${cookieName(url)}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${age}${url.protocol === 'https:' ? '; Secure' : ''}`;
}
async function userFor(request, url, db) {
  const token = tokenFrom(request, url);
  if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
  return db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token_hash = ? AND s.expires_at > ?`).bind(digest(token), Date.now()).first();
}
async function requireUser(request, url, db) {
  const user = await userFor(request, url, db);
  if (!user) throw new HttpError(401, '로그인이 필요합니다.');
  // Block record reads/writes until the explicit D1 migration has been applied.
  if (await db.prepare('SELECT 1 FROM records WHERE song_id BETWEEN 1001 AND 1092 LIMIT 1').first())
    throw new HttpError(503, '곡 데이터 이전 작업 중입니다. 잠시 후 다시 접속해 주세요.');
  return user;
}
async function body(request, limit = 4096) {
  if (!/^application\/json(?:;|$)/i.test(request.headers.get('Content-Type') || ''))
    throw new HttpError(415, 'JSON 요청이 필요합니다.');
  const chunks = [];
  let size = 0;
  const reader = request.body?.getReader();
  if (reader) {
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
          await reader.cancel();
          throw new HttpError(413, '요청이 너무 큽니다.');
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try {
    const value = JSON.parse(new TextDecoder().decode(bytes));
    if (!value || Array.isArray(value) || typeof value !== 'object') throw Error();
    return value;
  } catch { throw new HttpError(400, '잘못된 요청입니다.'); }
}

// A D1 counter survives isolate restarts and cannot be bypassed by changing usernames.
async function limitAuth(request, db) {
  const key = digest('auth:' + (request.headers.get('CF-Connecting-IP') || 'local'));
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO auth_attempts (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN auth_attempts.expires_at <= ? THEN 1 ELSE MIN(auth_attempts.attempts + 1, 21) END,
      expires_at = CASE WHEN auth_attempts.expires_at <= ? THEN excluded.expires_at ELSE auth_attempts.expires_at END
    RETURNING attempts`).bind(key, now + 60000, now, now).first();
  if (row.attempts > 20) throw new HttpError(429, '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
}

async function authenticate(request, url, db) {
  await limitAuth(request, db);
  const input = await body(request);
  const username = typeof input.username === 'string' ? input.username.normalize('NFKC').trim() : '';
  const password = input.password;
  if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128)
    throw new HttpError(400, '아이디는 문자·숫자·밑줄·하이픈 2~24자, 비밀번호는 8~128자로 입력해 주세요.');
  const key = username.toLowerCase();
  const registering = url.pathname === '/api/register';
  let user = await db.prepare('SELECT * FROM users WHERE username_key = ?').bind(key).first();
  if (registering) {
    if (user) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
    const salt = randomBytes(16).toString('hex');
    const hash = (await scrypt(password, salt, 64)).toString('hex');
    // DO NOTHING handles two simultaneous registrations of the same normalized name.
    user = await db.prepare(`INSERT INTO users(username, username_key, salt, password_hash, created_at)
      VALUES (?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING RETURNING id, username`)
      .bind(username, key, salt, hash, new Date().toISOString()).first();
    if (!user) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
  } else {
    const hash = await scrypt(password, user?.salt || 'missing-user-salt', 64);
    if (!user || !/^[a-f0-9]{128}$/.test(user.password_hash) || !timingSafeEqual(hash, Buffer.from(user.password_hash, 'hex')))
      throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
  }
  const token = randomBytes(32).toString('hex');
  const previous = tokenFrom(request, url);
  const queries = [];
  if (previous) queries.push(db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest(previous)));
  queries.push(db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .bind(digest(token), user.id, Date.now() + sessionAge * 1000));
  await db.batch(queries);
  return json(registering ? 201 : 200, { user: publicUser(user) }, { 'Set-Cookie': cookie(url, token) });
}

async function api(request, url, env) {
  if (request.method === 'GET' && url.pathname === '/api/catalog') return json(200, catalog);
  if (!env.DB) throw new HttpError(503, '계정 저장소 연결을 준비 중입니다.');
  const db = env.DB;
  if (request.method === 'GET' && url.pathname === '/api/me')
    return json(200, { user: publicUser(await userFor(request, url, db)) });
  if (request.method === 'POST' && ['/api/register', '/api/login'].includes(url.pathname))
    return authenticate(request, url, db);
  if (request.method === 'POST' && url.pathname === '/api/logout') {
    const token = tokenFrom(request, url);
    if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(digest(token)).run();
    return json(200, { ok: true }, { 'Set-Cookie': cookie(url, '', 0) });
  }
  if (request.method === 'GET' && url.pathname === '/api/records') {
    const user = await requireUser(request, url, db);
    const { results } = await db.prepare(`SELECT song_id AS songId, difficulty, status, updated_at AS updatedAt
      FROM records WHERE user_id = ? ORDER BY song_id, difficulty`).bind(user.id).all();
    return json(200, { records: results });
  }
  if (request.method === 'PUT' && url.pathname === '/api/records') {
    const user = await requireUser(request, url, db);
    const records = validateRecordChanges(await body(request, batchBodyLimit), songIds);
    if (records.length) {
      const changes = JSON.stringify(records);
      await db.batch([
        db.prepare(deleteRecordsSql).bind(user.id, changes),
        db.prepare(upsertRecordsSql).bind(user.id, new Date().toISOString(), changes)
      ]);
    }
    return json(200, { ok: true });
  }
  const match = /^\/api\/records\/(\d+)\/([a-z]+)$/.exec(url.pathname);
  if (request.method === 'PUT' && match) {
    const user = await requireUser(request, url, db);
    const songId = Number(match[1]);
    const difficulty = match[2];
    if (!songIds.has(songId) || !difficulties.has(difficulty)) throw new HttpError(404, '곡 또는 난이도를 찾을 수 없습니다.');
    const { status } = await body(request);
    if (status !== null && !statuses.has(status)) throw new HttpError(400, '올바른 기록을 선택해 주세요.');
    const updatedAt = new Date().toISOString();
    if (status === null) {
      await db.prepare('DELETE FROM records WHERE user_id = ? AND song_id = ? AND difficulty = ?')
        .bind(user.id, songId, difficulty).run();
    } else {
      await db.prepare(`INSERT INTO records (user_id, song_id, difficulty, status, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, song_id, difficulty) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`)
        .bind(user.id, songId, difficulty, status, updatedAt).run();
    }
    return json(200, { record: { songId, difficulty, status, updatedAt } });
  }
  throw new HttpError(404, '페이지를 찾을 수 없습니다.');
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))
        throw new HttpError(400, 'HTTPS 주소로 접속해 주세요.');
      if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method) && request.headers.get('Origin') !== url.origin)
        throw new HttpError(403, '허용되지 않은 요청 출처입니다.');
      if (env.RECORDS_MAINTENANCE === '1' && (url.pathname === '/api/records' || url.pathname.startsWith('/api/records/')))
        throw new HttpError(503, '곡 데이터 업데이트 중입니다. 잠시 후 다시 접속해 주세요.');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) return await api(request, url, env);
      if (!['GET', 'HEAD'].includes(request.method)) throw new HttpError(405, '허용되지 않은 요청입니다.');
      const response = await env.ASSETS.fetch(request);
      const secured = new Response(response.body, response);
      for (const [key, value] of Object.entries(securityHeaders)) secured.headers.set(key, value);
      return secured;
    } catch (error) {
      if (!error.status) console.error('Worker request failed; check D1 binding and migrations.');
      return json(error.status || 500, { error: error.status ? error.message : '저장에 실패했습니다. 다시 시도해 주세요.' },
        error.status === 429 ? { 'Retry-After': '60' } : {});
    }
  },
  async scheduled(_controller, env, ctx) {
    const now = Date.now();
    ctx.waitUntil(env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at <= ?').bind(now),
      env.DB.prepare('DELETE FROM auth_attempts WHERE expires_at <= ?').bind(now)
    ]));
  }
};
