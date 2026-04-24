const GAS_ENDPOINT =
  'https://script.google.com/macros/s/AKfycbxLrtSrMB7on7RUFqsz3v_xk_pM_mVHA8gvsHEkALmniO77ouoU-4jBqTqePmnMMvGR6Q/exec';

/** @type {'red' | 'white' | null} */
let selectedTeam = null;

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

function gasRequest() {
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
    // shake_count(count) が 0 以上のときだけ送信する
    if (typeof count !== 'number' || Number.isNaN(count) || count < 0) {
      return;
    }
    // GETメソッドでselectedTeamとcountをクエリパラメータで送信
    const params = new URLSearchParams({
      selectedTeam: selectedTeam,
      count: count,
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
  motionStatus.textContent = 'センサー待機中… 端末を振ってください。';
  renderShakeCounter(0);
  gasRequest();
}

document.querySelectorAll('.team-btn[data-team]').forEach(function (btn) {
  btn.addEventListener('click', function () {
    const team = /** @type {'red' | 'white'} */ (btn.getAttribute('data-team'));
    void onChooseTeam(team);
  });
});
