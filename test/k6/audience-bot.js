import http from 'k6/http';
import { check, sleep } from 'k6';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

function compactString(v) {
  if (v == null) return '';
  const s = String(v).trim();
  return s;
}

const defaults = {
  gasEndpoint: '',
  vus: 30,
  duration: '1m',
  team: 'random',
  timeout: '10s',
};

const config = {
  gasEndpoint: compactString(__ENV.GAS_ENDPOINT) || defaults.gasEndpoint,
  duration: compactString(__ENV.DURATION) || defaults.duration,
  timeout: compactString(__ENV.TIMEOUT) || defaults.timeout,
  vus: Number(compactString(__ENV.VUS) || String(defaults.vus)),
  team: compactString(__ENV.TEAM) || defaults.team,
  // optional（未指定なら毎回ランダム）
  countRaw: compactString(__ENV.COUNT),
};

/** @type {string | null} */
let cachedUserId = null;

function resolveTeam() {
  if (config.team === 'red' || config.team === 'white') return config.team;
  return Math.random() < 0.5 ? 'red' : 'white';
}

function tryFetchUserId(endpoint) {
  if (cachedUserId) return cachedUserId;

  const url = `${endpoint}?get_user_id=true`;
  const res = http.get(url, {
    tags: { name: 'gas_get_user_id' },
    timeout: config.timeout,
  });

  if (res.status !== 200) {
    return null;
  }

  /** @type {{ ok?: boolean; userId?: unknown }} */
  const body = res.json();
  if (!body || body.ok !== true || !body.userId) {
    return null;
  }

  cachedUserId = String(body.userId);
  return cachedUserId;
}

function waitForUserId(endpoint) {
  const startedAt = Date.now();
  const maxWaitMs = 30_000;
  const retrySleepSec = 0.2;
  // k6の http.get は同期処理（Promise/await不可）なので、
  // useridが取れるまで「同期で待つ（再試行+sleep）」。
  while (Date.now() - startedAt < maxWaitMs) {
    const userId = tryFetchUserId(endpoint);
    if (userId) return userId;
    sleep(retrySleepSec);
  }
  return null;
}

export const options = {
  vus: config.vus,
  duration: config.duration,
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1000'],
  },
};

export default function () {
  const endpoint = config.gasEndpoint;
  const userId = waitForUserId(endpoint);
  if (!userId) {
    // 取得できない場合はこのイテレーションは送らない（次で再試行）
    return;
  }

  const team = resolveTeam();
  const count = Number(config.countRaw ? config.countRaw : randomIntBetween(1, 5));

  const url = `${endpoint}?selectedTeam=${encodeURIComponent(team)}&count=${encodeURIComponent(
    String(count),
  )}&userid=${encodeURIComponent(userId)}`;

  const startedAt = Date.now();
  const res = http.get(url, {
    tags: { name: 'gas_exec', team },
    timeout: config.timeout,
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
  });

  // 1秒に1回をできるだけ守る（リクエスト時間ぶんだけ差し引く）
  const elapsedMs = Date.now() - startedAt;
  const sleepSec = Math.max(0, (1000 - elapsedMs) / 1000);
  sleep(sleepSec);
}

