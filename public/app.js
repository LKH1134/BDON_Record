import { getRatingBreakdown, calculateChartRating } from './rating.js';

const $ = id => document.getElementById(id);
const staticPreview = document.querySelector('meta[name="bdon-mode"]')?.content === 'static';
const cloudMode = document.querySelector('meta[name="bdon-mode"]')?.content === 'cloud';
const state = { catalog: null, user: null, records: new Map(), difficulty: 'expert', ready: false, baseline: null, saving: false, authMode: 'login' };
const difficultyNames = { expert: 'Expert', hard: 'Hard', normal: 'Normal', easy: 'Easy' };
const statusNames = { clear: '클리어', fc: '풀콤보', ap: '올퍼펙트' };
const bandStyle = {
  'MyGO!!!!!': ['mygo','MG'], 'Ave Mujica': ['ave','AM'], '무겐다이 뮤타입': ['mugen','MT'],
  millsage: ['millsage','ms'], '일가 Dumb Rock!': ['ikka','DR'], CRYCHIC: ['crychic','CC']
};
const bandLogos = {
  'MyGO!!!!!': 'mygo.webp', 'Ave Mujica': 'avemujica.webp', '무겐다이 뮤타입': 'ymmt.webp',
  millsage: 'millsage.webp', '일가 Dumb Rock!': 'dr.webp'
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
function recordChanges() {
  if (!state.baseline) return [];
  return [...new Set([...state.baseline.keys(), ...state.records.keys()])].flatMap(key => {
    const status = state.records.get(key) ?? null;
    if (status === (state.baseline.get(key) ?? null)) return [];
    const [songId, difficulty] = key.split(':');
    return [{ songId: Number(songId), difficulty, status }];
  });
}
function renderEditor() {
  const editing = !!state.baseline;
  $('edit-controls').hidden = staticPreview;
  $('edit-button').hidden = editing;
  $('edit-button').disabled = !state.ready;
  $('save-button').hidden = !editing;
  $('cancel-button').hidden = !editing;
  $('save-button').disabled = state.saving;
  $('cancel-button').disabled = state.saving;
  $('save-button').textContent = state.saving ? '저장 중…' : '저장';
  $('edit-bar').classList.toggle('is-editing', editing);
  if (!staticPreview) saveLabel(state.saving ? '기록 저장 중' : editing
    ? `편집 중 · ${recordChanges().length}개 변경 · 아직 저장되지 않음`
    : state.user ? '모든 기록 저장됨' : '로그인 후 기록 가능');
}
async function api(path, options = {}) {
  if (staticPreview) {
    if (path === '/api/me') return { user: null };
    if (path !== '/api/catalog' || (options.method && options.method !== 'GET'))
      throw new Error('공개 미리보기에서는 계정과 기록 저장을 사용할 수 없습니다.');
    path = new URL('./catalog.json', document.baseURI).href;
  }
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
  renderEditor();
  if (staticPreview) {
    $('account-button').textContent = '미리보기';
    $('account-button').disabled = true;
    $('session-label').textContent = '악곡 라이브러리 미리보기';
    $('guest-banner').hidden = false;
    $('guest-banner').querySelector('strong').textContent = '공개 미리보기입니다. 계정 로그인과 기록 저장은 백엔드 연결 후 제공됩니다.';
    $('banner-login').hidden = true;
    document.querySelector('.local-badge').textContent = 'WEB PREVIEW';
    document.querySelector('.intro-copy').textContent = '뱅드림! 아워 노트의 악곡과 난이도를 확인해 보세요.';
    document.querySelector('.section-heading p').textContent = '검색과 밴드 필터, 레벨 정렬로 곡을 찾아보세요.';
    document.querySelector('.table-footer > span:last-child').textContent = '난이도별 악곡 목록 · 읽기 전용';
    document.querySelector('.site-footer > span:last-child').textContent = 'WEB PREVIEW · 계정 및 기록 저장 준비 중';
    saveLabel('공개 미리보기 · 읽기 전용');
    return;
  }
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
  const breakdown = state.user ? getRatingBreakdown(state.catalog.songs, state.records) : null;
  $('stat-rating').textContent = breakdown ? formatRating(breakdown.total) : '—';
  $('rating-details-button').disabled = !state.ready || !state.user;
  if ($('rating-dialog').open || !state.user) renderRatingDetails(breakdown);
  for (const status of ['clear','fc','ap']) {
    const percentage = state.user ? Math.round(counts[status] / total * 100) : 0;
    $(`stat-${status}`).textContent = state.user ? counts[status] : '—';
    $(`percent-${status}`).textContent = state.user ? `${percentage}%` : '—';
    $(`progress-${status}`).style.width = `${percentage}%`;
  }
}
const formatRating = value => value.toLocaleString('ko-KR', { maximumFractionDigits: 2 });
function renderRatingDetails(breakdown) {
  const entries = breakdown?.entries ?? [];
  $('rating-details-count').textContent = `${entries.length} / 50곡`;
  $('rating-details-total').textContent = breakdown ? formatRating(breakdown.total) : '—';
  $('rating-draft-note').hidden = !state.baseline;
  const songs = new Map(state.catalog.songs.map(song => [song.id, song]));
  $('rating-details-list').innerHTML = entries.length ? entries.map((entry, index) => {
    const song = songs.get(entry.songId);
    const name = state.catalog.names.get(song.nameId);
    return `<li class="rating-entry" data-song="${entry.songId}" data-difficulty="${entry.difficulty}">
      <span class="rating-entry-rank" aria-hidden="true">${String(index + 1).padStart(2, '0')}</span>
      <div class="rating-entry-song"><div class="song-name">${escapeHtml(name.translated || name.original)}</div>
        ${name.translated && name.translated !== name.original ? `<div class="song-original">${escapeHtml(name.original)}</div>` : ''}
        <div class="rating-entry-meta"><span>${escapeHtml(song.band)}</span><span>${difficultyNames[entry.difficulty]} · Lv.${entry.level}</span><span class="rating-entry-status ${entry.status}">${statusNames[entry.status]}</span></div>
      </div><strong class="rating-entry-score">${formatRating(entry.rating)}</strong>
    </li>`;
  }).join('') : '<li class="rating-details-empty">아직 레이팅에 반영할 기록이 없습니다.<br>기록 편집에서 플레이 기록을 추가해 보세요.</li>';
  if (!state.user && $('rating-dialog').open) $('rating-dialog').close();
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
    const logo = bandLogos[song.band];
    const songNumber = state.catalog.songs.indexOf(song) + 1;
    const chartRating = state.user ? calculateChartRating(song.levels[state.difficulty], status).toLocaleString('ko-KR', { maximumFractionDigits: 2 }) : '—';
    return `<tr data-song="${song.id}">
      <td class="number-cell">${String(songNumber).padStart(2,'0')}</td>
      <td class="song-cell"><div class="song-main"><div class="track-art ${style}${logo ? ' band-logo-frame' : ''}" aria-hidden="true">${logo ? `<img src="./band-logos/${logo}" alt="" width="96" height="38" loading="lazy" decoding="async">` : monogram}</div><div class="song-text"><div class="song-name">${escapeHtml(title)}</div>${name.translated && name.translated !== name.original ? `<div class="song-original">${escapeHtml(name.original)}</div>` : ''}<div class="band-name">${escapeHtml(song.band)}</div></div></div></td>
      <td class="rating-cell"><span class="chart-rating${status ? ' earned' : ''}">${chartRating}</span></td>
      <td class="level-cell"><span class="level-badge" aria-label="${difficultyNames[state.difficulty]} 레벨 ${song.levels[state.difficulty]}">${song.levels[state.difficulty]}</span></td>
      ${['clear','fc','ap'].map(value => `<td class="check-cell"><label class="record-check"><input type="checkbox" data-song="${song.id}" data-status="${value}" aria-label="${escapeHtml(title)} ${difficultyNames[state.difficulty]} ${statusNames[value]}" ${status === value ? 'checked' : ''} ${staticPreview || !state.ready || !state.baseline || state.saving ? 'disabled' : ''}></label></td>`).join('')}
    </tr>`;
  }).join('') : '<tr><td colspan="7" class="empty-state">조건에 맞는 곡이 없습니다.<br>검색어나 필터를 바꿔보세요.</td></tr>';
  if (focusTarget) document.querySelector(`#song-list input[data-song="${focusTarget.song}"][data-status="${focusTarget.status}"]`)?.focus({ preventScroll: true });
}
function editRecord(input) {
  if (!state.baseline || state.saving) return;
  const key = recordKey(Number(input.dataset.song));
  input.checked ? state.records.set(key, input.dataset.status) : state.records.delete(key);
  renderEditor(); renderSongs(); renderStats();
}
function finishEditing(cancel = false) {
  if (cancel) state.records = state.baseline;
  state.baseline = null;
  if (state.sessionExpired) {
    state.user = null;
    state.records.clear();
    state.sessionExpired = false;
    renderAccount();
    openAuth();
  }
  renderEditor(); renderSongs(); renderStats();
  $('edit-button').focus({ preventScroll: true });
}
async function saveEdits() {
  if (!state.baseline || state.saving) return;
  const records = recordChanges();
  if (!records.length) { finishEditing(); return; }
  state.saving = true;
  renderEditor(); renderSongs();
  try {
    await api('/api/records', { method: 'PUT', body: JSON.stringify({ records }) });
    state.saving = false;
    state.sessionExpired = false;
    finishEditing();
    toast(`${records.length}개 기록을 저장했습니다.`);
  } catch (error) {
    state.saving = false;
    if (error.status === 401) state.sessionExpired = true;
    renderEditor(); renderSongs();
    saveLabel(error.status === 401 ? '로그인 만료 · 편집 취소 후 다시 로그인해 주세요' : '저장 실패 · 변경 내용 유지 중 · 다시 저장해 주세요', true);
    toast(error.message, true);
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
function openAuth() { if (state.ready && !state.baseline) { setAuthMode('login'); $('auth-dialog').showModal(); } }
async function loadRecords() {
  const result = await api('/api/records');
  state.records = new Map(result.records.map(r => [recordKey(r.songId, r.difficulty), r.status]));
}
$('account-button').addEventListener('click', () => {
  if (state.baseline) return toast('편집 내용을 저장하거나 취소한 후 계정을 변경해 주세요.');
  if (!state.user) return openAuth();
  $('account-title').textContent = `${state.user.username} 님`;
  $('account-dialog').showModal();
});
$('banner-login').addEventListener('click', openAuth);
$('close-auth').addEventListener('click', () => $('auth-dialog').close());
$('close-account').addEventListener('click', () => $('account-dialog').close());
$('rating-details-button').addEventListener('click', () => {
  if (!state.ready || !state.user) return;
  renderRatingDetails(getRatingBreakdown(state.catalog.songs, state.records));
  $('rating-dialog').showModal();
  $('rating-details-list').parentElement.scrollTop = 0;
});
$('close-rating').addEventListener('click', () => $('rating-dialog').close());
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
  if (state.baseline) return;
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
$('edit-button').addEventListener('click', () => {
  if (!state.ready || staticPreview || state.baseline) return;
  if (!state.user) return openAuth();
  state.baseline = new Map(state.records);
  renderEditor(); renderSongs();
  $('save-button').focus({ preventScroll: true });
});
$('save-button').addEventListener('click', saveEdits);
$('cancel-button').addEventListener('click', () => { if (state.baseline && !state.saving) finishEditing(true); });
$('song-list').addEventListener('change', event => { if (event.target.matches('input[type="checkbox"]')) editRecord(event.target); });
window.addEventListener('beforeunload', event => {
  if (state.saving || recordChanges().length) { event.preventDefault(); event.returnValue = ''; }
});
document.addEventListener('keydown', event => {
  if (event.key === '/' && !event.ctrlKey && !event.metaKey && !['INPUT','TEXTAREA','SELECT'].includes(event.target.tagName) && !document.querySelector('dialog[open]')) {
    event.preventDefault(); $('search').focus();
  }
});
async function initialize() {
  if (cloudMode) {
    document.querySelector('.local-badge').textContent = 'CLOUD MODE';
    document.querySelector('.site-footer > span:last-child').textContent = 'CLOUD MODE · 계정과 기록이 클라우드에 저장됩니다.';
    document.querySelector('.local-note').textContent = '계정과 플레이 기록은 클라우드에 저장됩니다.';
    document.querySelector('#account-dialog .dialog-description').textContent = '기록은 계정에 저장됩니다. 다른 기기에서도 로그인해 이어서 기록할 수 있어요.';
  }
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
