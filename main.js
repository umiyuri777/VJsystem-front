const GAS_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxY89Ks_QcFDr_KeHSbtNr8Zg0vfznscQbmYSwZCpymcnhHKdTLyMQxCxPzjtGqJfhsYQ/exec';

/** @type {'red' | 'white' | null} */
let selectedTeam = null;

const USER_ID_STORAGE_KEY = 'vj_userid';
/** @type {string | null} */
let currentUserId = null;

const SHAKE_COOLDOWN_MS = 180;
/** 線形加速度 (m/s²) 用 */
const LINEAR_THRESHOLD = 14;
/** 重力込みのときの |a| からの偏差 */
const GRAVITY_MAG = 9.80665;
const INCLUDING_GRAVITY_DEV_THRESHOLD = 4;

let shakesThisSecond = 0;
let lastPeakTime = 0;
/** @type {null | 'linear' | 'including'} */
let lockedAccelMode = null;
let postIntervalId = 0;

const screen1 = document.getElementById('screen1');
const screen2 = document.getElementById('screen2');
const teamPill = document.getElementById('teamPill');
const motionStatus = document.getElementById('motionStatus');
const shakeCounter = document.getElementById('shakeCounter');
const desktopWarn = document.getElementById('desktopWarn');

/**
 * @param {number} count
 */
function renderShakeCounter(count) {
  shakeCounter.innerHTML = 'この1秒: <span class="counter__num">' + count + '</span> 回';
}

function teamLabel(team) {
  return team === 'red' ? '紅' : '白';
}

function loadUserId() {
  try {
    const v = window.localStorage.getItem(USER_ID_STORAGE_KEY);
    if (!v) return null;
    const s = String(v).trim();
    return s ? s : null;
  } catch (e) {
    console.error(e);
    return null;
  }
}

/**
 * @param {string} userId
 */
function saveUserId(userId) {
  try {
    window.localStorage.setItem(USER_ID_STORAGE_KEY, userId);
  } catch (e) {
    console.error(e);
  }
}

async function fetchUserId() {
  const params = new URLSearchParams({ get_user_id: 'true' });
  const response = await fetch(`${GAS_ENDPOINT}?${params.toString()}`, { method: 'GET' });
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(text || 'Failed to fetch userId');
  }
  const result = await response.json().catch(() => ({}));
  if (!result || result.ok !== true || !result.userId) {
    throw new Error('Invalid userId response');
  }
  return String(result.userId);
}

async function ensureUserId() {
  const cached = loadUserId();
  if (cached) return cached;
  const fetched = await fetchUserId();
  saveUserId(fetched);
  return fetched;
}

/**
 * @param {DeviceMotionEvent} event
 */
function onDeviceMotion(event) {
  let ax;
  let ay;
  let az;
  let mode = lockedAccelMode;

  if (!mode) {
    const acc = event.acceleration;
    if (acc && acc.x != null && acc.y != null && acc.z != null) {
      mode = 'linear';
    } else {
      const ig = event.accelerationIncludingGravity;
      if (ig && ig.x != null && ig.y != null && ig.z != null) {
        mode = 'including';
      } else {
        return;
      }
    }
    lockedAccelMode = mode;
  }

  if (mode === 'linear') {
    const acc = event.acceleration;
    if (!acc || acc.x == null || acc.y == null || acc.z == null) {
      return;
    }
    ax = acc.x;
    ay = acc.y;
    az = acc.z;
  } else {
    const ig = event.accelerationIncludingGravity;
    if (!ig || ig.x == null || ig.y == null || ig.z == null) {
      return;
    }
    ax = ig.x;
    ay = ig.y;
    az = ig.z;
  }

  const mag = Math.sqrt(ax * ax + ay * ay + az * az);
  let strength;
  if (mode === 'linear') {
    strength = mag;
  } else {
    strength = Math.abs(mag - GRAVITY_MAG);
  }

  const threshold = mode === 'linear' ? LINEAR_THRESHOLD : INCLUDING_GRAVITY_DEV_THRESHOLD;
  const now = Date.now();
  if (strength > threshold && now - lastPeakTime >= SHAKE_COOLDOWN_MS) {
    lastPeakTime = now;
    shakesThisSecond += 1;
    renderShakeCounter(shakesThisSecond);
  }
}

/**
 * @param {string} userId
 */
function gasRequest(userId) {
  if (postIntervalId) {
    clearInterval(postIntervalId);
  }
  postIntervalId = window.setInterval(function () {
    const count = shakesThisSecond;
    shakesThisSecond = 0;
    renderShakeCounter(0);
    if (!selectedTeam) {
      return;
    }
    // 0回のときは送らない（回数が正のときだけ送信）
    if (typeof count !== 'number' || Number.isNaN(count) || count <= 0) {
      return;
    }
    // GETメソッドでselectedTeamとcountをクエリパラメータで送信
    const params = new URLSearchParams({
      selectedTeam: selectedTeam,
      count: count,
      userid: userId,
    });

    fetch(`${GAS_ENDPOINT}?${params.toString()}`, {
      method: 'GET',
    })
      .then(function (response) {
        if (!response.ok) {
          return response.text().then((text) => {
            throw new Error(text);
          });
        }
        return response.json().catch(() => ({}));
      })
      .then(function (result) {
        if (result && result.ok === false) {
          console.error(result);
        }
      })
      .catch(function (err) {
        console.error(err);
      });
  }, 1000);
}

/**
 * @param {'red' | 'white'} team
 */
async function onChooseTeam(team) {
  selectedTeam = team;

  if (typeof DeviceMotionEvent !== 'undefined' && DeviceMotionEvent.requestPermission) {
    try {
      const state = await DeviceMotionEvent.requestPermission();
      if (state !== 'granted') {
        motionStatus.textContent = 'モーションの許可が得られませんでした。';
      }
    } catch (e) {
      console.error(e);
      motionStatus.textContent = 'モーションの許可に失敗しました。';
    }
  }

  teamPill.textContent = teamLabel(team);
  teamPill.classList.remove('team-pill--red', 'team-pill--white');
  teamPill.classList.add(team === 'red' ? 'team-pill--red' : 'team-pill--white');

  screen1.classList.add('hidden');
  screen2.classList.remove('hidden');

  if (!window.DeviceMotionEvent) {
    desktopWarn.classList.remove('hidden');
    return;
  }

  window.addEventListener('devicemotion', onDeviceMotion, true);
  motionStatus.textContent = 'ユーザーID取得中…';
  renderShakeCounter(0);

  try {
    currentUserId = await ensureUserId();
    motionStatus.textContent = 'センサー待機中… 端末を振ってください。';
    gasRequest(currentUserId);
  } catch (e) {
    console.error(e);
    motionStatus.textContent = 'ユーザーID取得に失敗しました。通信環境を確認して再読み込みしてください。';
  }
}

document.querySelectorAll('.team-btn[data-team]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const team = /** @type {'red' | 'white'} */ (btn.getAttribute('data-team'));
    void onChooseTeam(team);
  });
});
