// The room service of Salmon Survival Extreme (plan, part 5): a Worker that opens rooms and
// one Durable Object per room. The room keeps the lobby (who sits in which of the four
// places, their nicknames, who is ready, which version of the game they run), starts the
// game for everyone at once, gives the day's clock, and passes on what each player sends --
// their fish twenty times a second, and events (shots, hits, deaths) -- to the others. It
// computes nothing of the game itself: every player's own browser simulates its own
// surroundings; the room is only the relay and the memory of the places.
//
// The protocol, one JSON object per WebSocket message, `t` its type:
//   player -> room: hello {name, version, token?}, ready {ready}, name {name},
//                   state {...} (relayed), ev {..., to?} (relayed), ping {c}
//   room -> player: welcome {seat, token, code, host, started, startAt, clock0, now, seats},
//                   lobby {seats, host}, start {at, clock0}, state {seat, ...},
//                   ev {seat, ...}, pong {c, s}, left {seat}, refused {reason}
// A place (`seat`, 0-3) is held by a token the player keeps; coming back with it within 30
// minutes, or on another evening, gives the same place back, with the fish where it was.
// The room forgets everything 30 days after it was last played in.

import { DurableObject } from "cloudflare:workers";

const SEATS = 4;
// How long a room is kept after its last game (ms).
const KEEP = 30 * 24 * 3600 * 1000;
// From the moment everyone is ready to the hatch (ms): time for a countdown everywhere.
const COUNTDOWN = 3500;
// Guards: the longest message taken, and how many a player may send in a second.
const MAX_MESSAGE = 16 * 1024;
const MAX_RATE = 90;
// How often a player's last state is written down for when they come back (ms).
const KEEP_STATE = 5000;
const CODE_LETTERS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function newCode() {
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let code = "";
  for (const b of bytes) code += CODE_LETTERS[b % CODE_LETTERS.length];
  return code;
}
const freshRoom = (code) => ({ code, host: null, version: null, started: false, startAt: 0, clock0: 0, seats: {} });
const validCode = (code) => typeof code === "string" && /^[A-Z2-9]{6}$/.test(code);
// A nickname: printable, trimmed, at most 16 characters.
const cleanName = (name) =>
  String(name ?? "")
    .replace(/[\u0000-\u001f\u007f-\u009f<>]/g, "")
    .trim()
    .slice(0, 16) || "Lachs";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });
    // A new room: only its code; the room itself comes into being with its first player.
    if (url.pathname === "/rooms/new") return Response.json({ code: newCode() }, { headers: cors });
    const match = url.pathname.match(/^\/rooms\/([A-Za-z2-9]{6})\/ws$/);
    if (match) {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("WebSocket expected", { status: 426, headers: cors });
      const code = match[1].toUpperCase();
      const stub = env.ROOMS.get(env.ROOMS.idFromName(code));
      const inner = new URL(request.url);
      inner.searchParams.set("code", code);
      return stub.fetch(new Request(inner, request));
    }
    if (url.pathname === "/" || url.pathname === "/health") return Response.json({ ok: true, service: "salmon-survival-extreme rooms" }, { headers: cors });
    return new Response("Not found", { status: 404, headers: cors });
  },
};

export class Room extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    // What the room remembers (storage "room"): its code, the version the host runs, whether
    // the game has started and when, and the places.
    this.room = null;
    // Per place, the last state as it came (not written down every time) and when it was.
    this.latest = new Map();
    this.written = new Map();
    // Per socket, how many messages in the current second.
    this.rate = new Map();
    ctx.blockConcurrencyWhile(async () => {
      this.room = (await ctx.storage.get("room")) ?? null;
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const code = url.searchParams.get("code");
    if (!validCode(code)) return new Response("Bad room", { status: 400 });
    // (Written down at once: the room may be put to sleep before the first hello, and wakes
    // with only what is stored.)
    if (!this.room) {
      this.room = freshRoom(code);
      await this.ctx.storage.put("room", this.room);
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    // (The place is only known once the player says hello.)
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ seat: null, code });
    return new Response(null, { status: 101, webSocket: client });
  }

  // ---- Helpers.
  seatOf(ws) {
    return ws.deserializeAttachment()?.seat ?? null;
  }
  socketsOf(seat) {
    return this.ctx.getWebSockets().filter((ws) => this.seatOf(ws) === seat);
  }
  connected(seat, except = null) {
    return this.socketsOf(seat).some((ws) => ws !== except);
  }
  send(ws, message) {
    try {
      ws.send(typeof message === "string" ? message : JSON.stringify(message));
    } catch {
      // (A socket closing under us: the close handler cleans up.)
    }
  }
  broadcast(message, except = null) {
    const text = JSON.stringify(message);
    for (const ws of this.ctx.getWebSockets()) if (ws !== except && this.seatOf(ws) !== null) this.send(ws, text);
  }
  seatsView() {
    const out = [];
    for (const [seat, s] of Object.entries(this.room.seats)) out.push({ seat: Number(seat), name: s.name, ready: !!s.ready, version: s.version, connected: this.connected(Number(seat)), last: s.last ?? null });
    return out.sort((a, b) => a.seat - b.seat);
  }
  async save() {
    await this.ctx.storage.put("room", this.room);
    // Forgotten a month after the last game.
    await this.ctx.storage.setAlarm(Date.now() + KEEP);
  }
  lobby() {
    this.broadcast({ t: "lobby", seats: this.seatsView(), host: this.room.host });
  }

  // ---- The messages.
  async webSocketMessage(ws, data) {
    if (typeof data !== "string" || data.length > MAX_MESSAGE) return;
    // (Flooding is dropped, not answered.)
    const now = Date.now();
    const r = this.rate.get(ws);
    if (!r || now - r.since > 1000) this.rate.set(ws, { since: now, n: 1 });
    else if (++r.n > MAX_RATE) return;
    let m;
    try {
      m = JSON.parse(data);
    } catch {
      return;
    }
    if (!m || typeof m.t !== "string") return;
    // (A room forgotten while a socket was still open -- the month ran out -- starts afresh.)
    if (!this.room) this.room = freshRoom(ws.deserializeAttachment()?.code ?? "");
    const seat = this.seatOf(ws);
    if (m.t === "ping") return this.send(ws, { t: "pong", c: m.c, s: now });
    if (seat === null) {
      if (m.t === "hello") await this.hello(ws, m);
      return;
    }
    const s = this.room.seats[seat];
    if (!s) return;
    switch (m.t) {
      case "state": {
        m.seat = seat;
        this.latest.set(seat, m);
        const text = JSON.stringify(m);
        for (const other of this.ctx.getWebSockets()) {
          const o = this.seatOf(other);
          if (other !== ws && o !== null && o !== seat) this.send(other, text);
        }
        // (Written down now and then, for a player who comes back.)
        if (now - (this.written.get(seat) ?? 0) > KEEP_STATE) {
          this.written.set(seat, now);
          s.last = m;
          s.seen = now;
          await this.ctx.storage.put("room", this.room);
        }
        return;
      }
      case "ev": {
        m.seat = seat;
        const to = Number.isInteger(m.to) ? m.to : null;
        const text = JSON.stringify(m);
        for (const other of this.ctx.getWebSockets()) {
          const o = this.seatOf(other);
          if (other === ws || o === null || o === seat) continue;
          if (to !== null && o !== to) continue;
          this.send(other, text);
        }
        return;
      }
      case "ready": {
        s.ready = !!m.ready;
        await this.maybeStart(now);
        await this.save();
        this.lobby();
        return;
      }
      case "name": {
        s.name = cleanName(m.name);
        await this.save();
        this.lobby();
        return;
      }
    }
  }

  // A player says who they are: the place their token holds, or a free one.
  async hello(ws, m) {
    const version = String(m.version ?? "").slice(0, 40);
    let seat = null;
    if (typeof m.token === "string") for (const [k, s] of Object.entries(this.room.seats)) if (s.token === m.token) seat = Number(k);
    if (seat === null) {
      for (let k = 0; k < SEATS; k++)
        if (!this.room.seats[k]) {
          seat = k;
          break;
        }
      // A place whose player has been gone longest, if every place is taken but not in use.
      if (seat === null && !this.room.started)
        for (let k = 0; k < SEATS; k++)
          if (!this.connected(k)) {
            seat = k;
            break;
          }
      if (seat === null) {
        this.send(ws, { t: "refused", reason: "full" });
        ws.close(4000, "full");
        return;
      }
      this.room.seats[seat] = { name: cleanName(m.name), token: crypto.randomUUID(), ready: false, version, last: null, seen: Date.now() };
    }
    const s = this.room.seats[seat];
    s.name = m.name ? cleanName(m.name) : s.name;
    s.version = version;
    // The first to come is the host; the host's version is the room's.
    if (this.room.host === null) {
      this.room.host = seat;
      this.room.version = version;
    }
    // (One socket per place: an older one of the same place is closed.)
    for (const old of this.socketsOf(seat)) old.close(4001, "replaced");
    ws.serializeAttachment({ seat, code: this.room.code });
    await this.save();
    this.send(ws, { t: "welcome", seat, token: s.token, code: this.room.code, host: this.room.host, version: this.room.version, started: this.room.started, startAt: this.room.startAt, clock0: this.room.clock0, now: Date.now(), seats: this.seatsView() });
    // The others hear of the newcomer, and the newcomer hears where the others are.
    this.lobby();
    for (const [k, last] of this.latest) if (k !== seat) this.send(ws, last);
  }

  // Everyone in the room is ready (and at least one is there): the countdown begins.
  async maybeStart(now) {
    if (this.room.started) return;
    const present = Object.entries(this.room.seats).filter(([k]) => this.connected(Number(k)));
    if (!present.length || !present.every(([, s]) => s.ready)) return;
    this.room.started = true;
    this.room.startAt = now + COUNTDOWN;
    this.room.clock0 = this.room.startAt;
    this.broadcast({ t: "start", at: this.room.startAt, clock0: this.room.clock0, now });
  }

  async webSocketClose(ws) {
    const seat = this.seatOf(ws);
    this.rate.delete(ws);
    if (seat === null) return;
    // (The place stays the player's; the others are told they are gone for now. The closing
    // socket may still be listed while this runs.)
    if (!this.connected(seat, ws)) {
      const s = this.room.seats[seat];
      const last = this.latest.get(seat);
      if (s && last) s.last = last;
      if (s) s.seen = Date.now();
      await this.save();
      this.broadcast({ t: "left", seat });
      this.lobby();
    }
  }
  async webSocketError(ws) {
    await this.webSocketClose(ws);
  }

  async alarm() {
    // A month without a game: the room is forgotten.
    if (this.ctx.getWebSockets().length) return this.ctx.storage.setAlarm(Date.now() + KEEP);
    await this.ctx.storage.deleteAll();
    this.room = null;
  }
}
