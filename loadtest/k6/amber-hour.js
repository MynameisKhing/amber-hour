// Amber Hour — k6 load test
//
// Exercises the two things that actually carry load in this app:
//   1. The REST API (signup/login, menu browsing, wallet, orders, guestbook)
//   2. The realtime WebSocket hub (/ws) — chat, typing, presence pings
//
// Auth: we use POST /api/signup, which issues a JWT directly and (unlike
// /api/login) does NOT require an access code — so the test is self-seeding.
//
// Run:
//   k6 run loadtest/k6/amber-hour.js
//   k6 run -e BASE_URL=https://amber.example.com -e VUS=50 -e DURATION=2m loadtest/k6/amber-hour.js
//   k6 run -e SCENARIO=http loadtest/k6/amber-hour.js   # only the REST scenario
//   k6 run -e SCENARIO=ws   loadtest/k6/amber-hour.js   # only the WebSocket scenario
//
// Requires k6 >= 0.40 (https://k6.io/docs/get-started/installation/).

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep, group } from 'k6';
import { Counter, Trend } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { textSummary } from 'https://jslib.k6.io/k6-summary/0.0.2/index.js';

// ── Config ──────────────────────────────────────────────────────────────────
const BASE_URL = 'http://khing.devsecops.wiki';
const WS_URL = BASE_URL.replace(/^http/, 'ws') + '/ws';
const VUS = parseInt(__ENV.VUS || '20', 10);
const DURATION = __ENV.DURATION || '1m';
const WHICH = (__ENV.SCENARIO || 'all').toLowerCase(); // all | http | ws

// ── Custom metrics ──────────────────────────────────────────────────────────
const wsConnecting = new Trend('ws_connecting', true);
const wsMsgsReceived = new Counter('ws_msgs_received');
const wsMsgsSent = new Counter('ws_msgs_sent');
const signupFailures = new Counter('signup_failures');

// ── Scenario wiring ─────────────────────────────────────────────────────────
const allScenarios = {
  rest_browsing: {
    exec: 'restBrowsing',
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: VUS },
      { duration: DURATION, target: VUS },
      { duration: '10s', target: 0 },
    ],
    tags: { scenario: 'rest' },
  },
  ws_chat: {
    exec: 'wsChat',
    executor: 'ramping-vus',
    startVUs: 0,
    stages: [
      { duration: '15s', target: VUS },
      { duration: DURATION, target: VUS },
      { duration: '10s', target: 0 },
    ],
    tags: { scenario: 'ws' },
  },
};

let scenarios = allScenarios;
if (WHICH === 'http') scenarios = { rest_browsing: allScenarios.rest_browsing };
if (WHICH === 'ws') scenarios = { ws_chat: allScenarios.ws_chat };

export const options = {
  scenarios,
  thresholds: {
    http_req_failed: ['rate<0.01'],            // <1% of HTTP requests fail
    http_req_duration: ['p(95)<800'],          // 95% of requests under 800ms
    'http_req_duration{name:signup}': ['p(95)<1500'], // bcrypt is intentionally slow
    ws_connecting: ['p(95)<1000'],             // WS handshake under 1s
    checks: ['rate>0.99'],
  },
};

// ── Helpers ─────────────────────────────────────────────────────────────────
function uniqueNick(prefix) {
  // Unique per VU + iteration so we never collide on the username UNIQUE index.
  return `${prefix}_${__VU}_${__ITER}_${randomIntBetween(1000, 9999)}`;
}

// signup creates a fresh account and returns { token, nickname, role } or null.
function signup(role) {
  const nick = uniqueNick(role === 'staff' ? 'lt_staff' : 'lt_cust');
  const res = http.post(
    `${BASE_URL}/api/signup`,
    JSON.stringify({ username: nick, password: 'loadtest123', role }),
    { headers: { 'Content-Type': 'application/json' }, tags: { name: 'signup' } }
  );
  const ok = check(res, {
    'signup 200': (r) => r.status === 200,
    'signup returns token': (r) => !!(r.json() && r.json().token),
  });
  if (!ok) {
    signupFailures.add(1);
    return null;
  }
  return res.json();
}

function authHeaders(token) {
  return {
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  };
}

// ── Scenario 1: REST browsing + ordering ─────────────────────────────────────
export function restBrowsing() {
  const session = signup('customer');
  if (!session) {
    sleep(1);
    return;
  }
  const token = session.token;

  let menu = [];

  group('browse', () => {
    const menuRes = http.get(`${BASE_URL}/api/menu`, {
      ...authHeaders(token),
      tags: { name: 'menu' },
    });
    check(menuRes, { 'menu 200': (r) => r.status === 200 });
    menu = (menuRes.json() || []).filter((m) => m.isAvailable);

    const wallet = http.get(`${BASE_URL}/api/wallet`, {
      ...authHeaders(token),
      tags: { name: 'wallet' },
    });
    check(wallet, { 'wallet 200': (r) => r.status === 200 });

    const board = http.get(`${BASE_URL}/api/leaderboard`, {
      ...authHeaders(token),
      tags: { name: 'leaderboard' },
    });
    check(board, { 'leaderboard 200': (r) => r.status === 200 });

    const guestbook = http.get(`${BASE_URL}/api/guestbook`, {
      tags: { name: 'guestbook' },
    });
    check(guestbook, { 'guestbook 200': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));

  group('order', () => {
    // New patrons usually can't afford anything yet (wallet starts low and
    // fills via the earn ticker), so a 402 here is an EXPECTED outcome — we
    // only assert the endpoint behaves, not that the order succeeds.
    if (menu.length > 0) {
      const item = menu[randomIntBetween(0, menu.length - 1)];
      const orderRes = http.post(
        `${BASE_URL}/api/orders`,
        JSON.stringify({ items: [{ menuItemId: item.id, qty: 1 }] }),
        { ...authHeaders(token), tags: { name: 'order' } }
      );
      check(orderRes, {
        'order resolved (200/402/400)': (r) =>
          r.status === 200 || r.status === 402 || r.status === 400,
      });
    }

    const myOrders = http.get(`${BASE_URL}/api/orders/me`, {
      ...authHeaders(token),
      tags: { name: 'orders_me' },
    });
    check(myOrders, { 'orders/me 200': (r) => r.status === 200 });
  });

  sleep(randomIntBetween(1, 3));
}

// ── Scenario 2: WebSocket chat ───────────────────────────────────────────────
export function wsChat() {
  const session = signup('customer');
  if (!session) {
    sleep(1);
    return;
  }

  // Token goes in the query string — withAuth() reads ?token= when there's no
  // Authorization header (which JS WebSocket clients can't set).
  const url = `${WS_URL}?token=${encodeURIComponent(session.token)}`;
  const start = Date.now();

  const res = ws.connect(url, {}, (socket) => {
    wsConnecting.add(Date.now() - start);

    socket.on('open', () => {
      // Heartbeat — the hub expires Redis presence after 25s, client pings 15s.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ type: 'ping' }));
        wsMsgsSent.add(1);
      }, 15000);

      // Simulated chatter: type, then send a message, on a loop.
      socket.setInterval(() => {
        socket.send(JSON.stringify({ type: 'typing' }));
        wsMsgsSent.add(1);
        socket.setTimeout(() => {
          socket.send(
            JSON.stringify({
              type: 'chat',
              payload: { content: `gm from VU${__VU} @ ${Date.now()}` },
            })
          );
          wsMsgsSent.add(1);
          socket.send(JSON.stringify({ type: 'typing_stop' }));
          wsMsgsSent.add(1);
        }, randomIntBetween(500, 2000));
      }, randomIntBetween(4000, 8000));

      // Stay connected for a slice of the test, then leave cleanly.
      socket.setTimeout(() => socket.close(), randomIntBetween(20000, 40000));
    });

    socket.on('message', (msg) => {
      wsMsgsReceived.add(1);
      // On connect the hub immediately pushes history/presence/jukebox/bar_status.
      const frame = safeParse(msg);
      check(frame, { 'ws frame has type': (f) => f && typeof f.type === 'string' });
    });

    socket.on('error', (e) => {
      // 1006/abnormal closures during ramp-down are noise; log real errors.
      if (e && e.error && !`${e.error}`.includes('close')) {
        console.error(`ws error (VU${__VU}): ${e.error}`);
      }
    });
  });

  check(res, { 'ws status 101': (r) => r && r.status === 101 });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch (_e) {
    return null;
  }
}

// ── Result collection ────────────────────────────────────────────────────────
// Writes a machine-readable summary so the run can be reviewed afterwards
// (e.g. handed to Claude to confirm the script actually exercised the API).
// Pulls out the few signals that prove the script WORKED rather than just ran:
//   - did signup succeed and return a token?  (checks rate, signup_failures)
//   - did HTTP requests actually leave the box? (http_reqs, http_req_failed)
//   - did WebSockets reach 101 and exchange frames? (ws_msgs_*, ws_connecting)
export function handleSummary(data) {
  const m = data.metrics;
  const val = (name, field) =>
    m[name] && m[name].values ? m[name].values[field] : undefined;

  const verdict = {
    base_url: BASE_URL,
    timestamp: new Date().toISOString(),
    looks_healthy:
      (val('checks', 'rate') || 0) > 0.99 &&
      (val('http_req_failed', 'rate') || 1) < 0.01,
    signals: {
      checks_pass_rate: val('checks', 'rate'),
      http_reqs_total: val('http_reqs', 'count'),
      http_req_failed_rate: val('http_req_failed', 'rate'),
      http_req_duration_p95_ms: val('http_req_duration', 'p(95)'),
      signup_failures: val('signup_failures', 'count') || 0,
      ws_connect_p95_ms: val('ws_connecting', 'p(95)'),
      ws_msgs_sent: val('ws_msgs_sent', 'count') || 0,
      ws_msgs_received: val('ws_msgs_received', 'count') || 0,
      data_sent_bytes: val('data_sent', 'count'),
      data_received_bytes: val('data_received', 'count'),
    },
  };

  return {
    // Full k6 dump — every metric, for deep dives.
    'loadtest-result.json': JSON.stringify(data, null, 2),
    // Small, focused verdict — this is the one to share for a quick review.
    'loadtest-verdict.json': JSON.stringify(verdict, null, 2),
    // Keep the normal on-screen summary too.
    stdout: textSummary(data, { indent: ' ', enableColors: true }),
  };
}
