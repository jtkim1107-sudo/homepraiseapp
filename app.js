/* ============================================================
   우리집 칭찬가게 — app.js
   All state, rendering, event handling in one file.
   ============================================================ */

'use strict';

/* ---------- Constants ---------- */

const STORAGE_KEY = 'praise-app-v1';

/* ---------- 클라우드 동기화 (Firebase Realtime Database) ----------
   가족 모두가 같은 FAMILY_KEY "방"의 데이터를 실시간으로 공유한다.
   인터넷이 없거나 Firebase 로드 실패 시 로컬 전용 모드로 동작. */
const CLOUD_DATABASE_URL = 'https://homepraiseapp-default-rtdb.asia-southeast1.firebasedatabase.app';
const FAMILY_KEY = 'fam_x7q2v9m4k8ptw3';
const SHARED_KEYS = ['userNames', 'missions', 'rewards', 'log', 'balance', 'pin', 'posts'];

const DEVICE_ID = (function () {
  const KEY = 'praise-app-device-id';
  let id = null;
  try {
    id = localStorage.getItem(KEY);
    if (!id) {
      id = 'dev_' + Math.random().toString(36).slice(2, 10);
      localStorage.setItem(KEY, id);
    }
  } catch (e) {
    id = 'dev_temp';
  }
  return id;
})();

const DEFAULT_NAMES = {
  parent: '부모님',
  first: '이레',
  second: '겨레',
};

const KIDS = ['first', 'second'];
const ALL_USERS = ['first', 'second', 'parent'];

const KID_META = {
  first:  { age: '8살' },
  second: { age: '3살' },
};

// Chocolate chip positions (viewBox 0-100) — 4 variants for visual variety
const COOKIE_CHIPS = [
  [{cx:30,cy:32,r:5},{cx:62,cy:38,r:4},{cx:44,cy:60,r:5},{cx:72,cy:66,r:3},{cx:28,cy:70,r:4}],
  [{cx:34,cy:28,r:4},{cx:64,cy:32,r:5},{cx:30,cy:60,r:4},{cx:58,cy:70,r:5},{cx:48,cy:48,r:3}],
  [{cx:40,cy:26,r:5},{cx:68,cy:46,r:4},{cx:34,cy:58,r:5},{cx:56,cy:72,r:4},{cx:70,cy:70,r:3}],
  [{cx:28,cy:44,r:5},{cx:52,cy:28,r:4},{cx:70,cy:52,r:5},{cx:38,cy:72,r:4},{cx:62,cy:68,r:3}],
];

function cookieSvg(idx) {
  const chips = COOKIE_CHIPS[idx % COOKIE_CHIPS.length];
  const chipHtml = chips.map(c => `<circle cx="${c.cx}" cy="${c.cy}" r="${c.r}" fill="#3A1E10"/>`).join('');
  return `<svg class="cookie-svg" viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
    ${chipHtml}
    <ellipse cx="30" cy="24" rx="10" ry="4" fill="rgba(255,255,255,0.45)"/>
  </svg>`;
}

const REWARD_EMOJIS = ['🍦','🍩','🍕','🍔','🍫','🍬','🍭','🍪','🧁','🍿','🎮','🕹️','🧸','🎨','🧩','⚽','🎡','🎢','🎳','🎬','🎧','📺','📱','📚','🚲','🏊','🎁','🦄'];

const CONFETTI_CHARS = ['🎉','✨','⭐','💫','🌈','🎊','💛','💜','🧡','💖'];

const PARENT_TABS = [
  { key: 'board',   label: '홈',     icon: '🏠' },
  { key: 'mission', label: '약속',   icon: '📝' },
  { key: 'rewards', label: '시장',   icon: '🎁' },
  { key: 'talk',    label: '게시판', icon: '📌' },
  { key: 'log',     label: '기록',   icon: '📋' },
];

const KID_TABS = [
  { key: 'board',   label: '내 쿠키',    icon: '🍪' },
  { key: 'mission', label: '오늘의 약속', icon: '💪' },
  { key: 'shop',    label: '달란트시장',  icon: '🎁' },
  { key: 'talk',    label: '게시판',      icon: '📌' },
];

/* ---------- Utilities ---------- */

function todayKey() {
  const now = new Date();
  const kst = new Date(now.getTime() + (9 * 60 * 60 * 1000) + (now.getTimezoneOffset() * 60 * 1000));
  return kst.getUTCFullYear() + '-' + String(kst.getUTCMonth() + 1).padStart(2, '0') + '-' + String(kst.getUTCDate()).padStart(2, '0');
}

function dayKeyFromMs(ms) {
  const d = new Date(ms);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

function dayLabelFromKey(key) {
  const today = dayKeyFromMs(Date.now());
  const yesterday = dayKeyFromMs(Date.now() - 86400000);
  if (key === today) return '오늘';
  if (key === yesterday) return '어제';
  const parts = key.split('-').map(Number);
  return parts[1] + '월 ' + parts[2] + '일';
}

function timeOfDayLabel(ms) {
  const d = new Date(ms);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

const MISSION_STATE_ORDER = { todo: 0, pending: 1, done: 2 };
function sortMissions(list) {
  return list.slice().sort((a, b) => {
    const sa = MISSION_STATE_ORDER[a.state] ?? 99;
    const sb = MISSION_STATE_ORDER[b.state] ?? 99;
    if (sa !== sb) return sa - sb;
    return (a.id || 0) - (b.id || 0);
  });
}

function escapeHtml(str) {
  return String(str == null ? '' : str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function newId() {
  return Date.now() + Math.floor(Math.random() * 1000);
}

/* ---------- Initial seed data ---------- */

function seedTsToday(hour, min) {
  const d = new Date();
  d.setHours(hour, min, 0, 0);
  return d.getTime();
}
function seedTsDaysAgo(days, hour, min) {
  const d = new Date(Date.now() - days * 86400000);
  d.setHours(hour, min, 0, 0);
  return d.getTime();
}

function seedState() {
  const today = todayKey();
  return {
    me: 'first',
    tab: 'board',
    userNames: { ...DEFAULT_NAMES },
    missions: [
      { id: 1, kid: 'first',  text: '📚 숙제 다 하기',          state: 'todo',    by: 'parent', stars: 1, repeat: true,  lastReset: today },
      { id: 2, kid: 'first',  text: '📖 책 20분 읽기',          state: 'pending', by: 'parent', stars: 2, repeat: true,  lastReset: today },
      { id: 3, kid: 'first',  text: '🤝 동생이랑 사이좋게 놀기', state: 'todo',    by: 'parent', stars: 1, repeat: true,  lastReset: today },
      { id: 4, kid: 'first',  text: '🎹 피아노 10분 연습',       state: 'pending', by: 'parent', stars: 3, repeat: false, lastReset: today },
      { id: 5, kid: 'second', text: '🧸 장난감 정리하기',        state: 'todo',    by: 'parent', stars: 1, repeat: true,  lastReset: today },
      { id: 6, kid: 'second', text: '🪥 혼자 양치하기',          state: 'done',    by: 'parent', stars: 1, repeat: true,  lastReset: today },
    ],
    rewards: [
      { id: 1, emoji: '🍦', text: '아이스크림',        price: 10, by: 'parent' },
      { id: 2, emoji: '📺', text: '만화 30분 더 보기', price: 15, by: 'parent' },
      { id: 3, emoji: '🎡', text: '주말 놀이공원',     price: 50, by: 'parent' },
      { id: 4, emoji: '🧸', text: '장난감 하나',        price: 40, by: 'parent' },
    ],
    log: [
      { id: 91, kid: 'second', text: '혼자 양치하기 성공', delta: 1, atMs: seedTsToday(8, 30) },
      { id: 92, kid: 'first',  text: '어제 약속 3개 지킴',  delta: 3, atMs: seedTsDaysAgo(1, 19, 30) },
    ],
    posts: [
      { id: 81, by: 'parent', text: '우리 가족 게시판이 생겼어요! 하고 싶은 말, 고마운 마음을 자유롭게 남겨보세요 💛', atMs: seedTsToday(9, 0), hearts: [] },
    ],
    balance: { first: 12, second: 6 },
    pin: '0000',
    bonusKid: 'first', bonusText: '', talkText: '',
    nmKid: 'first', nmText: '', nmStars: 1, nmRepeat: true,
    nrEmoji: '🍩', nrText: '', nrPrice: 10,
  };
}

/* ---------- State & persistence ---------- */

const PERSIST_KEYS = ['me', 'tab', 'userNames', 'missions', 'rewards', 'log', 'balance', 'pin', 'posts'];

const state = loadState();

// Ephemeral state (never persisted)
state.award = null;
state.celebration = null;
state.confetti = [];
state.toast = null;
state.settingsOpen = false;
state.settingsDraft = {};
state.pinOpen = false;
state.pinInput = '';

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const saved = JSON.parse(raw);
    const merged = seedState();
    for (const k of PERSIST_KEYS) {
      if (saved[k] !== undefined) merged[k] = saved[k];
    }
    // 구버전 마이그레이션: 엄마/아빠 계정 → 부모님 통합
    if (merged.me === 'dad' || merged.me === 'mom') merged.me = 'parent';
    merged.missions = merged.missions.map(m =>
      (m.by === 'dad' || m.by === 'mom') ? { ...m, by: 'parent' } : m);
    merged.rewards = merged.rewards.map(r =>
      (r.by === 'dad' || r.by === 'mom') ? { ...r, by: 'parent' } : r);
    if (merged.userNames && merged.userNames.parent === undefined) {
      merged.userNames = {
        parent: '부모님',
        first: merged.userNames.first || '이레',
        second: merged.userNames.second || '겨레',
      };
    }
    return applyDailyReset(merged);
  } catch (e) {
    return seedState();
  }
}

function saveLocal() {
  const snapshot = {};
  for (const k of PERSIST_KEYS) snapshot[k] = state[k];
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch (e) { /* quota, ignore */ }
}

function saveState() {
  saveLocal();
  cloudSave();
}

/* ---------- 클라우드 읽기/쓰기 ---------- */

let cloudRef = null;

function initCloud() {
  if (typeof firebase === 'undefined' || !CLOUD_DATABASE_URL) return; // 로컬 전용 모드
  try {
    firebase.initializeApp({ databaseURL: CLOUD_DATABASE_URL });
    cloudRef = firebase.database().ref('families/' + FAMILY_KEY + '/state');
    cloudRef.on('value', snap => {
      const remote = snap.val();
      if (!remote || !remote.data) {
        // 클라우드가 비어있음 → 이 기기의 데이터를 첫 데이터로 올림
        cloudSave();
        return;
      }
      if (remote.by === DEVICE_ID) return; // 내가 방금 쓴 데이터의 메아리
      let shared;
      try { shared = JSON.parse(remote.data); } catch (e) { return; }
      let changed = false;
      for (const k of SHARED_KEYS) {
        if (shared[k] !== undefined && JSON.stringify(shared[k]) !== JSON.stringify(state[k])) {
          state[k] = shared[k];
          changed = true;
        }
      }
      if (changed) {
        applyDailyReset(state);
        saveLocal();
        render();
      }
    });
  } catch (e) { /* 연결 실패 → 로컬 전용 모드로 계속 */ }
}

function cloudSave() {
  if (!cloudRef) return;
  const shared = {};
  for (const k of SHARED_KEYS) shared[k] = state[k];
  // 배열/객체를 JSON 문자열로 통째로 저장 (RTDB의 빈 배열 삭제 특성 회피)
  cloudRef.set({
    by: DEVICE_ID,
    updatedAt: Date.now(),
    data: JSON.stringify(shared),
  }).catch(() => {});
}

function applyDailyReset(s) {
  const today = todayKey();
  s.missions = s.missions.map(m => {
    if (m.repeat && m.lastReset !== today) {
      return { ...m, state: 'todo', lastReset: today };
    }
    return m;
  });
  return s;
}

/* ---------- Small helpers on state ---------- */

function nameOf(id)         { return state.userNames[id] || DEFAULT_NAMES[id] || id; }
function isParent(id)       { return id === 'parent'; }
function meIsParent()       { return isParent(state.me); }
function myKidId()          { return isParent(state.me) ? null : state.me; }
function kidTheme(kidId)    { return kidId === 'first' ? 'first' : 'second'; }

/* ============================================================
   Actions
   ============================================================ */

function switchUser(id) {
  state.me = id;
  state.tab = 'board';
  saveState();
  render();
}

function switchTab(tabKey) {
  state.tab = tabKey;
  render();
}

function showToast(msg) {
  clearTimeout(showToast._t);
  state.toast = msg;
  render();
  showToast._t = setTimeout(() => {
    state.toast = null;
    render();
  }, 2200);
}

function makeConfetti() {
  const list = [];
  for (let i = 0; i < 40; i++) {
    const dur = 1400 + Math.random() * 1300;
    const delay = Math.random() * 500;
    const size = 14 + Math.random() * 22;
    list.push({
      char: CONFETTI_CHARS[i % CONFETTI_CHARS.length],
      left: Math.random() * 100,
      size: size,
      dur: dur,
      delay: delay,
    });
  }
  return list;
}

function celebrate(emoji, text, sub) {
  const nonce = Date.now();
  state.celebration = { emoji: emoji, text: text, sub: sub, nonce: nonce };
  state.confetti = makeConfetti();
  render();
  clearTimeout(celebrate._t);
  celebrate._t = setTimeout(() => {
    if (state.celebration && state.celebration.nonce === nonce) {
      state.celebration = null;
      state.confetti = [];
      render();
    }
  }, 3000);
}

function closeCelebration() {
  state.celebration = null;
  state.confetti = [];
  render();
}

function requestDone(missionId) {
  const m = state.missions.find(x => x.id === missionId);
  if (!m) return;
  m.state = 'pending';
  saveState();
  showToast('엄마아빠한테 확인을 부탁했어요! 🙌');
}

function approveMission(missionId) {
  const m = state.missions.find(x => x.id === missionId);
  if (!m) return;
  const stars = m.stars || 1;
  m.state = 'done';
  state.balance[m.kid] = (state.balance[m.kid] || 0) + stars;
  state.log.unshift({
    id: newId(), kid: m.kid, text: m.text, delta: stars, atMs: Date.now(),
  });
  const nonce = Date.now();
  state.award = { kid: m.kid, count: stars, nonce: nonce };
  saveState();
  celebrate('🍪', nameOf(m.kid) + ', 약속 지킴!', '쿠키 ' + stars + '개를 받았어요 🎉');
  setTimeout(() => {
    if (state.award && state.award.nonce === nonce) {
      state.award = null;
      render();
    }
  }, 1600);
}

function rejectMission(missionId) {
  const m = state.missions.find(x => x.id === missionId);
  if (!m) return;
  m.state = 'todo';
  saveState();
  render();
}

function giveBonus() {
  const text = (state.bonusText || '').trim();
  if (!text) return;
  const kid = state.bonusKid;
  state.balance[kid] = (state.balance[kid] || 0) + 1;
  state.log.unshift({
    id: newId(), kid: kid, text: text, delta: 1, atMs: Date.now(),
  });
  state.bonusText = '';
  const nonce = Date.now();
  state.award = { kid: kid, count: 1, nonce: nonce };
  saveState();
  showToast(nameOf(kid) + '에게 칭찬 쿠키! 💖');
  setTimeout(() => {
    if (state.award && state.award.nonce === nonce) {
      state.award = null;
      render();
    }
  }, 1600);
}

function deleteMission(id) {
  const m = state.missions.find(x => x.id === id);
  if (!m) return;
  state.missions = state.missions.filter(x => x.id !== id);
  saveState();
  render();
  showToast('약속을 삭제했어요');
}

function addMission() {
  const text = (state.nmText || '').trim();
  if (!text) return;
  state.missions.push({
    id: newId(),
    kid: state.nmKid,
    text: text,
    state: 'todo',
    by: state.me,
    stars: state.nmStars,
    repeat: state.nmRepeat,
    lastReset: todayKey(),
  });
  state.nmText = '';
  saveState();
  showToast(nameOf(state.nmKid) + '에게 새 약속을 보냈어요 📨');
}

function addReward() {
  const text = (state.nrText || '').trim();
  if (!text) return;
  state.rewards.push({
    id: newId(),
    emoji: state.nrEmoji,
    text: text,
    price: state.nrPrice,
    by: 'parent',
  });
  state.nrText = '';
  saveState();
  showToast('달란트시장에 새 보상이 올라왔어요 🎁');
}

function changeRewardPrice(id, delta) {
  const r = state.rewards.find(x => x.id === id);
  if (!r) return;
  r.price = Math.max(1, r.price + delta);
  saveState();
  render();
}

function removeReward(id) {
  state.rewards = state.rewards.filter(r => r.id !== id);
  saveState();
  render();
}

function buyReward(id) {
  const r = state.rewards.find(x => x.id === id);
  if (!r) return;
  const kid = myKidId();
  if (!kid) return;
  const bal = state.balance[kid] || 0;
  if (bal < r.price) {
    showToast('쿠키가 ' + (r.price - bal) + '개 더 필요해요!');
    return;
  }
  state.balance[kid] = bal - r.price;
  state.log.unshift({
    id: newId(), kid: kid, text: r.emoji + ' ' + r.text + ' 획득!', delta: -r.price, atMs: Date.now(),
  });
  saveState();
  celebrate(r.emoji, r.text + ' 획득!', '축하해요! 🎉');
}

/* ---------- 게시판 ---------- */

function addPost() {
  const text = (state.talkText || '').trim();
  if (!text) return;
  if (!Array.isArray(state.posts)) state.posts = [];
  state.posts.unshift({ id: newId(), by: state.me, text: text, atMs: Date.now(), hearts: [] });
  state.talkText = '';
  saveState();
  render();
  showToast('게시판에 글을 올렸어요 📌');
}

function deletePost(id) {
  const p = (state.posts || []).find(x => x.id === id);
  if (!p) return;
  if (!meIsParent() && p.by !== state.me) return;
  state.posts = state.posts.filter(x => x.id !== id);
  saveState();
  render();
  showToast('글을 삭제했어요');
}

function togglePostHeart(id) {
  const p = (state.posts || []).find(x => x.id === id);
  if (!p) return;
  if (!Array.isArray(p.hearts)) p.hearts = [];
  const i = p.hearts.indexOf(state.me);
  if (i >= 0) p.hearts.splice(i, 1);
  else p.hearts.push(state.me);
  saveState();
  render();
}

/* ---------- PIN lock (부모님 화면 잠금) ---------- */

function openPinModal() {
  state.pinOpen = true;
  state.pinInput = '';
  render();
}
function closePinModal() {
  state.pinOpen = false;
  state.pinInput = '';
  render();
}
function pressPinDigit(digit) {
  if (!state.pinOpen || state.pinInput.length >= 4) return;
  state.pinInput += digit;
  if (state.pinInput.length === 4) {
    if (state.pinInput === (state.pin || '0000')) {
      state.pinOpen = false;
      state.pinInput = '';
      switchUser('parent');
      return;
    }
    state.pinInput = '';
    render();
    showToast('비밀번호가 틀렸어요 🙅');
    return;
  }
  renderPinModal();
}

/* ---------- Settings modal ---------- */

function openSettings() {
  state.settingsOpen = true;
  state.settingsDraft = { ...state.userNames, pin: '' };
  render();
}
function closeSettings() {
  state.settingsOpen = false;
  render();
}
function saveSettings() {
  const draft = state.settingsDraft || {};
  const pinRaw = (draft.pin || '').trim();
  if (pinRaw && !/^\d{4}$/.test(pinRaw)) {
    showToast('비밀번호는 숫자 4자리로 해주세요');
    return;
  }
  for (const id of ALL_USERS) {
    const raw = (draft[id] || '').trim();
    state.userNames[id] = raw || DEFAULT_NAMES[id];
  }
  if (pinRaw) state.pin = pinRaw;
  state.settingsOpen = false;
  saveState();
  render();
  showToast('설정을 저장했어요');
}
function resetNames() {
  state.settingsDraft = { ...DEFAULT_NAMES, pin: '' };
  render();
}

/* ============================================================
   Rendering — build HTML strings, then set innerHTML
   ============================================================ */

function renderHeader() {
  const cls = meIsParent() ? '-parent' : (state.me === 'first' ? '-first' : '-second');
  const header = document.getElementById('app-header');
  header.className = 'app-header ' + cls;

  const chips = ALL_USERS.map(id => {
    const active = state.me === id;
    let chipCls = 'chip ';
    if (active) chipCls += '-active';
    else chipCls += isParent(id) ? '-parent' : '-kid';
    if (id === 'parent') chipCls += ' -push-right';
    return `<button class="${chipCls}" data-action="switch-user" data-id="${id}">${escapeHtml(nameOf(id))}</button>`;
  }).join('');

  header.innerHTML = `
    <div class="header-top">
      <div class="app-title">우리집 칭찬가게</div>
      <div class="header-icons">
        <span class="header-star" aria-hidden="true">⭐</span>
        <button class="header-cog" data-action="open-settings" aria-label="설정">⚙️</button>
      </div>
    </div>
    <div class="user-chips">${chips}</div>
  `;
}

function renderTabs() {
  const nav = document.getElementById('app-tabs');
  const isP = meIsParent();
  const tabs = isP ? PARENT_TABS : KID_TABS;
  const accent = isP ? 'var(--navy)' : (state.me === 'first' ? 'var(--first)' : 'var(--second)');
  nav.style.setProperty('--tab-accent', accent);
  nav.innerHTML = tabs.map(t => `
    <button class="tab ${state.tab === t.key ? '-active' : ''}" data-action="switch-tab" data-tab="${t.key}">
      <span class="tab-icon">${t.icon}</span>
      <span class="tab-label">${t.label}</span>
    </button>
  `).join('');
}

function renderMain() {
  const main = document.getElementById('app-main');
  let cls = 'app-main';
  if (!meIsParent()) cls += state.me === 'first' ? ' -first' : ' -second';
  main.className = cls;

  const isP = meIsParent();
  let html = '';
  if (!isP) {
    if (state.tab === 'board')   html = renderKidBoard();
    if (state.tab === 'mission') html = renderKidMission();
    if (state.tab === 'shop')    html = renderKidShop();
    if (state.tab === 'talk')    html = renderTalk();
  } else {
    if (state.tab === 'board')   html = renderParentHome();
    if (state.tab === 'mission') html = renderParentMission();
    if (state.tab === 'rewards') html = renderParentRewards();
    if (state.tab === 'talk')    html = renderTalk();
    if (state.tab === 'log')     html = renderParentLog();
  }
  main.innerHTML = html;

  // Wire up controlled inputs (post-render because innerHTML resets values)
  wireInputs();
}

/* ---------- Kid: Board ---------- */

function renderKidBoard() {
  const kid = myKidId();
  const themeCls = kid === 'first' ? '-first' : '-second';
  const count = state.balance[kid] || 0;

  const nextReward = state.rewards
    .filter(r => r.price > count)
    .sort((a, b) => a.price - b.price)[0];
  const goal = nextReward ? nextReward.price : Math.max(10, Math.ceil((count + 1) / 5) * 5);

  const COLS = 5;
  const MAX_ROWS = 8;
  const rows = Math.min(MAX_ROWS, Math.max(2, Math.ceil(goal / COLS)));
  const totalSlots = rows * COLS;

  const award = state.award;
  const stampN = (award && award.kid === kid) ? award.count : 0;
  const firstStamp = count - stampN;

  // Grid renders top-to-bottom, left-to-right; we want fills from bottom-left up.
  // For a slot at DOM index i (row from top r_t, col c):
  //   bottom-based index = (rows-1-r_t) * cols + c
  //   filled iff bot_idx < count
  const slots = [];
  for (let i = 0; i < totalSlots; i++) {
    const r_t = Math.floor(i / COLS);
    const c = i % COLS;
    const r_b = rows - 1 - r_t;
    const bot_idx = r_b * COLS + c;
    const filled = bot_idx < count;
    const stamping = filled && bot_idx >= firstStamp && stampN > 0;
    const rot = ((bot_idx * 37) % 9) - 4;
    if (filled) {
      const delay = stamping ? `animation-delay:${(bot_idx - firstStamp) * 90}ms;` : '';
      slots.push(`
        <div class="jar-slot ${themeCls}" style="transform:rotate(${rot}deg)">
          <div class="jar-stamp ${stamping ? '-in' : ''}" style="${delay}">
            ${cookieSvg(bot_idx)}
          </div>
        </div>
      `);
    } else {
      slots.push(`
        <div class="jar-slot ${themeCls}">
          <div class="jar-slot-empty"></div>
        </div>
      `);
    }
  }

  const themeColor = kid === 'first' ? '#7048E8' : '#F76707';
  const themeDeep  = kid === 'first' ? '#5F3DC4' : '#E8590C';
  const themeBg    = kid === 'first' ? '#F3F0FF' : '#FFF4E6';

  const jarSvg = `
    <svg class="jar-svg" viewBox="0 0 200 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <defs>
        <linearGradient id="jarShine-${kid}" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"  stop-color="rgba(255,255,255,0.55)"/>
          <stop offset="30%" stop-color="rgba(255,255,255,0.12)"/>
          <stop offset="100%" stop-color="rgba(255,255,255,0)"/>
        </linearGradient>
      </defs>
      <!-- Lid -->
      <rect x="66" y="0"  width="68" height="18" rx="6" fill="${themeDeep}"/>
      <rect x="56" y="16" width="88" height="12" rx="4" fill="${themeDeep}"/>
      <!-- Jar body -->
      <path d="M 30 32 L 170 32 C 178 32, 184 38, 184 48
               L 184 244 C 184 260, 168 274, 152 274
               L 48 274 C 32 274, 16 260, 16 244
               L 16 48 C 16 38, 22 32, 30 32 Z"
            fill="${themeBg}"
            stroke="${themeColor}"
            stroke-width="3"/>
      <!-- Left glass shine -->
      <path d="M 30 60 Q 30 160 30 220"
            stroke="rgba(255,255,255,0.75)"
            stroke-width="6"
            fill="none"
            stroke-linecap="round"/>
      <path d="M 30 32 L 170 32 C 178 32, 184 38, 184 48
               L 184 244 C 184 260, 168 274, 152 274
               L 48 274 C 32 274, 16 260, 16 244
               L 16 48 C 16 38, 22 32, 30 32 Z"
            fill="url(#jarShine-${kid})"/>
    </svg>
  `;

  const nextLine = nextReward
    ? `<div class="board-next">${nextReward.emoji} ${escapeHtml(nextReward.text)}까지 ${nextReward.price - count}개!</div>`
    : '<div class="board-next">모든 보상을 살 수 있어요! 🎉</div>';

  return `
    <div class="board-head ${themeCls}">
      <div class="board-name">${escapeHtml(nameOf(kid))}의 쿠키</div>
      <div class="board-count">${count}</div>
      <div class="jar">
        ${jarSvg}
        <div class="jar-slots" style="--rows:${rows}">${slots.join('')}</div>
      </div>
      ${nextLine}
    </div>
  `;
}

/* ---------- Kid: Mission ---------- */

function renderKidMission() {
  const kid = myKidId();
  const themeCls = kid === 'first' ? '-first' : '-second';
  const list = sortMissions(state.missions.filter(m => m.kid === kid));

  const cards = list.map(m => renderMissionCard(m, themeCls, true)).join('');
  return `
    <h2 class="screen-title">오늘의 약속 💪</h2>
    <div class="mission-list">
      ${cards || `<div class="empty-box">오늘은 약속이 없어요 ✨</div>`}
    </div>
  `;
}

function renderMissionCard(m, themeCls, kidCanRequest) {
  const stars = m.stars || 1;
  const done = m.state === 'done';
  const pending = m.state === 'pending';
  const tokenGlyph = done ? '🌟' : pending ? '⏳' : '';
  let tokenCls = 'mission-token';
  if (done) tokenCls += ' -done-' + (themeCls === '-first' ? 'first' : 'second');
  else if (pending) tokenCls += ' -pending';
  else tokenCls += ' -todo-' + (themeCls === '-first' ? 'first' : 'second');

  const starBadge = stars > 1 ? `<span class="stars-badge">⭐×${stars}</span>` : '';

  let actionHtml = '';
  if (kidCanRequest && m.state === 'todo') {
    actionHtml = `<button class="btn-request ${themeCls}" data-action="request-done" data-id="${m.id}">했어요!</button>`;
  } else if (pending) {
    actionHtml = `<span class="pill-pending ${themeCls}">기다리는 중</span>`;
  } else if (done) {
    actionHtml = `<span class="done-tag ${themeCls}">완료 🎉</span>`;
  }

  const textCls = 'mission-text' + (done ? ' -done' : '');
  return `
    <div class="mission-card">
      <div class="${tokenCls}">${tokenGlyph}</div>
      <div class="mission-body">
        <div class="${textCls}">${escapeHtml(m.text)}</div>
        ${starBadge ? `<div class="mission-meta">${starBadge}</div>` : ''}
      </div>
      <div class="mission-actions">${actionHtml}</div>
    </div>
  `;
}


/* ---------- Kid: Shop ---------- */

function renderKidShop() {
  const kid = myKidId();
  const themeCls = kid === 'first' ? '-first' : '-second';
  const bal = state.balance[kid] || 0;

  const cards = state.rewards.map(r => {
    const can = bal >= r.price;
    const btnCls = can ? ('btn-buy -can-' + (themeCls === '-first' ? 'first' : 'second')) : 'btn-buy -no';
    const btnLabel = can ? '바꾸기!' : (r.price - bal) + '개 더';
    return `
      <div class="shop-card">
        <div class="shop-emoji">${r.emoji}</div>
        <div class="shop-body">
          <div class="shop-name">${escapeHtml(r.text)}</div>
          <div class="shop-price">쿠키 ${r.price}개</div>
        </div>
        <button class="${btnCls}" data-action="buy" data-id="${r.id}">${btnLabel}</button>
      </div>
    `;
  }).join('');

  return `
    <div class="shop-head">
      <span class="shop-title">달란트시장 🎁</span>
      <span class="shop-balance ${themeCls}">내 쿠키 ${bal}개</span>
    </div>
    <div class="shop-info">
      <span class="shop-owner">${escapeHtml(nameOf('parent'))} 달란트시장</span>
      <span class="shop-info-sub">정성껏 준비한 보상이에요</span>
    </div>
    <div class="shop-list">
      ${cards || `<div class="empty-box">아직 준비된 보상이 없어요</div>`}
    </div>
  `;
}

/* ---------- Parent: Home ---------- */

function renderParentHome() {
  const pending = state.missions.filter(m => m.state === 'pending');

  const pendingBlock = pending.length === 0
    ? `<div class="empty-box">지금은 확인할 약속이 없어요 ✨</div>`
    : `<div class="pending-list">${pending.map(m => renderPendingCard(m)).join('')}</div>`;

  const badge = pending.length > 0
    ? `<span class="pending-badge">${pending.length}</span>`
    : '';

  const kidsRow = KIDS.map(k => `
    <div class="kid-status-card -${k}">
      <div class="kid-status-name">${escapeHtml(nameOf(k))}<span class="kid-status-age">${KID_META[k].age}</span></div>
      <div class="kid-status-num">${state.balance[k] || 0}</div>
      <div class="kid-status-label">쿠키</div>
    </div>
  `).join('');

  const bonusBlock = `
    <div class="sub-head">칭찬 쿠키 바로 주기 💖</div>
    <div class="bonus-box">
      <div class="pill-row">
        ${KIDS.map(k => {
          const cls = 'pill' + (state.bonusKid === k ? (' -active-' + k) : '');
          return `<button class="${cls}" data-action="set-bonus-kid" data-kid="${k}">${escapeHtml(nameOf(k))}</button>`;
        }).join('')}
      </div>
      <div class="bonus-input-row">
        <input class="text-input" id="input-bonus-text" placeholder="칭찬 이유 (예: 심부름 잘함)" value="${escapeHtml(state.bonusText || '')}" data-input="bonus-text"/>
        <button class="btn-navy" data-action="give-bonus">🍪 주기</button>
      </div>
    </div>
  `;

  return `
    <div class="section-head">
      <span class="section-title">확인해주세요</span>
      ${badge}
    </div>
    ${pendingBlock}
    <div class="sub-head">아이들 현황</div>
    <div class="kids-status-row">${kidsRow}</div>
    ${bonusBlock}
  `;
}

function renderPendingCard(m) {
  const cls = 'pending-card -' + m.kid;
  const starText = (m.stars || 1) > 1 ? `<span class="pending-stars">⭐×${m.stars}</span>` : '';
  return `
    <div class="${cls}">
      <div class="pending-body">
        <div class="pending-kid-row">
          <span class="pending-kid-name -${m.kid}">${escapeHtml(nameOf(m.kid))}</span>
          ${starText}
        </div>
        <div class="pending-text">${escapeHtml(m.text)}</div>
      </div>
      <button class="btn-reject" data-action="reject-mission" data-id="${m.id}">아직</button>
      <button class="btn-approve -${m.kid}" data-action="approve-mission" data-id="${m.id}">쿠키 주기 🍪</button>
    </div>
  `;
}

/* ---------- Parent: Mission ---------- */

function renderParentMission() {
  const sections = KIDS.map(k => {
    const list = sortMissions(state.missions.filter(m => m.kid === k));
    const rows = list.map(m => renderParentMissionRow(m)).join('');
    return `
      <div class="mission-section">
        <div class="mission-section-title -${k}">${escapeHtml(nameOf(k))} 약속</div>
        <div class="parent-mission-list">
          ${rows || `<div class="empty-box">아직 약속이 없어요</div>`}
        </div>
      </div>
    `;
  }).join('');

  const kidPills = KIDS.map(k => {
    const cls = 'pill' + (state.nmKid === k ? (' -active-' + k) : '');
    return `<button class="${cls}" data-action="set-nm-kid" data-kid="${k}">${escapeHtml(nameOf(k))}</button>`;
  }).join('');

  const repeatPills = [
    { v: true,  label: '매일 약속' },
    { v: false, label: '한 번만' },
  ].map(opt => {
    const active = state.nmRepeat === opt.v;
    return `<button class="pill ${active ? '-active-navy' : ''}" data-action="set-nm-repeat" data-repeat="${opt.v}">${opt.label}</button>`;
  }).join('');

  const starPicks = [1, 2, 3].map(n => {
    const active = state.nmStars === n;
    return `<button class="star-pick ${active ? '-active' : ''}" data-action="set-nm-stars" data-stars="${n}">⭐${n}</button>`;
  }).join('');

  const submitCls = 'btn-submit -' + state.nmKid;
  const submitLabel = nameOf(state.nmKid) + '에게 약속 보내기';

  return `
    ${sections}
    <div class="sub-head">새 약속 보내기 📨</div>
    <div class="form-box">
      <div class="pill-row">${kidPills}</div>
      <input class="text-input-wide" id="input-nm-text" placeholder="약속 내용 (예: 🧸 장난감 정리하기)" value="${escapeHtml(state.nmText || '')}" data-input="nm-text"/>
      <div class="form-row">
        <div style="display:flex;gap:6px;flex-wrap:wrap">${repeatPills}</div>
        <div style="display:flex;gap:6px">${starPicks}</div>
      </div>
      <button class="${submitCls}" data-action="add-mission">${escapeHtml(submitLabel)}</button>
      <div class="form-note">매일 약속은 매일 아침 자동으로 다시 생겨요</div>
    </div>
  `;
}

function renderParentMissionRow(m) {
  const done = m.state === 'done';
  const pending = m.state === 'pending';
  const iconMap = { done: '🌟', pending: '⏳', todo: '⬜' };
  const stars = (m.stars || 1) > 1
    ? `<span class="stars-badge">⭐×${m.stars}</span>`
    : '';
  const pendingTag = pending
    ? `<span class="pill-pending -${m.kid}">확인 대기</span>`
    : '';
  const textCls = 'parent-mission-text' + (done ? ' -done' : '');
  return `
    <div class="parent-mission-row">
      <span class="parent-mission-icon">${iconMap[m.state] || '⬜'}</span>
      <span class="${textCls}">${escapeHtml(m.text)}</span>
      ${stars}
      ${pendingTag}
      <button class="mission-delete" data-action="delete-mission" data-id="${m.id}" aria-label="삭제">✕</button>
    </div>
  `;
}

/* ---------- Parent: Rewards ---------- */

function renderParentRewards() {
  const rows = state.rewards.map(r => `
      <div class="reward-row">
        <span class="reward-emoji">${r.emoji}</span>
        <div class="reward-body">
          <span class="reward-name">${escapeHtml(r.text)}</span>
        </div>
        <div class="reward-stepper">
          <button class="step-btn" data-action="reward-dec" data-id="${r.id}">−</button>
          <span class="reward-price">🍪${r.price}</span>
          <button class="step-btn" data-action="reward-inc" data-id="${r.id}">+</button>
          <button class="reward-remove" data-action="reward-remove" data-id="${r.id}" aria-label="삭제">✕</button>
        </div>
      </div>
  `).join('');

  const emojiPicks = REWARD_EMOJIS.map(e => {
    const active = state.nrEmoji === e;
    return `<button class="emoji-pick ${active ? '-active' : ''}" data-action="set-nr-emoji" data-emoji="${e}">${e}</button>`;
  }).join('');

  const addForm = `
    <div class="sub-head">새 보상 추가</div>
    <div class="form-box">
      <div class="emoji-grid">${emojiPicks}</div>
      <input class="text-input-wide" id="input-nr-text" placeholder="보상 이름 (예: 치킨 시켜먹기)" value="${escapeHtml(state.nrText || '')}" data-input="nr-text"/>
      <div class="price-stepper-row">
        <span class="price-label">쿠키 가격</span>
        <div class="price-stepper">
          <button class="step-btn-lg" data-action="nr-price-dec">−</button>
          <span class="price-value">🍪${state.nrPrice}</span>
          <button class="step-btn-lg" data-action="nr-price-inc">+</button>
        </div>
      </div>
      <button class="btn-navy" style="width:100%;padding:13px;font-size:16px;border-radius:14px" data-action="add-reward">달란트시장에 올리기</button>
    </div>
  `;

  return `
    <div class="section-head"><span class="section-title">달란트시장 관리 🎁</span></div>
    <div style="display:flex;flex-direction:column;gap:9px">${rows}</div>
    ${addForm}
  `;
}

/* ---------- 게시판 (부모 + 아이 공용) ---------- */

function renderTalk() {
  const me = state.me;
  const themeCls = meIsParent() ? '-parent' : (me === 'first' ? '-first' : '-second');

  const composer = `
    <div class="note-composer">
      <input class="text-input" id="input-talk-text" placeholder="가족에게 하고 싶은 말을 남겨보세요" value="${escapeHtml(state.talkText || '')}" data-input="talk-text"/>
      <button class="btn-send ${themeCls}" data-action="add-post">📌 올리기</button>
    </div>
  `;

  const posts = (state.posts || []).slice().sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
  const groups = new Map();
  for (const p of posts) {
    const key = p.atMs ? dayKeyFromMs(p.atMs) : 'older';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(p);
  }

  const sections = Array.from(groups.entries()).map(([key, entries]) => {
    const label = key === 'older' ? '그전' : dayLabelFromKey(key);
    const cards = entries.map(p => renderNoteCard(p)).join('');
    return `
      <div class="log-group">
        <div class="log-group-head">${escapeHtml(label)}</div>
        <div class="note-list">${cards}</div>
      </div>
    `;
  }).join('');

  return `
    <h2 class="screen-title">우리집 게시판 📌</h2>
    ${composer}
    ${sections || `<div class="empty-box">아직 글이 없어요. 첫 글을 남겨보세요 ✨</div>`}
  `;
}

function renderNoteCard(p) {
  const authorCls = isParent(p.by) ? '-parent' : ('-' + p.by);
  const hearts = Array.isArray(p.hearts) ? p.hearts : [];
  const mine = hearts.indexOf(state.me) >= 0;
  const heartLabel = hearts.length > 0 ? '💛 ' + hearts.length : '🤍';
  const heartNames = hearts.length > 0
    ? `<span class="note-heart-names">${escapeHtml(hearts.map(nameOf).join(', '))}</span>`
    : '';
  const canDelete = meIsParent() || p.by === state.me;
  const delBtn = canDelete
    ? `<button class="note-delete" data-action="delete-post" data-id="${p.id}" aria-label="삭제">✕</button>`
    : '';
  return `
    <div class="note-card ${authorCls}">
      <div class="note-top">
        <span class="note-author ${authorCls}">${escapeHtml(nameOf(p.by))}</span>
        <span class="note-time">${p.atMs ? timeOfDayLabel(p.atMs) : ''}</span>
        ${delBtn}
      </div>
      <div class="note-text">${escapeHtml(p.text)}</div>
      <div class="note-foot">
        <button class="note-heart ${mine ? '-on' : ''}" data-action="toggle-heart" data-id="${p.id}">${heartLabel}</button>
        ${heartNames}
      </div>
    </div>
  `;
}

/* ---------- Parent: Log ---------- */

function renderParentLog() {
  const list = state.log.slice().sort((a, b) => (b.atMs || 0) - (a.atMs || 0));
  const groups = new Map();
  for (const l of list) {
    const key = l.atMs ? dayKeyFromMs(l.atMs) : (l.at || 'older');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  }

  const sections = Array.from(groups.entries()).map(([key, entries]) => {
    const label = key === 'older' ? '그전' : dayLabelFromKey(key);
    const rows = entries.map(l => {
      const kidCls = '-' + l.kid;
      const deltaCls = l.delta > 0 ? '-plus' : '-minus';
      const deltaLabel = l.delta > 0 ? ('+' + l.delta) : ('' + l.delta);
      const time = l.atMs ? timeOfDayLabel(l.atMs) : '';
      return `
        <div class="log-row">
          <span class="log-tag ${kidCls}">${escapeHtml(nameOf(l.kid))}</span>
          <div class="log-text-block">
            <div class="log-text">${escapeHtml(l.text)}</div>
            ${time ? `<div class="log-time">${time}</div>` : ''}
          </div>
          <span class="log-delta ${deltaCls}">${deltaLabel}</span>
        </div>
      `;
    }).join('');
    return `
      <div class="log-group">
        <div class="log-group-head">${escapeHtml(label)}</div>
        <div class="log-list">${rows}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="section-head"><span class="section-title">기록 📋</span></div>
    ${sections || `<div class="empty-box">아직 기록이 없어요</div>`}
  `;
}

/* ---------- Toast / Celebration / Settings ---------- */

function renderToast() {
  const el = document.getElementById('toast');
  if (state.toast) {
    el.textContent = state.toast;
    el.hidden = false;
  } else {
    el.hidden = true;
  }
}

function renderCelebration() {
  const el = document.getElementById('celebration');
  if (!state.celebration) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  document.getElementById('celebration-emoji').textContent = state.celebration.emoji;
  document.getElementById('celebration-text').textContent = state.celebration.text;
  document.getElementById('celebration-sub').textContent = state.celebration.sub;
  const layer = document.getElementById('confetti');
  layer.innerHTML = state.confetti.map(c => `
    <div class="confetti-piece" style="left:${c.left}%; font-size:${c.size}px; animation-duration:${c.dur}ms; animation-delay:${c.delay}ms;">${c.char}</div>
  `).join('');
}

function renderSettings() {
  const el = document.getElementById('settings-modal');
  if (!state.settingsOpen) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  const draft = state.settingsDraft || {};
  const fields = [
    { id: 'parent', label: '부모님 표시 이름' },
    { id: 'first', label: '첫째 이름' },
    { id: 'second', label: '둘째 이름' },
  ].map(f => `
    <div>
      <div class="field-label">${f.label}</div>
      <input class="field-input" data-settings-id="${f.id}" placeholder="${DEFAULT_NAMES[f.id]}" value="${escapeHtml(draft[f.id] || '')}"/>
    </div>
  `).join('');
  const pinField = `
    <div>
      <div class="field-label">부모님 비밀번호 (숫자 4자리)</div>
      <input class="field-input" data-settings-id="pin" inputmode="numeric" maxlength="4" placeholder="바꾸려면 입력 (처음엔 0000)" value="${escapeHtml(draft.pin || '')}"/>
    </div>
  `;
  document.getElementById('settings-body').innerHTML = fields + pinField;
}

function renderPinModal() {
  const el = document.getElementById('pin-modal');
  if (!state.pinOpen) {
    el.hidden = true;
    return;
  }
  el.hidden = false;
  document.getElementById('pin-dots').innerHTML = [0, 1, 2, 3].map(i =>
    `<span class="pin-dot ${i < state.pinInput.length ? '-filled' : ''}"></span>`
  ).join('');
}

/* ---------- Input wiring ---------- */

function wireInputs() {
  document.querySelectorAll('[data-input]').forEach(input => {
    input.addEventListener('input', e => {
      const key = e.target.getAttribute('data-input');
      if (key === 'bonus-text') state.bonusText = e.target.value;
      if (key === 'nm-text')    state.nmText    = e.target.value;
      if (key === 'nr-text')    state.nrText    = e.target.value;
      if (key === 'talk-text')  state.talkText  = e.target.value;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const key = e.target.getAttribute('data-input');
        if (key === 'bonus-text') giveBonus();
        if (key === 'nm-text')    addMission();
        if (key === 'nr-text')    addReward();
        if (key === 'talk-text')  addPost();
      }
    });
  });
}

/* ---------- Top-level render ---------- */

function render() {
  renderHeader();
  renderTabs();
  renderMain();
  renderToast();
  renderCelebration();
  renderSettings();
  renderPinModal();
}

/* ============================================================
   Event delegation
   ============================================================ */

document.addEventListener('click', e => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.getAttribute('data-action');

  switch (action) {
    case 'switch-user': {
      const uid = target.getAttribute('data-id');
      if (uid === 'parent' && state.me !== 'parent') {
        openPinModal();
      } else {
        switchUser(uid);
      }
      return;
    }
    case 'pin-digit':
      pressPinDigit(target.getAttribute('data-digit'));
      return;
    case 'pin-back':
      state.pinInput = state.pinInput.slice(0, -1);
      renderPinModal();
      return;
    case 'close-pin':
      closePinModal();
      return;
    case 'switch-tab':
      switchTab(target.getAttribute('data-tab'));
      return;
    case 'open-settings':
      openSettings();
      return;
    case 'close-settings':
      closeSettings();
      return;
    case 'save-names':
      saveSettings();
      return;
    case 'reset-names':
      resetNames();
      return;
    case 'request-done':
      requestDone(Number(target.getAttribute('data-id')));
      return;
    case 'approve-mission':
      approveMission(Number(target.getAttribute('data-id')));
      return;
    case 'reject-mission':
      rejectMission(Number(target.getAttribute('data-id')));
      return;
    case 'give-bonus':
      giveBonus();
      return;
    case 'set-bonus-kid':
      state.bonusKid = target.getAttribute('data-kid');
      render();
      return;
    case 'set-nm-kid':
      state.nmKid = target.getAttribute('data-kid');
      render();
      return;
    case 'set-nm-repeat':
      state.nmRepeat = target.getAttribute('data-repeat') === 'true';
      render();
      return;
    case 'set-nm-stars':
      state.nmStars = Number(target.getAttribute('data-stars'));
      render();
      return;
    case 'add-mission':
      addMission();
      return;
    case 'delete-mission':
      if (confirm('이 약속을 삭제할까요?')) {
        deleteMission(Number(target.getAttribute('data-id')));
      }
      return;
    case 'add-reward':
      addReward();
      return;
    case 'reward-inc':
      changeRewardPrice(Number(target.getAttribute('data-id')), 1);
      return;
    case 'reward-dec':
      changeRewardPrice(Number(target.getAttribute('data-id')), -1);
      return;
    case 'reward-remove':
      removeReward(Number(target.getAttribute('data-id')));
      return;
    case 'nr-price-inc':
      state.nrPrice = state.nrPrice + 5;
      render();
      return;
    case 'nr-price-dec':
      state.nrPrice = Math.max(1, state.nrPrice - 5);
      render();
      return;
    case 'set-nr-emoji':
      state.nrEmoji = target.getAttribute('data-emoji');
      render();
      return;
    case 'buy':
      buyReward(Number(target.getAttribute('data-id')));
      return;
    case 'add-post':
      addPost();
      return;
    case 'delete-post':
      if (confirm('이 글을 삭제할까요?')) {
        deletePost(Number(target.getAttribute('data-id')));
      }
      return;
    case 'toggle-heart':
      togglePostHeart(Number(target.getAttribute('data-id')));
      return;
  }
});

document.getElementById('celebration').addEventListener('click', closeCelebration);

document.getElementById('settings-body').addEventListener('input', e => {
  const t = e.target;
  if (!t.hasAttribute('data-settings-id')) return;
  const id = t.getAttribute('data-settings-id');
  state.settingsDraft = { ...state.settingsDraft, [id]: t.value };
});

/* ============================================================
   Boot
   ============================================================ */

render();
initCloud();
