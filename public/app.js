import { calculateRating, calculateChartRating } from './rating.js';

const $ = id => document.getElementById(id);
const state = { catalog: null, user: null, records: new Map(), difficulty: 'expert', ready: false, pending: new Set(), authMode: 'login' };
const difficultyNames = { expert: 'Expert', hard: 'Hard', normal: 'Normal', easy: 'Easy' };
const statusNames = { clear: '클리어', fc: '풀콤보', ap: '올퍼펙트' };
const bandStyle = {
  'MyGO!!!!!': ['mygo','MG'], 'Ave Mujica': ['ave','AM'], '무겐다이 뮤타입': ['mugen','MT'],
  millsage: ['millsage','ms'], '일가 Dumb Rock!': ['ikka','DR'], CRYCHIC: ['crychic','CC']
};
const getBandCategory = band => band === 'CRYCHIC' ? '기타' : band;
const recordKey = (songId, difficulty = state.difficulty) => `${songId}:${difficulty}`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
let toastTimer;
function toast(message, error = false) {
  $('toast').textContent = message;
  $('toast').classList.toggle('error', error);
  $('toast').hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 3500);
}
function saveLabel(message, error = false) {
  const node = $('save-state');
  node.replaceChildren(Object.assign(document.createElement('span'), {}), document.createTextNode(message));
  node.classList.toggle('error', error);
}
async function api(path, options = {}) {
  let response;
  try { response = await fetch(path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }
  catch { throw new Error('서버에 연결할 수 없습니다. 서버 실행 상태를 확인해 주세요.'); }
  const result = await response.json();
  if (!response.ok) {
    const error = new Error(result.error || '요청에 실패했습니다.');
    error.status = response.status;
    throw error;
  }
  return result;
}
function renderAccount() {
  $('account-button').textContent = state.user ? `${state.user.username} 님 ↗` : '로그인 ↗';
  $('session-label').textContent = state.user ? `${state.user.username} 님의 플레이 아카이브` : '나만의 플레이 아카이브';
  $('guest-banner').hidden = !!state.user;
  saveLabel(state.user ? '모든 기록 저장됨' : '로그인 후 기록 가능');
}
function renderStats() {
  const total = state.catalog.songs.length;
  const current = state.catalog.songs.map(song => state.records.get(recordKey(song.id)));
  const counts = { clear: current.filter(Boolean).length, fc: current.filter(value => value === 'fc' || value === 'ap').length, ap: current.filter(value => value === 'ap').length };
  $('stat-total').textContent = total;
  $('difficulty-caption').textContent = `${difficultyNames[state.difficulty]} 기준`;
  $('stat-rating').textContent = state.user ? calculateRating(state.catalog.songs, state.records).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
  for (const status of ['clear','fc','ap']) {
    const percentage = state.user ? Math.round(counts[status] / total * 100) : 0;
    $(`stat-${status}`).textContent = state.user ? counts[status] : '—';
    $(`percent-${status}`).textContent = state.user ? `${percentage}%` : '—';
    $(`progress-${status}`).style.width = `${percentage}%`;
  }
}
function visibleSongs() {
  const query = $('search').value.normalize('NFKC').trim().toLocaleLowerCase();
  const band = $('band-filter').value;
  const record = $('record-filter').value;
  const sort = $('level-sort').value;
  const songs = state.catalog.songs.filter(song => {
    const name = state.catalog.names.get(song.nameId);
    const status = state.records.get(recordKey(song.id));
    return (!band || getBandCategory(song.band) === band) && (!query || [name.original, name.translated, song.band, getBandCategory(song.band)].some(v => v?.normalize('NFKC').toLocaleLowerCase().includes(query)))
      && (!record || (record === 'none' ? !status : status === record));
  });
  if (sort === 'asc' || sort === 'desc') {
    const direction = sort === 'asc' ? 1 : -1;
    songs.sort((a, b) => direction * (a.levels[state.difficulty] - b.levels[state.difficulty]));
  }
  return songs;
}
function renderSongs() {
  if (!state.catalog) return;
  const focused = document.activeElement;
  const focusTarget = focused?.matches('#song-list input') ? { song: focused.dataset.song, status: focused.dataset.status } : null;
  const songs = visibleSongs();
  $('result-count').textContent = songs.length;
  $('table-count').textContent = `전체 ${state.catalog.songs.length}곡 중 ${songs.length}곡`;
  $('song-list').innerHTML = songs.length ? songs.map(song => {
    const name = state.catalog.names.get(song.nameId);
    const title = name.translated || name.original;
    const status = state.records.get(recordKey(song.id));
    const [style, monogram] = bandStyle[song.band] || ['', '♪'];
    const songNumber = state.catalog.songs.indexOf(song) + 1;
    const chartRating = state.user ? calculateChartRating(song.levels[state.difficulty], status).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
    return `<tr data-song="${song.id}">
      <td class="number-cell">${String(songNumber).padStart(2,'0')}</td>
      <td class="song-cell"><div class="song-main"><div class="track-art ${style}" aria-hidden="true">${monogram}</div><div class="song-text"><div class="song-name">${escapeHtml(title)}</div>${name.translated && name.translated !== name.original ? `<div class="song-original">${escapeHtml(name.original)}</div>` : ''}<div class="band-name">${escapeHtml(song.band)}</div></div></div></td>
      <td class="rating-cell"><span class="chart-rating${status ? ' earned' : ''}">${chartRating}</span></td>
      <td class="level-cell"><span class="level-badge" aria-label="${difficultyNames[state.difficulty]} 레벨 ${song.levels[state.difficulty]}">${song.levels[state.difficulty]}</span></td>
      ${['clear','fc','ap'].map(value => `<td class="check-cell"><label class="record-check"><input type="checkbox" data-song="${song.id}" data-status="${value}" aria-label="${escapeHtml(title)} ${difficultyNames[state.difficulty]} ${statusNames[value]}" ${status === value ? 'checked' : ''} ${!state.ready || state.pending.has(recordKey(song.id)) ? 'disabled' : ''}></label></td>`).join('')}
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state">조건에 맞는 곡이 없습니다.<br>검색어나 필터를 바꿔보세요.</td></tr>';
  if (focusTarget) document.querySelector(`#song-list input[data-song="${focusTarget.song}"][data-status="${focusTarget.status}"]`)?.focus({ preventScroll: true });
}
async function saveRecord(input) {
  if (!state.user) { input.checked = false; openAuth(); return; }
  const songId = Number(input.dataset.song);
  const difficulty = state.difficulty;
  const key = recordKey(songId, difficulty);
  const heldFocus = document.activeElement === input;
  if (state.pending.has(key)) return;
  const next = input.checked ? input.dataset.status : null;
  // Keep a single selected box even while the server acknowledges the change.
  for (const sibling of input.closest('tr').querySelectorAll('input')) {
    sibling.checked = next === sibling.dataset.status;
    sibling.disabled = true;
  }
  state.pending.add(key);
  saveLabel('기록 저장 중');
  try {
    await api(`/api/records/${songId}/${difficulty}`, { method: 'PUT', body: JSON.stringify({ status: next }) });
    next === null ? state.records.delete(key) : state.records.set(key, next);
    saveLabel(state.pending.size > 1 ? '기록 저장 중' : '모든 기록 저장됨');
  } catch (error) {
    if (error.status === 401) {
      state.user = null;
      state.records.clear();
      renderAccount();
      openAuth();
    }
    saveLabel('저장 실패 · 다시 선택해 주세요', true);
    toast(error.message, true);
  } finally {
    state.pending.delete(key);
    renderSongs();
    renderStats();
    if (heldFocus && document.activeElement === document.body && state.difficulty === difficulty)
      document.querySelector(`#song-list input[data-song="${songId}"][data-status="${input.dataset.status}"]`)?.focus({ preventScroll: true });
  }
}
function setAuthMode(mode) {
  state.authMode = mode;
  $('auth-error').textContent = '';
  $('login-tab').classList.toggle('selected', mode === 'login');
  $('register-tab').classList.toggle('selected', mode === 'register');
  $('login-tab').setAttribute('aria-pressed', String(mode === 'login'));
  $('register-tab').setAttribute('aria-pressed', String(mode === 'register'));
  $('password').autocomplete = mode === 'login' ? 'current-password' : 'new-password';
  $('auth-submit').textContent = mode === 'login' ? '로그인 →' : '계정 만들고 시작하기 →';
}
function openAuth() { if (state.ready && !state.pending.size) { setAuthMode('login'); $('auth-dialog').showModal(); } }
async function loadRecords() {
  const result = await api('/api/records');
  state.records = new Map(result.records.map(r => [recordKey(r.songId, r.difficulty), r.status]));
}
$('account-button').addEventListener('click', () => {
  if (state.pending.size) return toast('기록 저장이 끝난 후 다시 시도해 주세요.');
  if (!state.user) return openAuth();
  $('account-title').textContent = `${state.user.username} 님`;
  $('account-dialog').showModal();
});
$('banner-login').addEventListener('click', openAuth);
$('close-auth').addEventListener('click', () => $('auth-dialog').close());
$('close-account').addEventListener('click', () => $('account-dialog').close());
$('login-tab').addEventListener('click', () => setAuthMode('login'));
$('register-tab').addEventListener('click', () => setAuthMode('register'));
$('auth-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('auth-submit');
  if (button.disabled) return;
  button.disabled = true;
  $('auth-error').textContent = '';
  try {
    const result = await api(`/api/${state.authMode}`, { method: 'POST', body: JSON.stringify({ username: $('username').value, password: $('password').value }) });
    state.user = result.user;
    state.records.clear();
    await loadRecords();
    $('password').value = '';
    $('auth-dialog').close();
    renderAccount(); renderStats(); renderSongs();
    toast(`${state.user.username} 님, 기록을 시작해보세요.`);
  } catch (error) {
    $('auth-error').textContent = error.message;
    // A failed record load must not leave another account's records visible.
    state.user = null;
    state.records.clear();
    renderAccount(); renderStats(); renderSongs();
  } finally { button.disabled = false; }
});
$('logout-button').addEventListener('click', async () => {
  const button = $('logout-button');
  button.disabled = true;
  try {
    await api('/api/logout', { method: 'POST', body: '{}' });
    state.user = null; state.records.clear();
    $('account-dialog').close();
    $('record-filter').value = '';
    renderAccount(); renderStats(); renderSongs();
    toast('로그아웃했습니다. 기록은 계정에 보관됩니다.');
  } catch (error) { toast(error.message, true); }
  finally { button.disabled = false; }
});
for (const button of document.querySelectorAll('[data-difficulty]')) button.addEventListener('click', () => {
  state.difficulty = button.dataset.difficulty;
  for (const tab of document.querySelectorAll('[data-difficulty]')) {
    tab.classList.toggle('active', tab === button);
    tab.setAttribute('aria-pressed', String(tab === button));
  }
  renderStats(); renderSongs();
});
for (const id of ['search','band-filter','record-filter','level-sort']) $(id).addEventListener(id === 'search' ? 'input' : 'change', renderSongs);
$('song-list').addEventListener('change', event => { if (event.target.matches('input[type="checkbox"]')) saveRecord(event.target); });
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('search').focus();
  }
});
async function initialize() {
  try {
    const [catalog, identity] = await Promise.all([api('/api/catalog'), api('/api/me')]);
    catalog.names = new Map(catalog.strings.map(s => [s.id, s]));
    state.catalog = catalog;
    state.user = identity.user;
    if (state.user) await loadRecords();
    for (const band of new Set(catalog.songs.map(song => getBandCategory(song.band)))) $('band-filter').add(new Option(band, band));
    state.ready = true;
    renderAccount(); renderStats(); renderSongs();
  } catch (error) {
    saveLabel('데이터를 불러오지 못했습니다', true);
    $('song-list').innerHTML = `<tr><td class="empty-state" colspan="7">${escapeHtml(error.message)}<br>새로고침해서 다시 시도해 주세요.</td></tr>`;
    toast(error.message, true);
  }
}
initialize();
