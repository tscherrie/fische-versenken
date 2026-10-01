// The line to the room (plan, part 5; the room service is rooms/src/index.js): one WebSocket
// to the room's Durable Object, which keeps the lobby and passes on what each player sends.
// This file only talks: it says hello (with the token that keeps this player's place in the
// room, from an earlier visit), sends and receives the messages, keeps the room's clock (from
// the answers to its pings, half the round trip taken off), and comes back after a dropped
// connection with the same token. What the messages mean is the lobby's (coop.js), the
// mates' (mates.js) and the enemies' owners' (owners.js).
//
// For testing, ?lag=<ms>&jitter=<ms> holds every message back that long both ways (as a far
// away room would), never out of order -- a WebSocket keeps its order, and owners.js counts
// on it -- and ?skew=<ms> puts this page's clock of the room that far off. `traffic` counts
// what goes out and comes in.

// Where the room service runs (Cloudflare's workers.dev; empty would hide co-op again);
// ?rooms=<url> points a test at another (e.g. `wrangler dev`).
export const ROOMS = "https://salmon-rooms.salmon-survival-extreme-rooms.workers.dev";

const TOKENS = "extreme-rooms";
// How long to wait before trying again after a dropped connection (s), doubling up to the
// last.
const RETRY = [0.5, 1, 2, 4, 8];

export function createNet({ base = ROOMS, version = "", player = "", lag = 0, jitter = 0, skew = 0 } = {}) {
  // The token of this browser's place in a room (kept per room; `player` keeps several
  // players apart in one browser, for testing with two tabs).
  const key = (code) => (player ? `${code}:${player}` : code);
  const tokenOf = (code) => {
    try {
      return JSON.parse(localStorage.getItem(TOKENS) || "{}")[key(code)] ?? null;
    } catch {
      return null;
    }
  };
  const keepToken = (code, token) => {
    try {
      const all = JSON.parse(localStorage.getItem(TOKENS) || "{}");
      all[key(code)] = token;
      localStorage.setItem(TOKENS, JSON.stringify(all));
    } catch {
      // (Without storage the place is still ours for this visit.)
    }
  };
  const handlers = new Map();
  let socket = null,
    code = null,
    name = "",
    tries = 0,
    retryTimer = 0,
    pingTimer = 0,
    closed = false;
  // The room's clock: its time minus ours (ms), from the best (shortest) round trip so far.
  let offset = 0,
    bestTrip = Infinity,
    trip = 0;
  // What went out and came in: messages and bytes (of the JSON text), since the start.
  const traffic = { sent: 0, sentBytes: 0, received: 0, receivedBytes: 0, joins: 0, unsent: 0, since: Date.now() };
  // (The test lag: messages waiting their moment, each way; the moment never earlier than
  // the one before it, so nothing overtakes.)
  const late = { out: [], in: [], outAt: 0, inAt: 0, timer: 0 };
  const delay = () => lag + jitter * Math.random();
  const api = {
    seat: null,
    token: null,
    host: null,
    // "idle", "connecting", "open" (said hello, waiting for the welcome), "joined", "refused"
    state: "idle",
    // The room's time now (ms).
    now: () => Date.now() + offset + skew,
    traffic,
    // The last round trip to the room (ms).
    get trip() {
      return trip;
    },
    get code() {
      return code;
    },
    on(type, fn) {
      if (!handlers.has(type)) handlers.set(type, new Set());
      handlers.get(type).add(fn);
      return () => handlers.get(type).delete(fn);
    },
    send(message) {
      if (socket?.readyState !== 1 || api.state !== "joined") {
        traffic.unsent++;
        return false;
      }
      put(socket, JSON.stringify(message));
      return true;
    },
    // Into room `code` as `nickname`.
    join(roomCode, nickname) {
      code = roomCode;
      name = nickname;
      closed = false;
      connect();
    },
    rename(nickname) {
      name = nickname;
      api.send({ t: "name", name });
    },
    leave() {
      closed = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      socket?.close(1000, "left");
      socket = null;
      api.state = "idle";
    },
  };
  // Out through the socket, counted (and held back for the test lag).
  function put(ws, text) {
    traffic.sent++;
    traffic.sentBytes += text.length;
    if (!lag && !jitter) return ws.send(text);
    late.outAt = Math.max(late.outAt, performance.now() + delay());
    late.out.push({ at: late.outAt, ws, text });
    schedule();
  }
  function schedule() {
    clearTimeout(late.timer);
    const next = Math.min(late.out[0]?.at ?? Infinity, late.in[0]?.at ?? Infinity);
    if (next < Infinity) late.timer = setTimeout(release, Math.max(0, next - performance.now()));
  }
  function release() {
    const now = performance.now();
    while (late.out.length && late.out[0].at <= now) {
      const { ws, text } = late.out.shift();
      if (ws.readyState === 1) ws.send(text);
    }
    while (late.in.length && late.in[0].at <= now) {
      const { ws, data } = late.in.shift();
      if (ws === socket) take(data);
    }
    schedule();
  }
  function emit(type, message) {
    for (const fn of handlers.get(type) ?? []) {
      try {
        fn(message);
      } catch (error) {
        console.error(error);
      }
    }
  }
  function connect() {
    clearTimeout(retryTimer);
    api.state = "connecting";
    emit("status", api);
    const url = `${base.replace(/^http/, "ws")}/rooms/${code}/ws`;
    let ws;
    try {
      ws = new WebSocket(url);
    } catch {
      return retry();
    }
    socket = ws;
    ws.addEventListener("open", () => {
      api.state = "open";
      put(ws, JSON.stringify({ t: "hello", name, version, token: tokenOf(code) }));
      ping();
      clearInterval(pingTimer);
      pingTimer = setInterval(ping, 2000);
    });
    ws.addEventListener("message", (event) => {
      traffic.received++;
      traffic.receivedBytes += event.data?.length ?? 0;
      if (!lag && !jitter) return take(event.data);
      late.inAt = Math.max(late.inAt, performance.now() + delay());
      late.in.push({ at: late.inAt, ws, data: event.data });
      schedule();
    });
    ws.addEventListener("close", (event) => {
      if (socket !== ws) return;
      clearInterval(pingTimer);
      socket = null;
      // (Our place taken over by the same player in another tab or window: that one plays
      // on, this one stops, instead of the two taking the place from each other for ever.)
      if (event.code === 4001) {
        closed = true;
        api.state = "replaced";
      }
      if (closed) {
        emit("status", api);
        return;
      }
      retry();
    });
    ws.addEventListener("error", () => {
      // (The close event follows.)
    });
  }
  // A message from the room, as it came (or once the test lag has let it through).
  function take(data) {
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (m.t === "pong") return pong(m);
    if (m.t === "welcome") {
      tries = 0;
      traffic.joins++;
      api.state = "joined";
      api.seat = m.seat;
      api.token = m.token;
      api.host = m.host;
      keepToken(code, m.token);
      // (A first guess of the clock until the pings answer.)
      if (bestTrip === Infinity) offset = m.now - Date.now();
      emit("status", api);
    }
    if (m.t === "lobby") api.host = m.host;
    if (m.t === "refused") {
      api.state = "refused";
      closed = true;
    }
    emit(m.t, m);
  }
  function retry() {
    api.state = "connecting";
    emit("status", api);
    const wait = RETRY[Math.min(tries++, RETRY.length - 1)];
    retryTimer = setTimeout(connect, wait * 1000);
  }
  function ping() {
    if (socket?.readyState === 1) put(socket, JSON.stringify({ t: "ping", c: performance.now() }));
  }
  function pong(m) {
    trip = performance.now() - m.c;
    // (The shortest trips say the most about the clock: the answer came back soonest.)
    if (trip <= bestTrip * 1.3) {
      bestTrip = Math.min(bestTrip, trip);
      offset = m.s + trip / 2 - Date.now();
    }
  }
  return api;
}
