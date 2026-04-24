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

function resolveTeam() {
  if (config.team === 'red' || config.team === 'white') return config.team;
  return Math.random() < 0.5 ? 'red' : 'white';
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

  const team = resolveTeam();
  const count = Number(config.countRaw ? config.countRaw : randomIntBetween(1, 5));

  const url = `${endpoint}?selectedTeam=${encodeURIComponent(team)}&count=${encodeURIComponent(
    String(count),
  )}`;

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

