/* ============================================================
   우리집 칭찬가게 — app.js
   All state, rendering, event handling in one file.
   ============================================================ */

'use strict';

/* ---------- Constants ---------- */

const STORAGE_KEY = 'praise-app-v1';

/* ---------- 클라우드 동기화 (Firebase Realtime Database) ----------
   가족 모두가 같은 가족방(FAMILY_KEY)의 데이터를 실시간으로 공유한다.
   인터넷이 없거나 Firebase 로드 실패 시 로컬 전용 모드로 동작.

   가족방 키는 기기의 localStorage에 저장된다. 키가 없으면 온보딩
   화면에서 "새 가족방 만들기" 또는 "초대 코드로 들어가기"를 거친다.
   초대 코드 = 가족방 키. 코드를 아는 사람만 그 방에 접근할 수 있다. */
const CLOUD_DATABASE_URL = 'https://homepraiseapp-default-rtdb.asia-southeast1.firebasedatabase.app';
const SHARED_KEYS = ['userNames', 'missions', 'rewards', 'log', 'balance', 'pin', 'posts', 'kidsEnabled'];

const FAMILY_KEY_STORAGE = 'praise-app-family-key';

let FAMILY_KEY = (function () {
  try {
    return localStorage.getItem(FAMILY_KEY_STORAGE) || null;
  } catch (e) { /* localStorage 불가 → 온보딩으로 */ }
  return null;
})();

// 헷갈리는 글자(0/O, 1/I/L) 제외
const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function makeRoomCode() {
  let code = '';
  for (let i = 0; i < 8; i++) {
    if (i === 4) code += '-';
    code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
  }
  return code;
}

function normalizeRoomCode(raw) {
  let s = String(raw || '').trim().replace(/\s+/g, '');
  if (s.indexOf('fam_') !== 0) s = s.toUpperCase(); // 구버전 코드는 소문자 유지
  s = s.replace(/[^A-Za-z0-9_-]/g, '');
  // 하이픈 없이 8자를 입력해도 ABCD-2345 형태로 맞춰준다
  if (/^[A-Z2-9]{8}$/.test(s)) s = s.slice(0, 4) + '-' + s.slice(4);
  return s;
}

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
  first: '첫째',
  second: '둘째',
  third: '셋째',
  fourth: '넷째',
  fifth: '다섯째',
};

const KIDS = ['first', 'second', 'third', 'fourth', 'fifth'];

// 아이별 테마색 (styles.css의 .-first ~ .-fifth 변수와 짝을 이룸)
const KID_COLORS = {
  first:  { main: '#7048E8', deep: '#5F3DC4', bg: '#F3F0FF' },
  second: { main: '#F76707', deep: '#E8590C', bg: '#FFF4E6' },
  third:  { main: '#0CA678', deep: '#099268', bg: '#E6FCF5' },
  fourth: { main: '#E64980', deep: '#D6336C', bg: '#FFF0F6' },
  fifth:  { main: '#1C7ED6', deep: '#1971C2', bg: '#E7F5FF' },
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
  { key: 'mission', label: '약속',     icon: '📝' },
  { key: 'rewards', label: '보상설정', icon: '🎁' },
  { key: 'log',     label: '기록',     icon: '📋' },
];

// 온보딩에서 눌러 담는 추천 약속/보상
const STARTER_MISSIONS = [
  '🪥 양치 스스로 하기', '📚 숙제 다 하기', '🧸 장난감 정리하기',
  '📖 책 20분 읽기', '🛏️ 이불 정리하기', '🥦 반찬 골고루 먹기',
];
const STARTER_REWARDS = [
  { emoji: '🍦', text: '아이스크림', price: 10 },
  { emoji: '📺', text: '만화 30분 더 보기', price: 15 },
  { emoji: '🎮', text: '게임 30분', price: 20 },
  { emoji: '🎡', text: '주말 나들이', price: 50 },
];

const KID_TABS = [
  { key: 'mission', label: '약속',    icon: '💪' },
  { key: 'board',   label: '내 쿠키', icon: '🍪' },
];

/* ---------- Utilities ---------- */

function todayKey() {
  // 기기의 현지 날짜 기준 — 자정(00:00)이 지나면 새로운 하루
  return dayKeyFromMs(Date.now());
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

function seedState() {
  // 새 가족은 빈 상태로 시작 — 부모님 홈의 "시작 미션 🚀"이 첫 사용을 안내한다
  return {
    me: 'parent', // 처음은 부모님 화면부터 — 부모님이 아이에게 소개해주는 흐름
    tab: 'board',
    userNames: { ...DEFAULT_NAMES },
    missions: [],
    rewards: [],
    log: [],
    posts: [],
    kidsEnabled: ['first'],
    balance: { first: 0, second: 0 },
    pin: '0000',
    bonusKid: 'first', bonusText: '', talkText: '',
    nmKid: 'first', nmText: '', nmStars: 1, nmRepeat: true,
    nrEmoji: '🍩', nrText: '', nrPrice: 10,
  };
}

/* ---------- State & persistence ---------- */

const PERSIST_KEYS = ['me', 'tab', 'userNames', 'missions', 'rewards', 'log', 'balance', 'pin', 'posts', 'kidsEnabled'];

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
state.onboardMode = 'choose';
state.onboardInput = '';
state.onboardBusy = false;
state.onboardSetup = false;
state.onboardKidName = '';
state.onboardPin = '';
state.onboardCode = '';
state.onboardPickM = [0, 1, 2];
state.onboardPickR = [0, 1];

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
    // kidsEnabled 정리: 항상 첫째 포함, KIDS에 있는 값만
    if (!Array.isArray(merged.kidsEnabled) || merged.kidsEnabled.indexOf('first') < 0) {
      merged.kidsEnabled = ['first'];
    }
    merged.kidsEnabled = merged.kidsEnabled.filter(k => KIDS.indexOf(k) >= 0);
    // 현재 사용자가 비활성 아이면 첫째로 전환
    if (merged.me !== 'parent' && merged.kidsEnabled.indexOf(merged.me) < 0) {
      merged.me = 'first';
    }
    merged.missions = merged.missions.map(m =>
      (m.by === 'dad' || m.by === 'mom') ? { ...m, by: 'parent' } : m);
    merged.rewards = merged.rewards.map(r =>
      (r.by === 'dad' || r.by === 'mom') ? { ...r, by: 'parent' } : r);
    if (merged.userNames && merged.userNames.parent === undefined) {
      merged.userNames = {
        parent: '부모님',
        first: merged.userNames.first || '이레',
        second: merged.userNames.second || DEFAULT_NAMES.second,
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

/* ---------- 클라우드 읽기/쓰기 ----------
   충돌 방지를 위해 영역(SHARED_KEYS)별로 나눠 저장한다.
   기기 A가 기록을 쓰는 동시에 기기 B가 게시판을 써도
   서로 다른 영역이면 둘 다 살아남는다. 변경된 영역만 전송. */

let cloudRef = null;       // families/<KEY>/fields
let cloudInited = false;
let lastSyncedJson = {};   // 영역별 마지막 동기화 JSON (변경 감지 + 메아리 방지)

function ensureFirebaseApp() {
  if (typeof firebase === 'undefined' || !CLOUD_DATABASE_URL) return false;
  if (!cloudInited) {
    firebase.initializeApp({ databaseURL: CLOUD_DATABASE_URL });
    cloudInited = true;
  }
  return true;
}

// 원격 필드들을 state에 반영. 화면 갱신이 필요하면 true.
function applyRemoteFields(remote) {
  let changed = false;
  for (const k of SHARED_KEYS) {
    const node = remote && remote[k];
    if (!node || typeof node.data !== 'string') continue;
    if (node.by === DEVICE_ID) { lastSyncedJson[k] = node.data; continue; } // 내 쓰기의 메아리
    if (node.data === lastSyncedJson[k]) continue; // 이미 반영된 값
    try {
      const val = JSON.parse(node.data);
      if (JSON.stringify(state[k]) !== node.data) {
        state[k] = val;
        changed = true;
      }
      lastSyncedJson[k] = node.data;
    } catch (e) { /* 손상된 필드는 무시 */ }
  }
  return changed;
}

function initCloud() {
  if (!FAMILY_KEY) return; // 아직 가족방이 없음 → 온보딩에서 연결
  try {
    if (!ensureFirebaseApp()) return; // 로컬 전용 모드
    if (cloudRef) cloudRef.off();
    const db = firebase.database();
    const key = FAMILY_KEY;
    cloudRef = db.ref('families/' + key + '/fields');
    lastSyncedJson = {};

    // 0) 방이 닫혔는지(초대 코드가 바뀌었는지) 먼저 확인
    db.ref('families/' + key + '/closed').once('value')
      .then(snap => snap.val() === true)
      .catch(() => false)
      .then(isClosed => {
        if (isClosed) { leaveClosedRoom(); return; }
        if (FAMILY_KEY !== key) return; // 확인하는 사이 방이 바뀜

        return cloudRef.once('value')
          .then(snap => {
            if (snap.exists()) {
              // 새 형식 데이터 존재 → 먼저 반영 (내 오래된 로컬로 덮어쓰지 않도록)
              if (applyRemoteFields(snap.val())) {
                applyDailyReset(state);
                saveLocal();
                render();
              }
              return;
            }
            // 새 형식 없음 → 구 형식(state 한 덩어리)에서 한 번 이전
            return db.ref('families/' + key + '/state').once('value').then(old => {
              const remote = old.val();
              if (!remote || !remote.data) return;
              try {
                const shared = JSON.parse(remote.data);
                for (const k of SHARED_KEYS) {
                  if (shared[k] !== undefined) state[k] = shared[k];
                }
                applyDailyReset(state);
                saveLocal();
                render();
              } catch (e) {}
            });
          })
          .catch(() => {})
          .then(() => {
            if (FAMILY_KEY !== key) return;
            cloudSave(); // 로컬 상태를 영역별로 업로드 (변경분만 — 이전/첫 업로드 포함)
            cloudRef.on('value', snap => {
              if (applyRemoteFields(snap.val())) {
                applyDailyReset(state);
                saveLocal();
                render();
                notifyNewPraise();
                notifyNewPending();
              }
            });
          });
      });
  } catch (e) { /* 연결 실패 → 로컬 전용 모드로 계속 */ }
}

function cloudSave() {
  if (!cloudRef) return;
  const updates = {};
  const now = Date.now();
  for (const k of SHARED_KEYS) {
    // 배열/객체를 JSON 문자열로 저장 (RTDB의 빈 배열 삭제 특성 회피)
    const json = JSON.stringify(state[k]);
    if (json === lastSyncedJson[k]) continue; // 안 바뀐 영역은 보내지 않음
    lastSyncedJson[k] = json;
    updates[k] = { by: DEVICE_ID, updatedAt: now, data: json };
  }
  if (Object.keys(updates).length === 0) return;
  cloudRef.update(updates).catch(() => {});
  // 아직 새 버전으로 갱신 안 된 옛 기기들도 볼 수 있게 구 형식도 함께 기록 (읽기 전용 호환)
  try {
    const shared = {};
    for (const k of SHARED_KEYS) shared[k] = state[k];
    firebase.database().ref('families/' + FAMILY_KEY + '/state').set({
      by: DEVICE_ID,
      updatedAt: now,
      data: JSON.stringify(shared),
    }).catch(() => {});
  } catch (e) {}
}

/* ---------- 기기 알림 (시스템 알림) ----------
   설정에서 켜면, 화면을 안 보고 있을 때 폰 알림으로 알려준다.
   - 부모 기기: 아이가 "했어요!"를 눌렀을 때
   - 아이 기기: 칭찬 쿠키가 도착했을 때 */

const NOTIFY_PREF_KEY = 'praise-app-notify';

let notifyPref = (function () {
  try { return localStorage.getItem(NOTIFY_PREF_KEY) === 'on'; } catch (e) { return false; }
})();

function notificationsSupported() {
  return typeof Notification !== 'undefined';
}

function notificationsOn() {
  return notifyPref && notificationsSupported() && Notification.permission === 'granted';
}

function toggleNotifications() {
  if (!notificationsSupported()) {
    showToast('이 브라우저는 알림을 지원하지 않아요 (홈 화면 앱으로 열어보세요)');
    return;
  }
  if (notifyPref) {
    notifyPref = false;
    try { localStorage.setItem(NOTIFY_PREF_KEY, 'off'); } catch (e) {}
    showToast('이 기기의 알림을 껐어요');
    render();
    return;
  }
  Notification.requestPermission().then(p => {
    if (p === 'granted') {
      notifyPref = true;
      try { localStorage.setItem(NOTIFY_PREF_KEY, 'on'); } catch (e) {}
      showToast('알림을 켰어요 🔔');
    } else {
      showToast('브라우저 설정에서 알림 권한을 허용해주세요');
    }
    render();
  });
}

function showSystemNotification(title, body) {
  if (!notificationsOn()) return;
  if (!document.hidden) return; // 화면을 보고 있으면 인앱 표시로 충분
  const opts = { body: body, icon: 'icons/icon-192.png', badge: 'icons/icon-192.png', tag: 'praise-app' };
  if (navigator.serviceWorker && navigator.serviceWorker.getRegistration) {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (reg && reg.showNotification) reg.showNotification(title, opts);
      else { try { new Notification(title, opts); } catch (e) {} }
    }).catch(() => {});
  } else {
    try { new Notification(title, opts); } catch (e) {}
  }
}

/* ---------- 칭찬 도착 알림 ----------
   부모가 다른 기기에서 쿠키를 주면, 아이 기기에 실시간으로
   축하 화면이 뜬다. 이 기기에서 마지막으로 본 시각 이후의
   새 칭찬만 알린다. */

let lastPraiseSeenMs = Date.now();

function notifyNewPraise() {
  const kid = myKidId();
  if (!kid) return;
  const fresh = state.log.filter(l =>
    l.kid === kid && l.delta > 0 && (l.atMs || 0) > lastPraiseSeenMs);
  if (fresh.length === 0) return;
  lastPraiseSeenMs = Math.max(...fresh.map(l => l.atMs || 0));
  const latest = fresh.slice().sort((a, b) => (b.atMs || 0) - (a.atMs || 0))[0];
  const total = fresh.reduce((sum, l) => sum + l.delta, 0);
  const nonce = Date.now();
  state.award = { kid: kid, count: total, nonce: nonce };
  celebrate('💖', '엄마아빠의 칭찬이 도착했어요!', latest.text + ' · 쿠키 ' + total + '개 🍪');
  showSystemNotification('엄마아빠의 칭찬이 도착했어요! 💖', latest.text + ' · 쿠키 ' + total + '개 🍪');
  setTimeout(() => {
    if (state.award && state.award.nonce === nonce) {
      state.award = null;
      render();
    }
  }, 1800);
}

/* ---------- "했어요!" 도착 알림 (부모 기기) ---------- */

let knownPendingIds = new Set();

function rememberCurrentPending() {
  knownPendingIds = new Set(
    state.missions.filter(m => m.state === 'pending').map(m => m.id));
}

function notifyNewPending() {
  if (!meIsParent()) {
    rememberCurrentPending();
    return;
  }
  const kids = activeKids();
  const fresh = state.missions.filter(m =>
    m.state === 'pending' && kids.indexOf(m.kid) >= 0 && !knownPendingIds.has(m.id));
  rememberCurrentPending();
  if (fresh.length === 0) return;
  const first = fresh[0];
  const more = fresh.length > 1 ? ' 외 ' + (fresh.length - 1) + '개' : '';
  showSystemNotification(
    nameOf(first.kid) + ': 했어요! 🙌',
    first.text + more + ' — 확인하고 쿠키를 주세요 🍪');
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
function kidThemeCls(kidId) { return '-' + kidId; }
function activeKids()       { return KIDS.filter(k => (state.kidsEnabled || ['first']).indexOf(k) >= 0); }

/* ============================================================
   Actions
   ============================================================ */

function switchUser(id) {
  state.me = id;
  state.tab = 'mission'; // 부모·아이 모두 약속 탭부터
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

// 아이가 "했어요!"를 누른 순간의 응원 — 누를 때마다 다른 문구
const KID_DONE_CHEERS = [
  { emoji: '💪', text: '우와, 해냈구나!' },
  { emoji: '🌟', text: '반짝반짝 멋져요!' },
  { emoji: '🎉', text: '정말 잘했어요!' },
  { emoji: '🦄', text: '와, 최고예요!' },
  { emoji: '🏆', text: '약속 지킴 챔피언!' },
];

function requestDone(missionId) {
  const m = state.missions.find(x => x.id === missionId);
  if (!m) return;
  m.state = 'pending';
  saveState();
  const cheer = KID_DONE_CHEERS[Math.floor(Math.random() * KID_DONE_CHEERS.length)];
  celebrate(cheer.emoji, cheer.text, '엄마아빠한테 확인을 부탁했어요 🙌');
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
  showToast('쿠키마켓에 새 보상이 올라왔어요 🎁');
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

/* ---------- 가족방 온보딩 ---------- */

function adoptFamilyKey(code) {
  FAMILY_KEY = code;
  try { localStorage.setItem(FAMILY_KEY_STORAGE, code); } catch (e) {}
  saveLocal();
  initCloud();
  render();
}

function createFamilyRoom() {
  state.onboardSetup = true;
  state.onboardMode = 'setup-name';
  state.onboardKidName = '';
  state.onboardPin = '';
  state.onboardPickM = [0, 1, 2];
  state.onboardPickR = [0, 1];
  state.onboardCode = makeRoomCode(); // 코드만 미리 만들어두고,
  render();                           // 방(DB)은 마법사를 끝냈을 때 생성한다
}

/* ----- 첫 설정 마법사 (새 가족방을 만들기 전 설정) -----
   마법사 도중에는 아무것도 저장하지 않는다. 중간에 나가면
   기기에도 DB에도 흔적이 남지 않고, "시작하기!"를 눌러야 방이 생긴다. */

function setupSaveName() {
  const name = (state.onboardKidName || '').trim();
  if (name) state.userNames.first = name;
  state.onboardMode = 'setup-pin';
  render();
}

function setupSavePin() {
  const pin = (state.onboardPin || '').trim();
  if (pin && !/^\d{4}$/.test(pin)) {
    showToast('비밀번호는 숫자 4자리로 해주세요');
    return;
  }
  if (pin) state.pin = pin;
  state.onboardMode = 'setup-picks';
  render();
}

function setupApplyPicks() {
  // 고른 추천 약속/보상을 첫째 앞으로 담아준다
  const today = todayKey();
  state.missions = state.onboardPickM.map((i, idx) => ({
    id: newId() + idx, kid: 'first', text: STARTER_MISSIONS[i],
    state: 'todo', by: 'parent', stars: 1, repeat: true, lastReset: today,
  }));
  state.rewards = state.onboardPickR.map((i, idx) => {
    const r = STARTER_REWARDS[i];
    return { id: newId() + 100 + idx, emoji: r.emoji, text: r.text, price: r.price, by: 'parent' };
  });
  state.onboardMode = 'setup-guide';
  render();
}

function finishSetup() {
  state.onboardSetup = false;
  state.onboardMode = 'choose';
  state.me = 'parent'; // 설정한 사람은 부모님 — 약속 탭의 "시작 미션"으로 안내
  state.tab = 'mission';
  adoptFamilyKey(state.onboardCode); // 이제서야 방 생성 + 업로드
  celebrate('🎉', '우리 가족방 완성!', nameOf('first') + '(이)랑 같이 시작해보세요');
}

function inOnboarding() {
  return !FAMILY_KEY || state.onboardSetup;
}

/* 초대 코드 변경: 새 방으로 데이터를 옮기고 옛 방은 닫는다.
   코드가 유출됐을 때 잠그는 용도. 다른 가족 기기는
   옛 방이 닫힌 것을 감지하면 새 코드 입력 화면으로 안내된다. */
function rotateFamilyCode() {
  const oldKey = FAMILY_KEY;
  const newCode = makeRoomCode();
  adoptFamilyKey(newCode); // 새 방 연결 → 이 기기의 데이터가 전부 업로드됨
  try {
    if (ensureFirebaseApp()) {
      const db = firebase.database();
      const clear = {};
      for (const k of SHARED_KEYS) clear[k] = null;
      db.ref('families/' + oldKey + '/fields').update(clear).catch(() => {});
      db.ref('families/' + oldKey + '/state').remove().catch(() => {});
      db.ref('families/' + oldKey + '/closed').set(true).catch(() => {});
    }
  } catch (e) {}
  render();
  celebrate('🔑', '새 초대 코드가 생겼어요!', '가족 기기들은 새 코드로 다시 들어와주세요');
}

/* 이 기기 초기화: 저장된 가족방 연결과 데이터를 지우고 온보딩부터 다시.
   이 기기만 초기화되며, 가족방(DB)의 데이터는 건드리지 않는다. */
function resetThisDevice() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(FAMILY_KEY_STORAGE);
    localStorage.removeItem(NOTIFY_PREF_KEY);
  } catch (e) {}
  location.reload();
}

// 방이 닫혔음(코드 변경됨)을 감지했을 때: 새 코드 입력 화면으로
function leaveClosedRoom() {
  try { localStorage.removeItem(FAMILY_KEY_STORAGE); } catch (e) {}
  FAMILY_KEY = null;
  if (cloudRef) { cloudRef.off(); cloudRef = null; }
  state.onboardMode = 'join';
  render();
  showToast('가족방 초대 코드가 바뀌었어요. 새 코드로 들어와주세요 🔑');
}

function joinFamilyRoom() {
  const code = normalizeRoomCode(state.onboardInput);
  if (!code) { showToast('초대 코드를 입력해주세요'); return; }
  if (!ensureFirebaseApp()) { showToast('인터넷 연결을 확인해주세요'); return; }
  state.onboardBusy = true;
  render();
  const db = firebase.database();
  db.ref('families/' + code + '/fields').once('value')
    .then(snap => snap.exists()
      ? true
      : db.ref('families/' + code + '/state').once('value').then(s => s.exists()))
    .then(found => {
      state.onboardBusy = false;
      if (!found) {
        showToast('그 코드의 가족방을 찾지 못했어요 🤔');
        render();
        return;
      }
      state.me = 'parent'; // 새 기기도 부모님 화면부터 시작
      state.tab = 'mission';
      adoptFamilyKey(code); // 방 데이터는 클라우드 연결 시 곧바로 받아온다
      showToast('가족방에 들어왔어요! 🎉');
    })
    .catch(() => {
      state.onboardBusy = false;
      showToast('연결에 실패했어요. 잠시 후 다시 해주세요');
      render();
    });
}

/* ---------- 칭찬 기록 삭제 (부모만) ---------- */

function deleteLogEntry(id) {
  if (!meIsParent()) return;
  const l = state.log.find(x => x.id === id);
  if (!l) return;
  state.log = state.log.filter(x => x.id !== id);
  // 칭찬으로 지급된 쿠키는 함께 회수
  if (l.delta > 0 && l.kid) {
    state.balance[l.kid] = Math.max(0, (state.balance[l.kid] || 0) - l.delta);
  }
  saveState();
  render();
  showToast(l.delta > 0 ? '칭찬 기록을 지우고 쿠키 ' + l.delta + '개를 회수했어요' : '기록을 지웠어요');
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
  for (const id of ['parent', ...activeKids()]) {
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

/* ---------- 개발자에게 피드백 보내기 ----------
   Firebase의 feedback 노드로 전송된다. (개발자만 콘솔에서 열람) */
function sendFeedback() {
  const text = ((state.settingsDraft || {}).feedback || '').trim();
  if (!text) { showToast('내용을 적어주세요 ✏️'); return; }
  if (!ensureFirebaseApp()) { showToast('인터넷 연결을 확인해주세요'); return; }
  firebase.database().ref('feedback').push({
    text: text.slice(0, 2000),
    atMs: Date.now(),
    family: FAMILY_KEY || '',
  }).then(() => {
    state.settingsDraft = { ...state.settingsDraft, feedback: '' };
    render();
    showToast('전달했어요! 소중한 의견 고마워요 💛');
  }).catch(() => {
    showToast('전송에 실패했어요. 잠시 후 다시 해주세요');
  });
}

function removeKid(k) {
  if (k === 'first') return; // 첫째는 고정
  state.kidsEnabled = activeKids().filter(x => x !== k);
  if (state.me === k) { state.me = 'parent'; state.tab = 'board'; }
  saveState();
  render();
  showToast(nameOf(k) + ' 아이를 목록에서 뺐어요. 다시 추가하면 그대로 돌아와요');
}

function addNextKid() {
  const enabled = activeKids();
  const next = KIDS.find(k => enabled.indexOf(k) < 0);
  if (!next) return;
  state.kidsEnabled = enabled.concat([next]);
  if (!state.userNames[next]) state.userNames[next] = DEFAULT_NAMES[next];
  saveState();
  render();
  showToast(DEFAULT_NAMES[next] + ' 아이가 추가됐어요! 이름을 정해주세요 🧡');
}

/* ============================================================
   Rendering — build HTML strings, then set innerHTML
   ============================================================ */

function renderHeader() {
  const header = document.getElementById('app-header');
  if (inOnboarding()) {
    header.className = 'app-header -parent';
    header.innerHTML = `
      <div class="header-top">
        <div class="app-title">우리집 칭찬가게</div>
        <div class="header-icons"><span class="header-star" aria-hidden="true">⭐</span></div>
      </div>
    `;
    return;
  }
  const cls = meIsParent() ? '-parent' : kidThemeCls(state.me);
  header.className = 'app-header ' + cls;

  const chips = [...activeKids(), 'parent'].map(id => {
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
  if (inOnboarding()) {
    nav.innerHTML = '';
    return;
  }
  const isP = meIsParent();
  const tabs = isP ? PARENT_TABS : KID_TABS;
  const kc = KID_COLORS[state.me] || KID_COLORS.first;
  const accent = isP ? 'var(--navy)' : kc.main;
  const accentBg = kc.bg;
  nav.className = 'app-tabs' + (isP ? '' : ' -kid');
  nav.style.setProperty('--tab-accent', accent);
  nav.style.setProperty('--tab-accent-bg', accentBg);
  nav.innerHTML = tabs.map(t => `
    <button class="tab ${state.tab === t.key ? '-active' : ''}" data-action="switch-tab" data-tab="${t.key}">
      <span class="tab-icon">${t.icon}</span>
      <span class="tab-label">${t.label}</span>
    </button>
  `).join('');
}

function renderMain() {
  const main = document.getElementById('app-main');
  if (inOnboarding()) {
    main.className = 'app-main';
    main.innerHTML = renderOnboarding();
    wireInputs();
    return;
  }
  let cls = 'app-main';
  if (!meIsParent()) cls += ' -kid ' + kidThemeCls(state.me);
  main.className = cls;

  const isP = meIsParent();
  let html = '';
  if (!isP) {
    if (state.tab === 'shop' || state.tab === 'talk') state.tab = 'board'; // 통합된 구버전 탭
    if (state.tab === 'board')   html = renderKidBoard();
    if (state.tab === 'mission') html = renderKidMission();
  } else {
    if (state.tab === 'board' || state.tab === 'talk') state.tab = 'mission'; // 홈·게시판 → 약속으로 통합
    if (state.tab === 'mission') html = renderParentMission();
    if (state.tab === 'rewards') html = renderParentRewards();
    if (state.tab === 'log')     html = renderParentLog();
  }
  main.innerHTML = html;

  // 화면(사용자/탭)이 바뀔 때만 부드러운 등장 애니메이션
  const viewKey = state.me + '/' + state.tab;
  if (renderMain._lastView !== viewKey) {
    renderMain._lastView = viewKey;
    main.classList.remove('-enter');
    void main.offsetWidth;
    main.classList.add('-enter');
  }

  // Wire up controlled inputs (post-render because innerHTML resets values)
  wireInputs();
}

/* ---------- 가족방 온보딩 화면 ---------- */

function renderOnboarding() {
  if (state.onboardMode === 'setup-name') {
    return `
      <div class="onboard">
        <div class="onboard-steps">1 / 4</div>
        <div class="onboard-emoji">🧒</div>
        <div class="onboard-title">아이 이름 정하기</div>
        <div class="onboard-sub">앱에서 부를 이름이에요. 애칭도 좋아요!</div>
        <input class="onboard-input" id="input-onboard-kid" placeholder="예: 이레"
          autocomplete="off" value="${escapeHtml(state.onboardKidName || '')}" data-input="onboard-kid-name"/>
        <button class="onboard-btn -primary" data-action="setup-name-next">다음 →</button>
        <div class="onboard-note">둘째는 나중에 설정 ⚙️에서 추가할 수 있어요</div>
      </div>
    `;
  }
  if (state.onboardMode === 'setup-pin') {
    return `
      <div class="onboard">
        <div class="onboard-steps">2 / 4</div>
        <div class="onboard-emoji">🔒</div>
        <div class="onboard-title">부모님 비밀번호</div>
        <div class="onboard-sub">부모님 화면(쿠키 주기·보상 관리)을 잠그는<br>숫자 4자리예요</div>
        <input class="onboard-input" id="input-onboard-pin" placeholder="숫자 4자리"
          inputmode="numeric" maxlength="4" autocomplete="off"
          value="${escapeHtml(state.onboardPin || '')}" data-input="onboard-pin"/>
        <button class="onboard-btn -primary" data-action="setup-pin-next">다음 →</button>
        <div class="onboard-note">건너뛰면 기본값 0000이에요. 나중에 설정에서 바꿀 수 있어요</div>
      </div>
    `;
  }
  if (state.onboardMode === 'setup-picks') {
    const kidName = (state.onboardKidName || '').trim() || DEFAULT_NAMES.first;
    const mChips = STARTER_MISSIONS.map((t, i) => {
      const on = state.onboardPickM.indexOf(i) >= 0;
      return `<button class="pick-chip ${on ? '-on' : ''}" data-action="pick-mission" data-i="${i}">${on ? '✅ ' : ''}${escapeHtml(t)}</button>`;
    }).join('');
    const rChips = STARTER_REWARDS.map((r, i) => {
      const on = state.onboardPickR.indexOf(i) >= 0;
      return `<button class="pick-chip ${on ? '-on' : ''}" data-action="pick-reward" data-i="${i}">${on ? '✅ ' : ''}${r.emoji} ${escapeHtml(r.text)} · 🍪${r.price}</button>`;
    }).join('');
    return `
      <div class="onboard">
        <div class="onboard-steps">3 / 4</div>
        <div class="onboard-emoji">🛒</div>
        <div class="onboard-title">눌러서 담아보세요</div>
        <div class="onboard-sub">${escapeHtml(kidName)}의 첫 약속과 보상이에요.<br>나중에 얼마든지 바꿀 수 있어요</div>
        <div class="pick-group-label">매일 약속 💪</div>
        <div class="pick-grid">${mChips}</div>
        <div class="pick-group-label">쿠키마켓 보상 🎁</div>
        <div class="pick-grid">${rChips}</div>
        <button class="onboard-btn -primary" data-action="setup-picks-next">다음 →</button>
      </div>
    `;
  }
  if (state.onboardMode === 'setup-guide') {
    return `
      <div class="onboard">
        <div class="onboard-steps">4 / 4</div>
        <div class="onboard-emoji">📖</div>
        <div class="onboard-title">이렇게 써요</div>
        <div class="onboard-guide">
          <div class="onboard-guide-row"><span class="onboard-guide-num">1</span> 부모님이 약속을 보내요 📨</div>
          <div class="onboard-guide-row"><span class="onboard-guide-num">2</span> ${escapeHtml(nameOf('first'))}가 지키고 "했어요!" 💪</div>
          <div class="onboard-guide-row"><span class="onboard-guide-num">3</span> 확인하면 쿠키 지급! 🍪</div>
          <div class="onboard-guide-row"><span class="onboard-guide-num">4</span> 모은 쿠키로 쿠키마켓에서 보상 교환 🎁</div>
        </div>
        <div class="onboard-sub" style="margin:14px 0 4px">가족 폰·태블릿에서는 이 코드로 들어오세요</div>
        <div class="family-code">${escapeHtml(state.onboardCode || FAMILY_KEY || '')}</div>
        <button class="onboard-btn -primary" data-action="setup-finish">시작하기! 🍪</button>
        <div class="onboard-note">초대 코드는 설정 ⚙️에서 언제든 다시 볼 수 있어요</div>
      </div>
    `;
  }
  if (state.onboardMode === 'join') {
    return `
      <div class="onboard">
        <div class="onboard-emoji">🔑</div>
        <div class="onboard-title">초대 코드로 들어가기</div>
        <div class="onboard-sub">가족이 알려준 초대 코드를 입력해주세요</div>
        <input class="onboard-input" id="input-onboard-code" placeholder="예: ABCD-2345"
          autocapitalize="characters" autocomplete="off" spellcheck="false"
          value="${escapeHtml(state.onboardInput || '')}" data-input="onboard-code"/>
        <button class="onboard-btn -primary" data-action="onboard-join" ${state.onboardBusy ? 'disabled' : ''}>
          ${state.onboardBusy ? '연결 중…' : '가족방 들어가기'}
        </button>
        <button class="onboard-btn -ghost" data-action="onboard-back">← 뒤로</button>
      </div>
    `;
  }
  return `
    <div class="onboard">
      <div class="onboard-emoji">🍪</div>
      <div class="onboard-title">우리집 칭찬가게에 어서오세요!</div>
      <div class="onboard-sub">약속을 지키면 쿠키를 모으고,<br>모은 쿠키로 보상을 바꾸는 가족 앱이에요</div>
      <button class="onboard-btn -primary" data-action="onboard-create">🏠 새 가족방 만들기</button>
      <button class="onboard-btn -secondary" data-action="onboard-join-mode">🔑 초대 코드로 들어가기</button>
      <div class="onboard-note">가족방을 만들면 초대 코드가 생겨요.<br>가족 기기에서 그 코드로 들어오면 실시간으로 함께 쓸 수 있어요.</div>
      <a class="onboard-privacy" href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>
    </div>
  `;
}

/* ---------- Kid: Board ---------- */

function renderKidBoard() {
  const kid = myKidId();
  const themeCls = kidThemeCls(kid);
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

  const kc = KID_COLORS[kid] || KID_COLORS.first;
  const themeColor = kc.main;
  const themeDeep  = kc.deep;
  const themeBg    = kc.bg;

  // 쿠키통 표정 — 채울수록 행복해진다 (0: 쿨쿨 → 미소 → 신남 → 목표 달성: 반짝)
  const ratio = state.rewards.length > 0 && !nextReward
    ? 1
    : Math.min(1, goal > 0 ? count / goal : 0);
  const faceSvg = jarFaceSvg(ratio, themeDeep);

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

  let nextLine;
  if (nextReward) {
    nextLine = `<div class="board-next">${nextReward.emoji} ${escapeHtml(nextReward.text)}까지 ${nextReward.price - count}개!</div>`;
  } else if (state.rewards.length === 0) {
    nextLine = '<div class="board-next">엄마아빠가 곧 보상을 준비할 거예요 🎁</div>';
  } else {
    nextLine = '<div class="board-next">모든 보상을 살 수 있어요! 🎉</div>';
  }

  // 쿠키마켓 — 모은 쿠키를 바로 꺼내서 보상으로 바꾸는 곳
  const shopCards = state.rewards.map(r => {
    const can = count >= r.price;
    const btnCls = can ? 'btn-buy -can' : 'btn-buy -no';
    const btnLabel = can ? '꺼내 바꾸기!' : (r.price - count) + '개 더';
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
  const shopBlock = `
    <div class="shop-section-head">
      <span class="sub-head" style="margin:0">쿠키마켓 🎁</span>
      <span class="shop-owner">${escapeHtml(nameOf('parent'))}네 가게</span>
    </div>
    <div class="shop-list">
      ${shopCards || `<div class="empty-box">아직 준비된 보상이 없어요.<br>엄마아빠가 곧 채워줄 거예요!</div>`}
    </div>
  `;

  return `
    <div class="board-head ${themeCls}">
      <div class="board-name">${escapeHtml(nameOf(kid))}의 쿠키</div>
      <div class="board-count">${count}</div>
      <div class="jar" data-action="poke-jar">
        ${jarSvg}
        <div class="jar-slots" style="--rows:${rows}">${slots.join('')}</div>
        ${faceSvg}
      </div>
      ${count > 0 ? '<div class="jar-hint">쿠키통을 콕 눌러봐! 👆</div>' : ''}
      ${nextLine}
    </div>
    ${shopBlock}
  `;
}

/* 쿠키통 표정 (유리에 그려진 마스코트 얼굴) */
function jarFaceSvg(ratio, deep) {
  const ink = '#3A1E10';
  let eyes, mouth, extra = '';
  if (ratio >= 1) {
    // 목표 달성 — 반짝이 눈 + 함박웃음
    const star = (cx, cy) => `<path d="M ${cx} ${cy - 11} C ${cx + 2} ${cy - 3}, ${cx + 3} ${cy - 2}, ${cx + 11} ${cy}
      C ${cx + 3} ${cy + 2}, ${cx + 2} ${cy + 3}, ${cx} ${cy + 11}
      C ${cx - 2} ${cy + 3}, ${cx - 3} ${cy + 2}, ${cx - 11} ${cy}
      C ${cx - 3} ${cy - 2}, ${cx - 2} ${cy - 3}, ${cx} ${cy - 11} Z" fill="#FFD43B" stroke="#B08900" stroke-width="1.5"/>`;
    eyes = star(75, 114) + star(125, 114);
    mouth = `<path d="M 80 130 Q 100 158 120 130 Z" fill="${ink}"/>
             <ellipse cx="100" cy="142" rx="9" ry="5" fill="#FF8FA3"/>`;
  } else if (ratio >= 0.6) {
    // 거의 다 찼다 — 신난 눈웃음
    eyes = `<path d="M 66 118 Q 75 106 84 118" stroke="${ink}" stroke-width="5.5" stroke-linecap="round" fill="none"/>
            <path d="M 116 118 Q 125 106 134 118" stroke="${ink}" stroke-width="5.5" stroke-linecap="round" fill="none"/>`;
    mouth = `<path d="M 82 130 Q 100 152 118 130 Z" fill="${ink}"/>`;
  } else if (ratio > 0) {
    // 채우는 중 — 방긋
    eyes = `<circle cx="75" cy="114" r="5.5" fill="${ink}"/><circle cx="125" cy="114" r="5.5" fill="${ink}"/>
            <circle cx="77" cy="112" r="1.8" fill="#fff"/><circle cx="127" cy="112" r="1.8" fill="#fff"/>`;
    mouth = `<path d="M 84 132 Q 100 146 116 132" stroke="${ink}" stroke-width="6" stroke-linecap="round" fill="none"/>`;
  } else {
    // 텅 빔 — 쿨쿨
    eyes = `<path d="M 66 116 Q 75 121 84 116" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>
            <path d="M 116 116 Q 125 121 134 116" stroke="${ink}" stroke-width="5" stroke-linecap="round" fill="none"/>`;
    mouth = `<circle cx="100" cy="139" r="5" fill="none" stroke="${ink}" stroke-width="4"/>`;
    extra = `<text x="146" y="92" font-size="17" font-family="sans-serif" fill="${ink}" opacity="0.55">z</text>
             <text x="158" y="76" font-size="13" font-family="sans-serif" fill="${ink}" opacity="0.4">z</text>`;
  }
  return `
    <svg class="jar-face" viewBox="0 0 200 280" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      <ellipse cx="100" cy="124" rx="45" ry="37" fill="rgba(255,255,255,0.55)"/>
      ${eyes}
      ${mouth}
      <ellipse cx="63" cy="134" rx="9" ry="6" fill="${deep}" opacity="0.28"/>
      <ellipse cx="137" cy="134" rx="9" ry="6" fill="${deep}" opacity="0.28"/>
      ${extra}
    </svg>
  `;
}

/* ---------- Kid: Mission ---------- */

function renderKidMission() {
  const kid = myKidId();
  const themeCls = kidThemeCls(kid);
  const list = sortMissions(state.missions.filter(m => m.kid === kid));

  const cards = list.map(m => renderMissionCard(m, themeCls, true)).join('');

  // 엄마아빠의 칭찬 — 약속을 지키면 여기에 쌓인다
  const PRAISE_EMOJIS = ['💖', '🌟', '🏅', '🎉', '👏', '🌈'];
  const praises = state.log
    .filter(l => l.kid === kid && l.delta > 0)
    .sort((a, b) => (b.atMs || 0) - (a.atMs || 0))
    .slice(0, 5);
  const praiseRows = praises.map(l => `
    <div class="praise-row ${themeCls}">
      <span class="praise-emoji">${PRAISE_EMOJIS[(l.id || 0) % PRAISE_EMOJIS.length]}</span>
      <div class="praise-body">
        <div class="praise-text">${escapeHtml(l.text)}</div>
        <div class="praise-when">${l.atMs ? dayLabelFromKey(dayKeyFromMs(l.atMs)) : ''}</div>
      </div>
      <span class="praise-delta">🍪 +${l.delta}</span>
    </div>
  `).join('');
  const praiseBlock = praises.length ? `
    <div class="sub-head">엄마아빠의 칭찬 💖</div>
    <div class="praise-list">${praiseRows}</div>
  ` : '';

  return `
    <h2 class="screen-title">오늘의 약속 💪</h2>
    <div class="mission-list">
      ${cards || `<div class="empty-box">오늘은 약속이 없어요 ✨</div>`}
    </div>
    ${praiseBlock}
  `;
}

function renderMissionCard(m, themeCls, kidCanRequest) {
  const stars = m.stars || 1;
  const done = m.state === 'done';
  const pending = m.state === 'pending';
  const tokenGlyph = done ? '🌟' : pending ? '⏳' : '';
  let tokenCls = 'mission-token';
  if (done) tokenCls += ' -done';
  else if (pending) tokenCls += ' -pending';
  else tokenCls += ' -todo';

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


/* ---------- Parent: Home ---------- */

/* 시작 미션 — 새 가족이 하나씩 해보며 앱을 익히는 체크리스트.
   전부 완료하면 사라진다. */
function renderStarterChecklist() {
  const steps = [
    { done: state.missions.length > 0,
      icon: '📨', label: '약속 탭에서 ' + nameOf('first') + '에게 첫 약속 보내기' },
    { done: state.rewards.length > 0,
      icon: '🎁', label: '보상설정 탭에서 보상 하나 올리기 (예: 아이스크림)' },
    { done: state.missions.some(m => m.state !== 'todo') || state.log.length > 0,
      icon: '💪', label: '위 이름표에서 ' + nameOf('first') + ' 화면으로 바꿔, 아이와 함께 "했어요!" 눌러보기' },
  ];
  const doneCount = steps.filter(s => s.done).length;
  if (doneCount === steps.length) return '';
  const rows = steps.map(s => `
    <div class="starter-row ${s.done ? '-done' : ''}">
      <span class="starter-check">${s.done ? '✅' : '⬜'}</span>
      <span class="starter-icon">${s.icon}</span>
      <span class="starter-label">${escapeHtml(s.label)}</span>
    </div>
  `).join('');
  return `
    <div class="starter-box">
      <div class="starter-head">시작 미션 🚀 <span class="starter-count">${doneCount}/${steps.length}</span></div>
      ${rows}
      <div class="starter-note">하나씩 해보면 사용법이 저절로 익혀져요!</div>
    </div>
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
  const kids = activeKids();
  if (kids.indexOf(state.nmKid) < 0) state.nmKid = kids[0];
  if (kids.indexOf(state.bonusKid) < 0) state.bonusKid = kids[0];

  // 확인해주세요 — 아이의 "했어요!"를 확인하고 쿠키 주기
  const pending = state.missions.filter(m => m.state === 'pending' && kids.indexOf(m.kid) >= 0);
  const pendingBlock = pending.length === 0
    ? `<div class="empty-box">지금은 확인할 약속이 없어요 ✨</div>`
    : `<div class="pending-list">${pending.map(m => renderPendingCard(m)).join('')}</div>`;
  const badge = pending.length > 0 ? `<span class="pending-badge">${pending.length}</span>` : '';

  // 아이들 쿠키 현황
  const kidsRow = kids.map(k => `
    <div class="kid-status-card -${k}">
      <div class="kid-status-name">${escapeHtml(nameOf(k))}</div>
      <div class="kid-status-num">${state.balance[k] || 0}</div>
      <div class="kid-status-label">쿠키</div>
    </div>
  `).join('');

  // 칭찬 쿠키 바로 주기
  const bonusBlock = `
    <div class="sub-head">칭찬 쿠키 바로 주기 💖</div>
    <div class="bonus-box">
      <div class="pill-row">
        ${kids.map(k => {
          const cls = 'pill' + (state.bonusKid === k ? (' -active-kid -' + k) : '');
          return `<button class="${cls}" data-action="set-bonus-kid" data-kid="${k}">${escapeHtml(nameOf(k))}</button>`;
        }).join('')}
      </div>
      <div class="bonus-input-row">
        <input class="text-input" id="input-bonus-text" placeholder="칭찬 이유 (예: 심부름 잘함)" value="${escapeHtml(state.bonusText || '')}" data-input="bonus-text"/>
        <button class="btn-navy" data-action="give-bonus">🍪 주기</button>
      </div>
    </div>
  `;

  const sections = kids.map(k => {
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

  const kidPills = kids.map(k => {
    const cls = 'pill' + (state.nmKid === k ? (' -active-kid -' + k) : '');
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
    ${renderStarterChecklist()}
    <div class="section-head">
      <span class="section-title">확인해주세요</span>
      ${badge}
    </div>
    ${pendingBlock}
    <div class="sub-head">아이들 현황</div>
    <div class="kids-status-row">${kidsRow}</div>
    ${bonusBlock}
    <div class="sub-head">보낸 약속 📋</div>
    ${sections}
    <div class="sub-head">새 약속 보내기 📨</div>
    <div class="form-box">
      <div class="pill-row">${kidPills}</div>
      <div class="input-label">✏️ 어떤 약속인가요?</div>
      <input class="text-input-wide" id="input-nm-text" placeholder="여기에 적어주세요 (예: 🧸 장난감 정리하기)" value="${escapeHtml(state.nmText || '')}" data-input="nm-text"/>
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
      <div class="input-label">✏️ 보상 이름</div>
      <input class="text-input-wide" id="input-nr-text" placeholder="여기에 적어주세요 (예: 치킨 시켜먹기)" value="${escapeHtml(state.nrText || '')}" data-input="nr-text"/>
      <div class="price-stepper-row">
        <span class="price-label">쿠키 가격</span>
        <div class="price-stepper">
          <button class="step-btn-lg" data-action="nr-price-dec">−</button>
          <span class="price-value">🍪${state.nrPrice}</span>
          <button class="step-btn-lg" data-action="nr-price-inc">+</button>
        </div>
      </div>
      <button class="btn-navy" style="width:100%;padding:13px;font-size:16px;border-radius:14px" data-action="add-reward">쿠키마켓에 올리기</button>
    </div>
  `;

  return `
    <div class="section-head"><span class="section-title">보상 설정 🎁</span></div>
    <div style="display:flex;flex-direction:column;gap:9px">${rows}</div>
    ${addForm}
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
      const delBtn = l.delta > 0
        ? `<button class="log-delete" data-action="delete-log" data-id="${l.id}" data-delta="${l.delta}" aria-label="삭제">✕</button>`
        : '';
      return `
        <div class="log-row">
          <span class="log-tag ${kidCls}">${escapeHtml(nameOf(l.kid))}</span>
          <div class="log-text-block">
            <div class="log-text">${escapeHtml(l.text)}</div>
            ${time ? `<div class="log-time">${time}</div>` : ''}
          </div>
          <span class="log-delta ${deltaCls}">${deltaLabel}</span>
          ${delBtn}
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
  const enabledKids = activeKids();
  const fieldDefs = [{ id: 'parent', label: '부모님 표시 이름' }]
    .concat(enabledKids.map(k => ({ id: k, label: DEFAULT_NAMES[k] + ' 이름' })));
  const fields = fieldDefs.map(f => {
    const removable = f.id !== 'parent' && f.id !== 'first';
    return `
    <div>
      <div class="field-label-row">
        <span class="field-label" style="margin-bottom:0">${f.label}</span>
        ${removable ? `<button class="kid-remove" data-action="remove-kid" data-kid="${f.id}">빼기 ✕</button>` : ''}
      </div>
      <input class="field-input" data-settings-id="${f.id}" placeholder="${DEFAULT_NAMES[f.id]}" value="${escapeHtml(draft[f.id] || '')}"/>
    </div>
  `;
  }).join('');
  const pinField = `
    <div>
      <div class="field-label">부모님 비밀번호 (숫자 4자리)</div>
      <input class="field-input" data-settings-id="pin" inputmode="numeric" maxlength="4" placeholder="바꾸려면 입력 (처음엔 0000)" value="${escapeHtml(draft.pin || '')}"/>
    </div>
  `;
  const nextKid = KIDS.find(k => enabledKids.indexOf(k) < 0);
  const addKidBtn = !nextKid ? '' : `
    <button class="btn-add-kid" data-action="add-second-kid">🧡 ${DEFAULT_NAMES[nextKid]} 추가하기</button>
  `;
  const famField = `
    <div>
      <div class="field-label">가족방 초대 코드 🔑</div>
      <div class="family-code">${escapeHtml(FAMILY_KEY || '')}</div>
      <div class="field-hint">다른 기기에서 "초대 코드로 들어가기"에 이 코드를 입력하면 같은 가족방에 연결돼요. 가족 외에는 알려주지 마세요!</div>
      <button class="btn-rotate-code" data-action="rotate-code">🔄 초대 코드 바꾸기 (유출됐을 때)</button>
    </div>
  `;
  const notifyOn = notificationsOn();
  const notifyField = `
    <div>
      <div class="field-label">이 기기 알림 🔔</div>
      <button class="btn-notify ${notifyOn ? '-on' : ''}" data-action="toggle-notify">
        ${notifyOn ? '🔔 알림 켜짐 — 끄려면 누르기' : '🔕 알림 꺼짐 — 켜려면 누르기'}
      </button>
      <div class="field-hint">부모님 기기: 아이가 "했어요!"를 누르면 알려드려요. 아이 기기: 칭찬 쿠키가 도착하면 알려줘요. 앱이 열려 있거나 최근에 사용 중일 때 동작해요.</div>
    </div>
  `;
  const feedbackField = `
    <div>
      <div class="field-label">개발자에게 피드백 보내기 💬</div>
      <textarea class="feedback-input" data-settings-id="feedback" rows="3"
        placeholder="불편한 점, 바라는 기능을 자유롭게 적어주세요">${escapeHtml(draft.feedback || '')}</textarea>
      <button class="btn-feedback" data-action="send-feedback">보내기 📨</button>
    </div>
  `;
  const resetField = `
    <div>
      <button class="btn-reset-device" data-action="reset-device">🧹 이 기기 초기화 (처음부터 시작)</button>
      <div class="field-hint">이 기기에서 가족방 연결을 끊고 첫 화면으로 돌아가요. 가족방의 데이터는 지워지지 않아요.</div>
    </div>
  `;
  const privacyLink = `<a class="settings-privacy" href="privacy.html" target="_blank" rel="noopener">개인정보처리방침</a>`;
  document.getElementById('settings-body').innerHTML = fields + pinField + addKidBtn + famField + notifyField + feedbackField + resetField + privacyLink;
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
      if (key === 'bonus-text')       state.bonusText      = e.target.value;
      if (key === 'nm-text')          state.nmText         = e.target.value;
      if (key === 'nr-text')          state.nrText         = e.target.value;
      if (key === 'onboard-code')     state.onboardInput   = e.target.value;
      if (key === 'onboard-kid-name') state.onboardKidName = e.target.value;
      if (key === 'onboard-pin')      state.onboardPin     = e.target.value;
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const key = e.target.getAttribute('data-input');
        if (key === 'bonus-text')       giveBonus();
        if (key === 'nm-text')          addMission();
        if (key === 'nr-text')          addReward();
        if (key === 'onboard-code')     joinFamilyRoom();
        if (key === 'onboard-kid-name') setupSaveName();
        if (key === 'onboard-pin')      setupSavePin();
      }
    });
  });
}

/* ---------- Top-level render ---------- */

function render() {
  // 다른 기기에서 이 아이가 목록에서 빠졌으면 첫째 화면으로
  if (FAMILY_KEY && !state.onboardSetup && !isParent(state.me) && activeKids().indexOf(state.me) < 0) {
    state.me = activeKids()[0] || 'parent';
    state.tab = 'mission';
  }
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
      // 설정에는 비밀번호 변경·초대 코드가 있어서 부모님만 열 수 있다
      if (!meIsParent()) {
        showToast('설정은 부모님만 열 수 있어요 🔒');
        openPinModal();
        return;
      }
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
    case 'add-second-kid':
      addNextKid();
      return;
    case 'delete-log': {
      const delta = Number(target.getAttribute('data-delta')) || 0;
      const msg = delta > 0
        ? '이 칭찬 기록을 지울까요?\n지급됐던 쿠키 ' + delta + '개도 함께 회수돼요.'
        : '이 기록을 지울까요?';
      if (confirm(msg)) {
        deleteLogEntry(Number(target.getAttribute('data-id')));
      }
      return;
    }
    case 'onboard-create':
      createFamilyRoom();
      return;
    case 'onboard-join-mode':
      state.onboardMode = 'join';
      render();
      return;
    case 'onboard-back':
      state.onboardMode = 'choose';
      render();
      return;
    case 'onboard-join':
      joinFamilyRoom();
      return;
    case 'toggle-notify':
      toggleNotifications();
      return;
    case 'rotate-code':
      if (confirm('초대 코드를 새로 만들까요?\n다른 가족 기기들은 새 코드로 다시 들어와야 해요.')) {
        rotateFamilyCode();
      }
      return;
    case 'setup-name-next':
      setupSaveName();
      return;
    case 'setup-pin-next':
      setupSavePin();
      return;
    case 'setup-finish':
      finishSetup();
      return;
    case 'pick-mission': {
      const i = Number(target.getAttribute('data-i'));
      const at = state.onboardPickM.indexOf(i);
      if (at >= 0) state.onboardPickM.splice(at, 1); else state.onboardPickM.push(i);
      render();
      return;
    }
    case 'pick-reward': {
      const i = Number(target.getAttribute('data-i'));
      const at = state.onboardPickR.indexOf(i);
      if (at >= 0) state.onboardPickR.splice(at, 1); else state.onboardPickR.push(i);
      render();
      return;
    }
    case 'setup-picks-next':
      setupApplyPicks();
      return;
    case 'remove-kid': {
      const k = target.getAttribute('data-kid');
      if (confirm(nameOf(k) + ' 아이를 목록에서 뺄까요?\n쿠키와 기록은 보관되고, 다시 추가하면 그대로 돌아와요.')) {
        removeKid(k);
      }
      return;
    }
    case 'reset-device':
      if (confirm('이 기기를 초기화할까요?\n가족방 연결이 끊기고 첫 화면으로 돌아가요.\n(가족방의 데이터는 지워지지 않아요)')) {
        resetThisDevice();
      }
      return;
    case 'poke-jar':
      // 쿠키통 콕 찌르기 — 쿠키들이 흔들흔들
      target.classList.remove('-poke');
      void target.offsetWidth; // 애니메이션 재시작 트릭
      target.classList.add('-poke');
      return;
    case 'send-feedback':
      sendFeedback();
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

/* ---------- 모바일 키보드 보정 ----------
   iOS 사파리는 키보드가 열릴 때 화면 전체를 위로 밀어올리는데,
   키보드가 닫힌 뒤에도 밀린 상태가 남아 하단 탭이 화면 밖에
   걸리는 경우가 있다. 입력이 끝나면 화면 위치를 원래대로 되돌린다. */

window.addEventListener('focusout', () => {
  setTimeout(() => window.scrollTo(0, 0), 60);
});

if (window.visualViewport) {
  window.visualViewport.addEventListener('resize', () => {
    const el = document.activeElement;
    const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
    if (!typing) window.scrollTo(0, 0);
  });
}

/* ---------- 서비스 워커 등록 (오프라인 지원) ---------- */

if ('serviceWorker' in navigator &&
    (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}

/* ---------- 자정 넘김 감지 ----------
   앱을 켜둔 채 자정이 지나면 매일 약속을 그 자리에서 리셋한다.
   (기존에는 앱을 새로 열 때만 리셋됐음) */

let lastSeenDay = todayKey();

function checkDayRollover() {
  const t = todayKey();
  if (t === lastSeenDay) return;
  lastSeenDay = t;
  applyDailyReset(state);
  saveState(); // 리셋 결과를 가족 기기에도 전파
  render();
}

setInterval(checkDayRollover, 30 * 1000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkDayRollover(); // 백그라운드에서 돌아왔을 때 즉시 확인
});

/* ============================================================
   Boot
   ============================================================ */

rememberCurrentPending(); // 부팅 시점의 '확인 대기'는 이미 본 것으로 간주
render();
initCloud();
