import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, scrypt as rawScrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { readFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scrypt = promisify(rawScrypt);
const root = fileURLToPath(new URL('../', import.meta.url));
const COOKIE = 'bdon_session';
const SESSION_AGE = 30 * 24 * 60 * 60;
const STATUSES = new Set(['clear', 'fc', 'ap']);
const DIFFICULTIES = new Set(['expert', 'hard', 'normal', 'easy']);
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const digest = token => createHash('sha256').update(token).digest('hex');

export function createApp({ dbPath = resolve(root, '.local/bdon.sqlite'), catalogPath = resolve(root, 'data/catalog.json') } = {}) {
  const catalog = JSON.parse(readFileSync(catalogPath, 'utf8'));
  const songIds = new Set(catalog.songs.map(song => song.id));
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY, username TEXT NOT NULL, username_key TEXT NOT NULL UNIQUE,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL, created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS records (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      song_id INTEGER NOT NULL, difficulty TEXT NOT NULL CHECK(difficulty IN ('expert','hard','normal','easy')),
      status TEXT NOT NULL CHECK(status IN ('clear','fc','ap')), updated_at TEXT NOT NULL,
      PRIMARY KEY(user_id, song_id, difficulty)
    );
  `);
  db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
  const loginAttempts = new Map();
  const publicUser = row => row ? { id: row.id, username: row.username } : null;
  function tokenFrom(req) {
    return req.headers.cookie?.split(';').map(p => p.trim()).find(p => p.startsWith(COOKIE + '='))?.slice(COOKIE.length + 1);
  }
  function userFor(req) {
    const token = tokenFrom(req);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    return db.prepare(`SELECT u.id, u.username FROM sessions s JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ?`).get(digest(token), Date.now()) || null;
  }
  function requireUser(req) {
    const user = userFor(req);
    if (!user) throw new HttpError(401, '로그인이 필요합니다.');
    return user;
  }
  function session(res, userId) {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions VALUES (?, ?, ?)').run(digest(token), userId, Date.now() + SESSION_AGE * 1000);
    res.setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_AGE}`);
  }
  function limitAuth(req) {
    const key = req.socket.remoteAddress;
    const now = Date.now();
    for (const [ip, entry] of loginAttempts) if (entry.until <= now) loginAttempts.delete(ip);
    const entry = loginAttempts.get(key) || { count: 0, until: now + 60000 };
    entry.count++;
    loginAttempts.set(key, entry);
    if (entry.count > 20) throw new HttpError(429, '시도가 너무 많습니다. 잠시 후 다시 시도해 주세요.');
  }
  async function body(req) {
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) throw new HttpError(415, 'JSON 요청이 필요합니다.');
    let length = 0;
    const chunks = [];
    for await (const chunk of req) {
      length += chunk.length;
      if (length > 4096) throw new HttpError(413, '요청이 너무 큽니다.');
      chunks.push(chunk);
    }
    try {
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      if (!result || Array.isArray(result) || typeof result !== 'object') throw Error();
      return result;
    } catch { throw new HttpError(400, '잘못된 요청입니다.'); }
  }
  const json = (res, status, value) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(value));
  };
  const server = createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    try {
      const address = server.address();
      const allowedHosts = new Set([`127.0.0.1:${address.port}`, `localhost:${address.port}`]);
      if (!allowedHosts.has(req.headers.host)) throw new HttpError(403, '로컬 주소로 접속해 주세요.');
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (['POST', 'PUT', 'DELETE'].includes(req.method)) {
        if (req.headers.origin !== url.origin) throw new HttpError(403, '허용되지 않은 요청 출처입니다.');
      }
      if (req.method === 'GET' && url.pathname === '/api/catalog') return json(res, 200, catalog);
      if (req.method === 'GET' && url.pathname === '/api/me') return json(res, 200, { user: publicUser(userFor(req)) });
      if (req.method === 'POST' && ['/api/register', '/api/login'].includes(url.pathname)) {
        limitAuth(req);
        const input = await body(req);
        const username = typeof input.username === 'string' ? input.username.normalize('NFKC').trim() : '';
        const password = input.password;
        if (!/^[\p{L}\p{N}_-]{2,24}$/u.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128)
          throw new HttpError(400, '아이디는 문자·숫자·밑줄·하이픈 2~24자, 비밀번호는 8~128자로 입력해 주세요.');
        const key = username.toLowerCase();
        let user = db.prepare('SELECT * FROM users WHERE username_key = ?').get(key);
        if (url.pathname === '/api/register') {
          if (user) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
          const salt = randomBytes(16).toString('hex');
          const hash = (await scrypt(password, salt, 64)).toString('hex');
          try {
            const result = db.prepare('INSERT INTO users(username, username_key, salt, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
              .run(username, key, salt, hash, new Date().toISOString());
            user = { id: Number(result.lastInsertRowid), username };
          } catch (error) {
            if (String(error.message).includes('UNIQUE')) throw new HttpError(409, '이미 사용 중인 아이디입니다.');
            throw error;
          }
        } else {
          const hash = await scrypt(password, user?.salt || 'missing-user-salt', 64);
          if (!user || !timingSafeEqual(hash, Buffer.from(user.password_hash, 'hex')))
            throw new HttpError(401, '아이디 또는 비밀번호가 올바르지 않습니다.');
        }
        const previousToken = tokenFrom(req);
        if (previousToken) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(previousToken));
        session(res, user.id);
        return json(res, url.pathname === '/api/register' ? 201 : 200, { user: publicUser(user) });
      }
      if (req.method === 'POST' && url.pathname === '/api/logout') {
        const token = tokenFrom(req);
        if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(digest(token));
        res.setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0`);
        return json(res, 200, { ok: true });
      }
      if (req.method === 'GET' && url.pathname === '/api/records') {
        const user = requireUser(req);
        const records = db.prepare('SELECT song_id AS songId, difficulty, status, updated_at AS updatedAt FROM records WHERE user_id = ?').all(user.id);
        return json(res, 200, { records });
      }
      const recordPath = /^\/api\/records\/(\d+)\/([a-z]+)$/.exec(url.pathname);
      if (req.method === 'PUT' && recordPath) {
        const user = requireUser(req);
        const songId = Number(recordPath[1]);
        const difficulty = recordPath[2];
        if (!songIds.has(songId) || !DIFFICULTIES.has(difficulty)) throw new HttpError(404, '곡 또는 난이도를 찾을 수 없습니다.');
        const { status } = await body(req);
        if (status !== null && !STATUSES.has(status)) throw new HttpError(400, '올바른 기록을 선택해 주세요.');
        const updatedAt = new Date().toISOString();
        if (status === null) db.prepare('DELETE FROM records WHERE user_id = ? AND song_id = ? AND difficulty = ?').run(user.id, songId, difficulty);
        else db.prepare(`INSERT INTO records VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, song_id, difficulty) DO UPDATE SET status=excluded.status, updated_at=excluded.updated_at`)
          .run(user.id, songId, difficulty, status, updatedAt);
        return json(res, 200, { record: { songId, difficulty, status, updatedAt } });
      }
      const assets = { '/': ['index.html','text/html'], '/app.js': ['app.js','text/javascript'], '/rating.js': ['rating.js','text/javascript'], '/styles.css': ['styles.css','text/css'], '/brand-icon.webp': ['brand-icon.webp','image/webp'] };
      if (req.method === 'GET' && assets[url.pathname]) {
        const [filename, type] = assets[url.pathname];
        res.writeHead(200, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-cache' });
        return res.end(readFileSync(resolve(root, 'public', filename)));
      }
      throw new HttpError(404, '페이지를 찾을 수 없습니다.');
    } catch (error) {
      if (!error.status) console.error('Request failed:', error.message);
      if (!res.headersSent) json(res, error.status || 500, { error: error.status ? error.message : '저장에 실패했습니다. 다시 시도해 주세요.' });
      else res.end();
    }
  });
  return { server, db, close: () => new Promise((done, reject) => server.close(error => { db.close(); error ? reject(error) : done(); })) };
}
