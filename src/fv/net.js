// The line to the room (plan, part 5; the room service is rooms/src/index.js): one WebSocket
// to the room's Durable Object, which keeps the lobby and passes on what each player sends.
// This file only talks: it says hello (with the token that keeps this player's place in the
// room, from an earlier visit), sends and receives the messages, keeps the room's clock (from
// the answers to its pings, half the round trip taken off), and comes back after a dropped
// connection with the same token. What the messages mean is the lobby's (lobby.js) and the
// mates' (mates.js).

// Where the room service runs (empty until it is online: co-op then stays hidden); ?rooms=
// <url> points a test at another (e.g. `wrangler dev`).
export const ROOMS = "";

const TOKENS = "extreme-rooms";
// How long to wait before trying again after a dropped connection (s), doubling up to the
// last.
const RETRY = [0.5, 1, 2, 4, 8];

export function createNet({ base = ROOMS, version = "", player = "" } = {}) {
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
  const api = {
    seat: null,
    token: null,
    host: null,
    // "idle", "connecting", "open" (said hello, waiting for the welcome), "joined", "refused"
    state: "idle",
    // The room's time now (ms).
    now: () => Date.now() + offset,
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
      if (socket?.readyState !== 1 || api.state !== "joined") return false;
      socket.send(JSON.stringify(message));
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
      ws.send(JSON.stringify({ t: "hello", name, version, token: tokenOf(code) }));
      ping();
      clearInterval(pingTimer);
      pingTimer = setInterval(ping, 2000);
    });
    ws.addEventListener("message", (event) => {
      let m;
      try {
        m = JSON.parse(event.data);
      } catch {
        return;
      }
      if (m.t === "pong") return pong(m);
      if (m.t === "welcome") {
        tries = 0;
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
  function retry() {
    api.state = "connecting";
    emit("status", api);
    const wait = RETRY[Math.min(tries++, RETRY.length - 1)];
    retryTimer = setTimeout(connect, wait * 1000);
  }
  function ping() {
    if (socket?.readyState === 1) socket.send(JSON.stringify({ t: "ping", c: performance.now() }));
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
