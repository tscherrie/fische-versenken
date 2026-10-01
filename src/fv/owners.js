// Co-op, the enemies (plan, part 5: "Gegner haben einen Besitzer", "Eine Regie pro Gruppe",
// "Übergabe", "Schüsse sind Ereignisse"). Every page runs the enemies round its own fish;
// each enemy is run by exactly one page, its owner, and the others show it as a proxy,
// smoothed as the mates are (mates.js), aimed at and hit there but never run there. What
// goes between the pages is packed by wire.js; the room only passes it on.
//
//   The stream: each step's end, every 100 ms, the owner sends the enemies it runs that are
//   near a mate -- ten times a second within 25 u of one, five within 60, twice beyond, up
//   to 150 u (200 at sea), an enemy that has not changed only once a second. A mate who
//   has not heard of an enemy gets its intro (kind, size, strength) with its first record.
//
//   Shots: a player's weapons are replayed on the others' pages from its state (mates.js:
//   its triggers, its aim, how many shots it fired), for the eye only (weapons.js). The
//   shooter decides what its own shots hit, on proxies too, and reports that to everyone;
//   the owner applies it, decides the kill and tells everyone the enemy is sunk, so every
//   page shows the same death, and the kill and its reward are the shooter's.
//
//   The enemies' attacks: an owner's enemies go for the nearest fish, the mates' included
//   (as each mate's page last said where it was, moved on to now). Their rounds go out
//   seeded and fly the same on every page, re-aimed by the page whose fish they were meant
//   for; a strike at a mate goes out as it begins, and the mate's own page decides, against
//   the proxy as it is drawn there, whether it landed -- a dodge seen is a dodge made.
//
//   Hands: an enemy changes owner by a claim that carries its next version; the higher
//   version wins everywhere, the lower place a tie, whatever the pages' clocks say. The
//   owner hands its enemies on when it pauses, hides its tab, dies, swims far off, or when
//   an enemy is clearly after a mate (the mate then fights it without any lag); a page that
//   goes silent or leaves has its enemies claimed by the nearest player near them, and with
//   nobody near they vanish.
//
//   One director per group: players within 50 u of each other (apart again past 80) form a
//   group, and only its lowest able place sends enemies, for the whole room's numbers.
//
// Stays each page's own (enemies.js `shared` false): the larvae in the gravel, the shoal
// fish and what they turn into, the capsules. No friendly fire: a mate's replayed shots hurt
// nothing and push nobody.

import * as THREE from "three";
import { S, level, locate } from "../course.js";
import { KINDS } from "./kinds.js";
import { keyOf } from "./signals.js";
import { WEAPONS, createArsenal } from "./weapons.js";
import { MODES, createRecords, decodeWords, dir100, modeIndex, newer, packHeading, packMF, r2, readRecord, seeded, tables, unpackHeading, unpackMF } from "./wire.js";

// The stream (ms): a batch this often; an urgent one (a death, a claim, a shot) this soon
// after the last.
const TICK = 100;
const URGENT = 50;
// How far from a mate an enemy is sent (u): in the river, and at sea (the water is clearer
// there, and a sea salmon's laser reaches 114 u); the tiers of its rate (u, and ms).
const RADIUS = 150;
const SEA_RADIUS = 200;
const TIERS = [
  [25, 100],
  [60, 200],
  [Infinity, 500],
];
// An enemy that has not changed is sent again after this long (ms), to say it is still there.
const KEEP = 1000;
// Hands (u): a page takes an enemy over only this near its fish; an owner this far from its
// enemy hands it to a mate near it; an enemy after a mate this near it goes to that mate.
const TAKE = 60;
const FAR = 90;
const HUNT = 25;
// Groups (u): together within JOIN, apart again beyond PART.
const JOIN = 50;
const PART = 80;
// Timings (ms): how often the hands and groups are looked at; an owner silent this long
// has its enemies claimed (a page that is only slow for a moment -- building the river
// ahead, a line holding its messages back -- must not have them taken: a tab hidden or a
// page gone says so at once); a proxy with no record this long (from an owner still there)
// is dropped; nobody near an orphan this long, it vanishes; an enemy keeps its owner at
// least this long before it follows the fight.
const CHECK = 500;
const SILENT = 2000;
const STALE = 3000;
const VANISH = 4500;
const SETTLE = 3000;
// A proxy is shown this far in the past at least and at most (ms).
const SHOWN = [160, 900];
// A batch's records are cut at this many words (the room takes 16 KiB a message).
const MOST_WORDS = 4000;
// Modes an enemy cannot be handed over in the middle of (its strike, its aim or burst).
const MIDWAY = new Set(["coil", "strike", "aim", "fire"]);
const UP = new THREE.Vector3(0, 1, 0);

export function createOwners(game, combat, coop) {
  const { net, mates } = coop;
  const { enemies, firing, players, local } = combat;
  const T = tables(Object.keys(KINDS), Object.keys(WEAPONS));
  const targets = [local];
  const api = {};

  // ---- Where this page stands.
  const mySeat = () => net.seat ?? 0;
  let hidden = false,
    hiddenAt = 0,
    // (The fish's death while the tab was away, carried into the first step back.)
    awayCause = null,
    awayHitAt = 0;
  // Whether this page can run enemies and send them now: swimming, not paused, not away.
  const able = () => coop.hatched && !hidden && !game.now.paused && !local.down && game.now.dead <= 0 && !game.celebration?.active;

  // ---- The mates as players: `players` gets each as drawn (its weapons are replayed from
  // there), `targets` each as the enemies see it.
  const shooters = new Map();
  const hunted = new Map();
  function shooterOf(mate) {
    let p = shooters.get(mate.seat);
    if (!p) {
      p = {
        id: mate.seat,
        local: false,
        remote: true,
        fish: mate.drawn,
        drawn: mate.drawn,
        salmon: mate.salmon,
        arsenal: createArsenal(),
        aim: { point: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), target: null },
        down: false,
        away: false,
        safeUntil: 0,
        kills: 0,
        // What its page sent, as weapons.js replays it (per place: back, belly).
        // (`fired`: how many shots it has fired here, per place, for the tests.)
        replay: { on: [false, false], beam: [false, false], beamWas: [false, false], owed: [0, 0], gap: [0, 0], base: [null, null], reloading: [false, false], refill: [false, false], every: [false, false], fired: [0, 0], lastR: -Infinity, latch: 0, aimUntil: 0 },
      };
      p.arsenal.back = null;
      shooters.set(mate.seat, p);
    }
    return p;
  }
  function targetOf(mate) {
    let t = hunted.get(mate.seat);
    if (!t) hunted.set(mate.seat, (t = { id: mate.seat, local: false, remote: true, fish: mate.fish, drawn: mate.drawn, down: false, away: false, shun: false }));
    return t;
  }
  const mateOf = (seat) => mates.mates.get(seat);
  // A mate that can take enemies over now: there, heard from lately, swimming.
  // (Heard from within a second: a line holding its states back a moment is no reason to
  // pass it by.)
  const mateAble = (m) => !!m && m.connected !== false && !m.down && m.pz === 0 && performance.now() - m.heardAt < 1000;
  // A mate whose page has gone quiet: its enemies are orphans.
  const silent = (m) => !m || m.connected === false || m.pz === 2 || performance.now() - m.heardAt > SILENT;

  // ---- The enemies by id (rebuilt each step, and kept up as proxies come and go).
  const byId = new Map();
  function index() {
    byId.clear();
    for (const e of enemies.list) if (e.id > 0) byId.set(e.id, e);
  }
  // The last few hundred enemies sunk: a second word of one (two owners for a moment), or a
  // record of it coming late, changes nothing.
  const sunkIds = new Set();
  const sunkOrder = [];
  function sunkAdd(id) {
    if (sunkIds.has(id)) return false;
    sunkIds.add(id);
    sunkOrder.push(id);
    if (sunkOrder.length > 256) sunkIds.delete(sunkOrder.shift());
    return true;
  }
  // The intros heard of (kind, size, strength), kept a while for a mate's enemies not near
  // enough yet to be shown here.
  const intros = new Map();

  // ---- The batch out: the records of this page's enemies, intros, events.
  const records = createRecords();
  let introsOut = [],
    eventsOut = [],
    urgent = false,
    lastFlush = 0,
    lastTick = 0,
    lastCheck = 0;
  const origin = [0, 0, 0];
  // What went out, for the tests.
  const counts = { batches: 0, records: 0, claims: 0, hitsOut: 0, hitsIn: 0, sunkOut: 0, sunkIn: 0, promoted: 0, demoted: 0, orphans: 0, vanished: 0, proxies: 0, shotsOut: 0, strikesOut: 0, strikesIn: 0, strikesLanded: 0, bombsOut: 0, bombsIn: 0, touches: 0, lateHits: 0, lateOwn: 0 };
  // (For tests: the last changes of hand, why and when.)
  const log = [];
  const logged = (...what) => {
    log.push([Math.round(performance.now()), ...what]);
    if (log.length > 200) log.shift();
  };
  function event(ev, now = false) {
    eventsOut.push(ev);
    if (now) urgent = true;
  }
  function flush() {
    if (!records.length && !introsOut.length && !eventsOut.length) return;
    const m = { t: "ev", k: "w", r: Math.round(net.now()), o: origin.slice() };
    if (records.length) m.e = records.pack();
    if (introsOut.length) m.n = introsOut;
    if (eventsOut.length) m.x = eventsOut;
    net.send(m);
    // (This page's reports in it, by the batch's time: a claim's watermark counts in those.)
    for (const entry of ownSent) entry.r = m.r;
    ownSent.length = 0;
    counts.batches++;
    records.clear();
    introsOut = [];
    eventsOut = [];
    urgent = false;
    lastFlush = performance.now();
    settle();
  }
  // Where the next batch's places are counted from: this fish, to the whole unit. (Fixed from
  // one batch going out to the next: what is put in the batch meanwhile counts from it.)
  function settle() {
    const f = local.fish.position;
    origin[0] = Math.round(f.x);
    origin[1] = Math.round(f.y);
    origin[2] = Math.round(f.z);
  }

  // ---- The batches in, in the order they came (a message sent after another arrives after
  // it: the room passes each page's messages on in order).
  const inbox = [];
  // Per place: the room's time of the last batch taken in (what a claim's watermark says),
  // and how late its batches come (for how far in the past its enemies are shown).
  const seen = {};
  const lines = new Map();
  const lineOf = (seat) => {
    let l = lines.get(seat);
    if (!l) lines.set(seat, (l = { lateAvg: 100, lateDev: 30, heard: false }));
    return l;
  };
  net.on("ev", (m) => {
    if (m.k !== "w" || m.seat === net.seat) return;
    // (Away, the page cannot step: what only changes records is done at once.)
    if (hidden) return away(m);
    inbox.push(m);
    // (A page that stopped stepping without saying so -- frozen by the browser -- keeps
    // only so much.)
    if (inbox.length > 400) inbox.shift();
  });
  net.on("welcome", (m) => {
    // Back in the room after the line dropped: what was shown of the others may be stale.
    const again = enemies.seat === m.seat && enemies.room;
    local.id = m.seat;
    enemies.seat = m.seat;
    enemies.clock0 = m.clock0 || enemies.clock0;
    if (again) dropProxies();
  });
  net.on("start", (m) => {
    enemies.clock0 = m.clock0 || enemies.clock0;
  });
  net.on("left", (m) => {
    // (Its shots are counted afresh by a page loaded again: its replay starts from the next
    // count heard, or it would fire here what the old count was ahead of the new.)
    const shooter = shooters.get(m.seat);
    if (shooter) {
      shooter.replay.lastR = -Infinity;
      shooter.replay.owed[0] = shooter.replay.owed[1] = 0;
    }
    // Its enemies are orphans at once; it gets the intros again when it comes back.
    for (const e of enemies.list) {
      if (e.remote && e.owner === m.seat && e.net && !e.net.orphanAt) e.net.orphanAt = performance.now();
      if (!e.remote && e.net?.sentTo) e.net.sentTo &= ~(1 << m.seat);
    }
    links.delete(m.seat);
  });
  const wasConnected = new Map();
  net.on("lobby", (m) => {
    for (const s of m.seats) {
      if (s.seat === net.seat) continue;
      if (s.connected && wasConnected.get(s.seat) === false) for (const e of enemies.list) if (!e.remote && e.net?.sentTo) e.net.sentTo &= ~(1 << s.seat);
      wasConnected.set(s.seat, s.connected);
    }
  });

  // One batch: claims first (they say who runs what), deaths, hits, the enemies' shots and
  // strikes and bombs (onto their proxies' timelines), intros, records, and who wants intros.
  const rec = {};
  const mf = {};
  const heading = {};
  const tmp = new THREE.Vector3();
  function take(m) {
    const from = m.seat;
    const o = Array.isArray(m.o) ? m.o : [0, 0, 0];
    const late = net.now() - m.r;
    const line = lineOf(from);
    if (!line.heard) {
      line.heard = true;
      line.lateAvg = late;
    } else {
      line.lateAvg += (late - line.lateAvg) * 0.1;
      line.lateDev += (Math.abs(late - line.lateAvg) - line.lateDev) * 0.1;
    }
    const xs = Array.isArray(m.x) ? m.x : [];
    for (const ev of xs) if (ev[0] === "c") claimsIn(ev, from, o);
    for (const ev of xs) {
      if (ev[0] === "x") sunkIn(ev, from);
      else if (ev[0] === "g") goneIn(ev[1]);
      else if (ev[0] === "e") eatenIn(ev[1]);
    }
    for (const ev of xs) if (ev[0] === "h") hitIn(ev, from, m.r);
    for (const ev of xs) if (ev[0] === "s" || ev[0] === "k" || ev[0] === "b") timelineIn(ev, from, o);
    if (Array.isArray(m.n)) for (const n of m.n) intros.set(n[0], { k: n[1], size: n[2] / 100, maxHp: n[3] / 10, v: n[4] ?? 0, at: performance.now() });
    if (typeof m.e === "string") {
      const words = decodeWords(m.e);
      for (let at = 0; ; ) {
        const k = readRecord(words, at, rec);
        if (!k) break;
        at += k;
        recordIn(rec, from, m.r, o);
      }
    }
    for (const ev of xs) if (ev[0] === "w") for (const id of ev[1] ?? []) {
      const e = byId.get(id);
      if (e && !e.remote && e.net) e.net.sentTo &= ~(1 << from);
    }
    seen[from] = m.r;
  }

  // ---- Proxies.
  const proxyNet = () => ({ states: [], gap: 100, delay: 250, last: performance.now(), lastR: 0, queue: [], orphanAt: 0, hits: [], strikeUntil: 0, pending: 0, changedAt: performance.now(), hp: 1 });
  const ownedNet = () => ({ sentAt: -1e9, kept: -1e9, sentTo: 0, q: null, last3: [], changedAt: performance.now(), hunt: null, huntSince: 0 });
  // A record of an enemy from another page.
  const asked = new Map();
  let askFor = [];
  function recordIn(r, from, at, o) {
    if (sunkIds.has(r.id)) return;
    let e = byId.get(r.id);
    const x = o[0] + r.x,
      y = o[1] + r.y,
      z = o[2] + r.z;
    unpackMF(r.mf, mf);
    if (!e) {
      // (Only what is near enough to matter here.)
      const f = local.fish.position;
      if (Math.hypot(x - f.x, z - f.z) > radius(local.fish) + 30) return;
      const intro = intros.get(r.id);
      if (!intro) {
        if (performance.now() - (asked.get(r.id) ?? -1e9) > 1000) {
          asked.set(r.id, performance.now());
          askFor.push(r.id);
        }
        return;
      }
      e = enemies.proxy({ id: r.id, kind: T.kinds[intro.k], size: intro.size, maxHp: intro.maxHp, owner: from, version: Math.max(intro.v, mf.version) });
      if (!e) return;
      e.net = proxyNet();
      e.position.set(x, y, z);
      byId.set(e.id, e);
      counts.proxies++;
    }
    if (!e.shared) return;
    if (e.owner !== from) {
      // From a page that is not its owner here: only a newer version says it is that page's
      // now (a claim missed, the line having dropped) -- or the same version from a lower
      // place, as a claim of the same version from it would have won. (That only while the
      // owner here holds it by a claim of its own: a page given it by another holds it by
      // the giver's place, and a record does not say who gave it to its sender -- a claim
      // that lost to the gift would else win back with its sender's last records.)
      const same = (mf.version & 15) === (e.claim.v & 15) && from < e.owner && e.claim.by === e.owner;
      if (!same && !newer(mf.version, e.claim.v)) return;
      e.claim = { v: e.claim.v + ((mf.version - e.claim.v) & 15), by: same ? Math.min(from, e.claim.by) : from };
      e.owner = from;
      logged("record-newer", e.id, from, e.claim.v, e.remote ? "" : "demoted");
      if (!e.remote) {
        if (e.dead) return;
        demote(e);
      }
    }
    if (!e.remote || e.dead) return;
    const n = e.net;
    const list = n.states;
    if (list.length && at <= list[list.length - 1].r) {
      // (Out of order from the same page: dropped. From a new owner, whose clock of the room
      // is a little off the old one's: its states from now on.)
      if (list[list.length - 1].from === from) return;
      list.length = 0;
    }
    const s = list.length >= 8 ? list.shift() : {};
    s.from = from;
    s.r = at;
    s.x = x;
    s.y = y;
    s.z = z;
    s.heading = r.heading;
    s.mf = r.mf;
    s.hp = r.hp;
    s.extra = r.extra;
    list.push(s);
    if (n.lastR) n.gap += (Math.min(1000, at - n.lastR) - n.gap) * 0.2;
    n.lastR = at;
    n.last = performance.now();
    n.orphanAt = 0;
  }

  // Each step: every proxy where its owner had it a moment ago (as a mate is shown), and
  // what it did then -- its shots, strikes and bombs -- when that moment comes.
  const ha = new THREE.Vector3(),
    hb = new THREE.Vector3();
  function place(e, now, dt) {
    const n = e.net;
    const list = n.states;
    if (!list.length) return;
    const line = lineOf(e.owner);
    const want = Math.max(SHOWN[0], Math.min(SHOWN[1], line.lateAvg + 2 * line.lateDev + n.gap + 20));
    if (!n.placed) n.delay = want;
    n.delay += want > n.delay ? Math.min(want - n.delay, 1000 * dt) : Math.max(want - n.delay, -300 * dt);
    const at = now - n.delay;
    let a = list[0],
      b = list[list.length - 1];
    for (let i = list.length - 1; i > 0; i--)
      if (list[i - 1].r <= at) {
        a = list[i - 1];
        b = list[i];
        break;
      }
    const span = b.r - a.r;
    const k = span > 0 ? Math.min(1, Math.max(0, (at - a.r) / span)) : 1;
    const x = a.x + (b.x - a.x) * k,
      y = a.y + (b.y - a.y) * k,
      z = a.z + (b.z - a.z) * k;
    if (n.placed && span > 0 && k < 1) e.velocity.set(b.x - a.x, b.y - a.y, b.z - a.z).multiplyScalar(1000 / span);
    else if (!n.placed || k >= 1) e.velocity.set(0, 0, 0);
    e.speed = e.velocity.length();
    e.position.set(x, y, z);
    unpackHeading(a.heading, heading);
    ha.set(heading.x, heading.y, heading.z);
    unpackHeading(b.heading, heading);
    hb.set(heading.x, heading.y, heading.z);
    ha.lerp(hb, k);
    if (ha.lengthSq() < 1e-6) ha.copy(hb);
    ha.normalize();
    // What it is doing: as it was at that moment (the later state once past the newest).
    const s = k >= 1 ? b : a;
    unpackMF(s.mf, mf);
    const mode = MODES[mf.mode] ?? "approach";
    if (mode !== e.mode) {
      e.mode = mode;
      e.t = 0;
      // (Heard as its owner hears it: the wind-up of an aim, a blade swung.)
      const gun = e.spec.weapon;
      if (mode === "aim" && gun?.kind === "ranged") combat.enemyAims(e, gun, gun.tell);
      if (mode === "strike") combat.enemySwings(e);
    }
    e.target = mf.target < 0 ? null : mf.target === mySeat() ? local : hunted.get(mf.target) ?? null;
    e.rolling = mf.rolled;
    e.rising = mf.rising;
    if (mf.burning) firing.showBurning(e, 0.3);
    const hp = s.hp * e.maxHp;
    if (hp < e.hp - 1e-6) e.hitAt = game.now.time;
    e.hp = hp;
    const extra = a.extra === null || b.extra === null ? s.extra : a.extra + (b.extra - a.extra) * k;
    if (e.spec.wades) {
      // (A heron: the record's place is its legs', its heading its aim, its extra where it
      // faces.)
      e.aimDir.copy(ha);
      e.heading.set(0, 1, 0);
      if (extra !== null) e.facing.set(Math.cos(extra), 0, Math.sin(extra));
      e.stand.set(x, y - 0.5 * e.size, z);
    } else {
      e.heading.copy(ha);
      if (e.spec.weapon?.rear) e.rear = extra ?? 0;
      if (e.spec.behaviour === "bomber") e.bank = extra ?? 0;
      if (mode === "strike") e.strikeDir.copy(ha);
    }
    // (Where it is along the river, looked up again only once it has moved a little.)
    if ((x - (n.lx ?? 1e9)) ** 2 + (z - (n.lz ?? 1e9)) ** 2 > 0.25) {
      locate(x, z, e.river.s, e.river);
      n.lx = x;
      n.lz = z;
    }
    if (e.spec.wades) e.muzzle.set(e.stand.x + e.facing.x * 2, level(e.river.s) + e.spec.head, e.stand.z + e.facing.z * 2);
    n.placed = true;
    n.at = at;
    // Its events, as their moment comes on this timeline.
    while (n.queue.length && n.queue[0].time <= at) due(e, n.queue.shift());
    // (An event whose moment is long gone -- the proxy held while its owner fell silent -- is
    // dropped.)
    while (n.queue.length && n.queue[0].time < at - 3000) n.queue.shift();
  }

  function removeProxy(e) {
    enemies.remove(e);
    firing.forget(e);
    byId.delete(e.id);
  }
  // Every proxy dropped: they come back fresh with the next records (after an absence).
  function dropProxies() {
    for (const e of enemies.list.slice()) if (e.remote && !e.dead) removeProxy(e);
    intros.clear();
  }

  // ---- The enemies' shots, strikes and bombs.
  // (On the owner's page.) A shot of an enemy the others see: its seed, so its pellets fly
  // the same everywhere.
  api.shot = (e, dir, gun, seed) => {
    counts.shotsOut++;
    // (A shot at one of this page's school fish goes out as at nobody: no seat is meant.)
    const at = e.target && !e.target.school ? e.target.id : -1;
    event(["s", Math.round(net.now()), e.id, at, Math.round(dir.x * 1000), Math.round(dir.y * 1000), Math.round(dir.z * 1000), seed], true);
  };
  // A strike at a mate, as it begins (its page decides whether it lands); or, for a mate
  // whose page is away and cannot decide, a blow that landed here or a round that struck
  // it (`damage`).
  api.strike = (e, seat, damage = 0) => {
    if (!e.shared || e.remote) return;
    const mate = mateOf(seat);
    if (!damage && mate?.pz === 2) return;
    counts.strikesOut++;
    event(["k", Math.round(net.now()), e.id, seat, Math.round(damage * 1000), 0], true);
  };
  // The owner's enemy struck at a mate and reached where it thought the mate was: it goes to
  // recover (enemies.js), hurting nobody here. The moment goes out as a record of its own, so
  // that the proxy is drawn reaching that spot on the mate's page, which then decides: a mate
  // still there is struck, one that darted aside is not (the records otherwise come ten times
  // a second, and a strike's lunge is over between two of them). A mate's page that is away
  // cannot decide: this page says it landed.
  let reached = false;
  api.landed = (e, p) => {
    if (!e.shared || e.remote) return;
    if (p.away) {
      counts.strikesOut++;
      event(["k", Math.round(net.now()), e.id, p.id, 0, 1], true);
      return;
    }
    if (e.net) {
      e.net.sentAt = -1e9;
      e.net.q = null;
      reached = urgent = true;
    }
  };
  function bomb(e, b) {
    if (!e.shared || e.remote) return;
    counts.bombsOut++;
    event(["b", Math.round(net.now()), e.id, r2(b.position.x - origin[0]), r2(b.position.y - origin[1]), r2(b.position.z - origin[2]), r2(b.velocity.x), r2(b.velocity.y), r2(b.velocity.z), Math.round(b.depth * 10)], true);
  }
  enemies.onBomb = bomb;
  enemies.onGone = (e) => {
    if (e.id > 0) event(["g", e.id], true);
  };
  // Onto the proxy's timeline: it happens there when the proxy is seen to do it.
  function timelineIn(ev, from, o) {
    const e = byId.get(ev[2]);
    if (!e || !e.remote || e.dead || e.owner !== from) return;
    if (ev[0] === "k" && ev[3] !== mySeat()) return;
    // (A blow or a round for a page that was away, come in after it returned: too late.)
    if (ev[0] === "k" && (ev[4] || ev[5])) return;
    e.net.queue.push({ time: ev[1], ev, o });
  }
  const dirOf = new THREE.Vector3();
  const aimed = new THREE.Vector3();
  const muzzle = new THREE.Vector3();
  function due(e, { ev, o }) {
    const kind = ev[0];
    if (kind === "s") {
      const gun = e.spec.weapon;
      if (gun?.kind !== "ranged") return;
      dirOf.set(ev[4], ev[5], ev[6]).divideScalar(1000);
      // Meant for this fish: aimed at where it is here, ahead of it by the round's time.
      if (ev[3] === mySeat() && !local.down) {
        const f = local.fish;
        const from = e.muzzle ?? enemies.snout(e, muzzle);
        const d = f.position.distanceTo(from);
        aimed.copy(f.position).addScaledVector(f.velocity, Math.min(1.2, d / Math.max(1, gun.speed))).sub(from);
        if (aimed.lengthSq() > 1e-6) dirOf.copy(aimed).normalize();
      }
      if (dirOf.lengthSq() < 1e-6) return;
      dirOf.normalize();
      e.firedAt = game.now.time;
      combat.enemyShoots(e, dirOf, gun, seeded(ev[7]));
    } else if (kind === "k") {
      // A strike at this fish: it lands if the proxy's snout, as drawn here, reaches the fish
      // while it strikes (at most 1.2 s).
      counts.strikesIn++;
      e.net.strikeUntil = game.now.time + 1.2;
      e.net.strikeSeen = false;
    } else if (kind === "b") {
      const gun = e.spec.weapon;
      if (!gun || enemies.bombs.length >= 16) return;
      counts.bombsIn++;
      const position = new THREE.Vector3(o[0] + ev[3], o[1] + ev[4], o[2] + ev[5]);
      enemies.bombs.push({ position, velocity: new THREE.Vector3(ev[6], ev[7], ev[8]), source: e, gun, wet: false, fuse: gun.fuse[1], depth: ev[9] / 10, age: 0, s: e.river.s });
    }
  }
  // The strikes at this fish from enemies other pages run, decided here (plan: "Ob der eigene
  // Fisch getroffen wurde, entscheidet jeder selbst").
  const snout = new THREE.Vector3();
  function strikes(outcome) {
    const f = local.fish;
    const now = game.now.time;
    for (const e of enemies.list) {
      const n = e.net;
      if (!e.remote || e.dead || !n?.strikeUntil) continue;
      // (Called off: the fish is not there to strike, or this page stunned it or cut into
      // its strike a moment ago -- the Konter the player saw land wins.)
      if (local.down || f.safe || f.captive || f.airborne || now - (e.foiledAt ?? -9) < 0.5) {
        n.strikeUntil = 0;
        continue;
      }
      const L = f.length;
      enemies.snout(e, snout);
      // (As far as its snout reaches, and half the way the fish swam while the proxy is shown
      // late: the owner struck at where it last had the fish.)
      const reach = 0.12 + 0.3 * L + 0.06 * e.size + 0.5 * f.velocity.length() * Math.min(n.delay / 1000, 0.3);
      if (snout.distanceTo(f.position) < reach) {
        n.strikeUntil = 0;
        counts.strikesLanded++;
        combat.hurt(local, e, outcome);
        continue;
      }
      // (It ends with the strike as it is shown here, or when none is shown a moment on.)
      if (e.mode === "strike") n.strikeSeen = true;
      const striking = e.mode === "strike" || e.mode === "coil";
      if (now > n.strikeUntil || (n.strikeSeen && e.mode !== "strike") || (!striking && now > n.strikeUntil - 0.95)) {
        n.strikeUntil = 0;
        (outcome.whiffs ??= []).push({ key: keyOf(e.kind), kind: e.kind });
      }
    }
  }
  // A jellyfish another page runs, touched by this fish: this page sets its mine off at once
  // (it hurts this fish and blasts what this page runs) and tells its owner, who sinks it and
  // sets it off for the others.
  const bellTop = new THREE.Vector3(),
    mineFoot = new THREE.Vector3(),
    fishTail = new THREE.Vector3(),
    fishHead = new THREE.Vector3();
  function touches() {
    const f = local.fish;
    if (local.down || f.safe || f.captive || f.airborne) return;
    const L = f.length;
    for (const e of enemies.list) {
      if (!e.remote || e.dead || e.spec.weapon?.kind !== "contact") continue;
      if (e.position.distanceToSquared(f.position) > (e.size + L + 1) ** 2) continue;
      bellTop.copy(e.position).addScaledVector(e.heading, 0.4 * e.size);
      mineFoot.copy(e.position).addScaledVector(e.heading, -0.4 * e.size);
      fishTail.copy(f.position).addScaledVector(f.heading, -0.5 * L);
      fishHead.copy(f.position).addScaledVector(f.heading, 0.44 * L);
      if (gap(fishTail, fishHead, bellTop, mineFoot) >= e.spec.weapon.trigger + 0.08 * L + 0.16 * e.size) continue;
      sunkAdd(e.id);
      counts.touches++;
      logged("touch", e.id, e.owner);
      report(e, { owner: -1, amount: e.hp + 1, touch: true, force: true, weapon: "seamine", dir: UP });
      urgent = true;
      enemies.sink(e);
      combat.charges.push({ source: e, gun: e.spec.weapon, at: e.position.clone(), fuse: 0, body: true, by: -1 });
    }
  }
  const gU = new THREE.Vector3(),
    gV = new THREE.Vector3(),
    gW = new THREE.Vector3();
  function gap(a0, a1, b0, b1) {
    gU.subVectors(a1, a0);
    gV.subVectors(b1, b0);
    gW.subVectors(a0, b0);
    const a = gU.dot(gU),
      b = gU.dot(gV),
      c = gV.dot(gV),
      d = gU.dot(gW),
      f = gV.dot(gW);
    const den = a * c - b * b;
    let s = den > 1e-9 ? Math.min(1, Math.max(0, (b * f - c * d) / den)) : 0;
    let t = c > 1e-9 ? (b * s + f) / c : 0;
    if (t < 0) {
      t = 0;
      s = a > 1e-9 ? Math.min(1, Math.max(0, -d / a)) : 0;
    } else if (t > 1) {
      t = 1;
      s = a > 1e-9 ? Math.min(1, Math.max(0, (b - d) / a)) : 0;
    }
    return gW.addScaledVector(gU, s).addScaledVector(gV, -t).length();
  }

  // ---- Hits. The local player's shots on proxies, summed per enemy (and who is to have it)
  // until the next batch -- at once when they would sink it.
  const hitsOut = new Map();
  function report(e, hit) {
    if (!e.shared && !hit.touch) return;
    const by = hit.owner ?? local.id;
    const key = e.id * 8 + (by + 1);
    let h = hitsOut.get(key);
    if (!h) hitsOut.set(key, (h = { e, id: e.id, by, amount: 0, best: -1, weapon: null, dir: new THREE.Vector3(0, 1, 0), along: 0, hits: 0, shove: new THREE.Vector3(), stun: 0, panic: 0, ignite: 0, flags: 0 }));
    const amount = hit.amount ?? 0;
    if (amount > 0) {
      h.amount += amount;
      h.hits++;
      if (amount >= h.best) {
        h.best = amount;
        h.weapon = hit.weapon ?? h.weapon;
      }
    }
    if (hit.dir && hit.dir.lengthSq() > 1e-9) h.dir.copy(hit.dir).normalize();
    if (hit.point) {
      const along = tmp.subVectors(hit.point, e.position).dot(e.along ?? e.heading) / Math.max(0.01, e.size);
      h.along = Math.max(-0.5, Math.min(0.44, along));
    }
    if (hit.shove > 0 && hit.dir) h.shove.addScaledVector(hit.dir, hit.shove);
    if (hit.stun > 0) h.stun = Math.max(h.stun, hit.stun);
    if (hit.panic > 0) h.panic = Math.max(h.panic, hit.panic);
    if (hit.ignite > 0) h.ignite = Math.max(h.ignite, hit.ignite);
    h.flags |= (hit.force ? 1 : 0) | (hit.belly ? 2 : 0) | (hit.konter ? 4 : 0) | (hit.touch ? 8 : 0);
    if (e.net) {
      e.net.pending = (e.net.pending ?? 0) + amount;
      if (e.net.pending >= e.hp || hit.force) urgent = true;
    }
  }
  api.report = report;
  // This page's own reports are kept a second on the proxy, as the others' are (hitIn): if
  // it becomes this page's own while they are on their way, its old owner has not applied
  // them (it applies only what reached it while it ran the enemy, and its claim says up to
  // which of this page's batches that was), so this page applies them itself -- else the
  // shots fired at an enemy in the moment it is handed to the shooter would do nothing.
  const ownSent = [];
  function keepHit(e, entry) {
    const list = e.net.hits;
    list.push(entry);
    while (list.length && performance.now() - list[0].at > 1000) list.shift();
  }
  // (A report as firing.apply takes it.)
  function hitOf(h, weapon) {
    const shove = h.shove.length();
    return { amount: h.amount, dir: h.dir.clone(), point: null, weapon, force: !!(h.flags & 1), belly: !!(h.flags & 2), konter: !!(h.flags & 4), shove, shoveDir: shove > 1e-9 ? h.shove.clone().normalize() : null, stun: h.stun, panic: h.panic, ignite: h.ignite };
  }
  // (Become this page's own before its reports went: they are applied here, not sent.)
  function hitsHere(e) {
    for (const [key, h] of hitsOut)
      if (h.e === e) {
        hitsOut.delete(key);
        if (!(h.flags & 8) && !e.dead) firing.apply(h.by, e, hitOf(h, h.weapon ?? local.arsenal.back ?? "piu"));
      }
  }
  function hitsToBatch() {
    for (const h of hitsOut.values()) {
      const weapon = h.weapon ?? local.arsenal.back ?? "piu";
      const w = T.weaponIndex.get(weapon) ?? 0;
      const ev = ["h", h.id, h.by, Math.round(h.amount * 100), w, dir100(h.dir.x), dir100(h.dir.y), dir100(h.dir.z), h.flags, Math.round(h.along * 100), h.hits, Math.round(h.shove.x * 100), Math.round(h.shove.y * 100), Math.round(h.shove.z * 100), Math.round(h.stun * 10), Math.round(h.panic * 10), Math.round(h.ignite * 10)];
      // (Trailing noughts left off.)
      while (ev.length > 9 && ev[ev.length - 1] === 0) ev.pop();
      eventsOut.push(ev);
      counts.hitsOut++;
      if (h.e.net) h.e.net.pending = 0;
      if (h.e.remote && h.e.net?.hits && !(h.flags & 8)) {
        const entry = { from: mySeat(), r: 0, by: h.by, at: performance.now(), hit: hitOf(h, weapon) };
        keepHit(h.e, entry);
        ownSent.push(entry);
      }
    }
    hitsOut.clear();
  }
  // A report of a mate's hits: the splatter where it lands, on every page but the shooter's;
  // the hit itself by the enemy's owner, and kept a second on a proxy in case it becomes
  // this page's own (a claim on its way).
  const point = new THREE.Vector3();
  function hitIn(ev, from, r) {
    const [, id, by, amount = 0, wi = 0, dx = 0, dy = 100, dz = 0, flags = 0, along = 0, hits = 1, sx = 0, sy = 0, sz = 0, stun = 0, panic = 0, ignite = 0] = ev;
    const e = byId.get(id);
    if (!e) return;
    counts.hitsIn++;
    const weapon = T.weapons[wi] ?? "piu";
    const dir = new THREE.Vector3(dx, dy, dz);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const shove = new THREE.Vector3(sx, sy, sz).divideScalar(100);
    point.copy(e.position).addScaledVector(e.along ?? e.heading, (along / 100) * e.size);
    const hit = { amount: amount / 100, dir, point: point.clone(), weapon, force: !!(flags & 1), belly: !!(flags & 2), konter: !!(flags & 4), shove: shove.length(), shoveDir: shove.lengthSq() > 1e-9 ? shove.clone().normalize() : null, stun: stun / 10, panic: panic / 10, ignite: ignite / 10 };
    if (!(flags & 8) && !e.dead && hit.amount > 0) for (let i = 0; i < Math.min(3, hits); i++) combat.gore.hit?.(e, point, dir, weapon);
    if (e.dead) return;
    if (!e.remote) {
      if (!e.shared) return;
      if (flags & 8) {
        // A mate's fish touched this page's jellyfish: sunk, its mine going off here too.
        if (e.spec.weapon?.kind === "contact") {
          enemies.hit(e, e.hp + 1, null, -1);
          api.sunk(e, -1, UP, "seamine");
          combat.charges.push({ source: e, gun: e.spec.weapon, at: e.position.clone(), fuse: 0, body: true, by: -1 });
        }
        return;
      }
      firing.apply(by, e, hit);
      return;
    }
    keepHit(e, { from, r, by, hit, at: performance.now() });
  }

  // ---- Deaths.
  // (On the owner's page, from combat's onKill.) Sunk: every page shows it, and the kill is
  // the shooter's.
  api.sunk = (e, by, dir, weapon) => {
    if (!sunkAdd(e.id)) return;
    logged("sunk", e.id, by, e.claim?.v, weapon);
    counts.sunkOut++;
    event(["x", e.id, by, T.weaponIndex.get(weapon) ?? 0, dir100(dir?.x ?? 0), dir100(dir?.y ?? 1), dir100(dir?.z ?? 0), T.kindIndex.get(e.kind) ?? 0, Math.round(e.size * 100)], true);
  };
  function sunkIn(ev, from) {
    const [, id, by, wi, dx, dy, dz, ki, size] = ev;
    if (!sunkAdd(id)) return;
    logged("sunk-in", id, by, from, byId.get(id) ? (byId.get(id).remote ? "proxy" : byId.get(id).dead ? "dead" : "owned") : "none");
    counts.sunkIn++;
    const weapon = T.weapons[wi] ?? "piu";
    const dir = new THREE.Vector3(dx, dy, dz);
    if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
    dir.normalize();
    const e = byId.get(id);
    if (e && !e.dead) {
      // (Shown here as a body of this page's own from now on.)
      if (!e.remote) firing.forget(e);
      enemies.sink(e);
      combat.sunkShown(e, by, dir, weapon, null);
      return;
    }
    if (!e && by === mySeat()) {
      // Sunk by this page's shot, the proxy already gone here: the kill counts all the same.
      const spec = KINDS[T.kinds[ki]];
      if (!spec) return;
      local.kills++;
      combat.reward(local, { size: size / 100, spec });
      combat.hud.hit(true);
      combat.hud.say("Versenkt!", spec.title);
    }
  }
  function goneIn(id) {
    const e = byId.get(id);
    if (e && e.remote && !e.dead) removeProxy(e);
    intros.delete(id);
  }
  api.eaten = (e) => event(["e", e.id]);
  function eatenIn(id) {
    for (const e of enemies.list) if (e.id === id && e.dead) e.eaten = true;
  }

  // ---- Claims: who runs an enemy. A claim carries the enemy's next version; the higher
  // version wins, an equal one goes to the lower place, on every page alike -- so every page
  // comes to name the same owner once the claims are in, whatever their clocks say. A claim
  // made because of another always has the higher version.
  function claimItem(e, owner, v) {
    const b = firing.burning.get(e);
    const extra = e.spec.wades ? Math.atan2(e.facing.z, e.facing.x) : e.spec.weapon?.rear ? e.rear ?? 0 : e.spec.behaviour === "bomber" ? e.bank ?? 0 : null;
    const h = e.spec.wades ? e.aimDir : e.heading;
    return [e.id, owner, v, T.kindIndex.get(e.kind) ?? 0, Math.round(e.size * 100), Math.round(e.maxHp * 10), r2(e.position.x - origin[0]), r2(e.position.y - origin[1]), r2(e.position.z - origin[2]), packHeading(h.x, h.y, h.z), packMF(modeIndex(e.mode), -1, (e.rolled ?? 0) > 0.5, !!b, !!e.rising, v), Math.round((e.hp / e.maxHp) * 1000), Math.round((e.reload ?? 0) * 10), e.orbit ?? 1, Math.round((e.air ?? 0) * 10), b ? Math.round(b.left * 10) : 0, b ? b.owner : -1, extra === null ? null : Math.round(extra * 1000)];
  }
  let claimsOut = [];
  // Hand an enemy this page runs to `seat` (its version up by one): it is that page's from now.
  function assign(e, seat, why = "") {
    logged("give", e.id, seat, e.claim.v + 1, why);
    const v = e.claim.v + 1;
    claimsOut.push(claimItem(e, seat, v));
    e.claim = { v, by: mySeat() };
    e.owner = seat;
    demote(e);
  }
  // Take over an enemy nobody runs (its owner silent): this page's from now.
  function claim(e, why = "") {
    logged("claim", e.id, mySeat(), e.claim.v + 1, why);
    const v = e.claim.v + 1;
    const item = claimItem(e, mySeat(), v);
    claimsOut.push(item);
    e.claim = { v, by: mySeat() };
    e.owner = mySeat();
    counts.orphans++;
    promote(e, null, null);
  }
  function claimsToBatch() {
    if (!claimsOut.length) return;
    counts.claims += claimsOut.length;
    event(["c", claimsOut, { ...seen }], true);
    claimsOut = [];
  }
  function claimsIn(ev, issuer, o) {
    const [, items, wm] = ev;
    for (const item of items ?? []) {
      const [id, owner, v, ki, size100, maxHp10] = item;
      if (sunkIds.has(id)) continue;
      let e = byId.get(id);
      if (!e) {
        // (One not shown here yet: shown from the claim, if it is near enough to matter.)
        const f = local.fish.position;
        const x = o[0] + item[6],
          z = o[2] + item[8];
        if (owner !== mySeat() && Math.hypot(x - f.x, z - f.z) > radius(local.fish) + 30) {
          intros.set(id, { k: ki, size: size100 / 100, maxHp: maxHp10 / 10, v, at: performance.now() });
          continue;
        }
        e = enemies.proxy({ id, kind: T.kinds[ki], size: size100 / 100, maxHp: maxHp10 / 10, owner: issuer, version: -1 });
        if (!e) {
          // (Given to this page, whose crowd of that kind is full of living ones: it cannot
          // run it, so it says it is gone rather than leave the others a fish nobody runs.)
          if (owner === mySeat()) event(["g", id], true);
          continue;
        }
        e.net = proxyNet();
        byId.set(id, e);
        e.claim = { v: -1, by: 99 };
        stateFromClaim(e, item, o);
      }
      if (!(v > e.claim.v || (v === e.claim.v && issuer < e.claim.by))) {
        logged("claim-lost", id, owner, v, `by ${issuer}, held ${e.claim.v} by ${e.claim.by}`);
        continue;
      }
      logged("claim-in", id, owner, v, `by ${issuer}`);
      e.claim = { v, by: issuer };
      e.owner = owner;
      if (e.dead) continue;
      if (owner === mySeat() && e.remote) {
        stateFromClaim(e, item, o);
        promote(e, item, wm);
      } else if (owner !== mySeat() && !e.remote) demote(e);
      if (e.net) e.net.changedAt = performance.now();
    }
  }
  // The claim's own record of the enemy, as its newest state.
  function stateFromClaim(e, item, o) {
    const list = e.net.states;
    const s = list.length >= 8 ? list.shift() : {};
    s.from = -1;
    s.r = Math.max(net.now() - e.net.delay, (list[list.length - 1]?.r ?? 0) + 1);
    s.x = o[0] + item[6];
    s.y = o[1] + item[7];
    s.z = o[2] + item[8];
    s.heading = item[9];
    s.mf = item[10];
    s.hp = item[11] / 1000;
    s.extra = item[17] === null || item[17] === undefined ? null : item[17] / 1000;
    list.push(s);
  }
  // This page runs it now: from its freshest state (the drawn one kept as an offset that
  // fades), its throws and fire carried over, and the hits in flight that its old owner had
  // not yet taken.
  function promote(e, item, wm) {
    const n = e.net;
    const s = n.states[n.states.length - 1];
    const drawnX = e.position.x,
      drawnY = e.position.y,
      drawnZ = e.position.z;
    if (s) {
      e.position.set(s.x, s.y, s.z);
      unpackHeading(s.heading, heading);
      if (e.spec.wades) {
        e.aimDir.set(heading.x, heading.y, heading.z);
        e.heading.set(0, 1, 0);
        if (s.extra !== null) e.facing.set(Math.cos(s.extra), 0, Math.sin(s.extra));
      } else e.heading.set(heading.x, heading.y, heading.z);
      unpackMF(s.mf, mf);
      e.mode = MODES[mf.mode] ?? e.mode;
      e.hp = s.hp * e.maxHp;
    }
    (e.drawOffset ??= new THREE.Vector3()).set(drawnX - e.position.x, drawnY - e.position.y, drawnZ - e.position.z);
    if (e.drawOffset.lengthSq() > 25) e.drawOffset.set(0, 0, 0);
    enemies.promote(e, item ? { reload: item[12] / 10, orbit: item[13], air: item[14] / 10 } : {});
    // (The flames it was only shown in here are not a fire of this page's: that one burns
    // on only as the claim says, for whom it says.)
    if (firing.burning.get(e)?.owner === -1) firing.burning.delete(e);
    if (item && item[15] > 0) firing.burning.set(e, { left: item[15] / 10, owner: item[16] });
    const pending = n.hits;
    const lastR = n.lastR;
    e.net = ownedNet();
    e.net.sentTo = 0;
    counts.promoted++;
    for (const h of pending) {
      const applied = wm ? h.r <= (wm[h.from] ?? -Infinity) : h.r <= lastR;
      if (applied || e.dead) continue;
      firing.apply(h.by, e, h.hit);
      if (h.from === mySeat()) counts.lateOwn++;
      else counts.lateHits++;
    }
    hitsHere(e);
  }
  // Another page runs it now: shown here from the records this page last sent, so it goes on
  // moving through the moment until the new owner's come.
  function demote(e) {
    const last = e.net?.last3 ?? [];
    enemies.demote(e);
    firing.forget(e);
    e.net = proxyNet();
    for (const s of last) e.net.states.push(s);
    if (last.length) e.net.lastR = last[last.length - 1].r;
    counts.demoted++;
  }

  // ---- The stream of this page's enemies, each batch.
  const radius = (f) => ((f?.river?.s ?? 0) > S.coast ? SEA_RADIUS : RADIUS);
  const present = [];
  function stream() {
    present.length = 0;
    for (const m of mates.mates.values()) if (m.connected !== false && m.states.length && (performance.now() - m.heardAt < 2000 || m.pz === 2)) present.push(m);
    if (!present.length) return;
    const clock = performance.now();
    for (const e of enemies.list) {
      if (!e.shared || e.remote || e.dead || e.id <= 0) continue;
      const n = (e.net ??= ownedNet());
      // Who is near it, and how near the nearest.
      let nearest = Infinity,
        near = 0;
      for (const m of present) {
        const d = m.fish.position.distanceTo(e.position);
        if (d <= radius(m.fish)) near |= 1 << m.seat;
        if (d < nearest) nearest = d;
      }
      if (!near) continue;
      let every = 500;
      for (const [reach, ms] of TIERS)
        if (nearest <= reach) {
          every = ms;
          break;
        }
      if (clock - n.sentAt < every - 10) continue;
      const h = e.spec.wades ? e.aimDir : e.heading;
      const extra = e.spec.wades ? Math.atan2(e.facing.z, e.facing.x) : e.spec.weapon?.rear ? e.rear ?? 0 : e.spec.behaviour === "bomber" ? e.bank ?? 0 : null;
      // (A fish of this page's school is no seat: the others know nothing of the school, so
      // the enemy goes out as after nobody -- its id would not fit the word either.)
      const target = e.target && !e.target.school ? (e.target.local ? mySeat() : e.target.id) : -1;
      const from = records.length;
      const word = packMF(modeIndex(e.mode), target, (e.rolled ?? 0) > 0.5, firing.burning.has(e), !!e.rising, e.claim.v);
      if (!records.add(e.id, e.position.x - origin[0], e.position.y - origin[1], e.position.z - origin[2], packHeading(h.x, h.y, h.z), word, e.hp / e.maxHp, extra)) continue;
      const fresh = n.sentTo & near;
      if (fresh === near && records.same(from, n.q) && clock - n.kept < KEEP) {
        records.drop(from);
        n.sentAt = clock;
        continue;
      }
      n.q = records.copy(from, n.q);
      n.sentAt = n.kept = clock;
      counts.records++;
      // (Kept, the last three, to be shown from if it is handed on.)
      const s = n.last3.length >= 3 ? n.last3.shift() : {};
      s.from = mySeat();
      s.r = Math.round(net.now());
      s.x = e.position.x;
      s.y = e.position.y;
      s.z = e.position.z;
      s.heading = packHeading(h.x, h.y, h.z);
      s.mf = word;
      s.hp = e.hp / e.maxHp;
      s.extra = extra;
      n.last3.push(s);
      if ((n.sentTo & near) !== near) {
        introsOut.push([e.id, T.kindIndex.get(e.kind) ?? 0, Math.round(e.size * 100), Math.round(e.maxHp * 10), e.claim.v]);
        n.sentTo |= near;
      }
      if (records.length > MOST_WORDS) flush();
    }
  }

  // ---- Who runs what: handing on, taking over, letting go (every half second).
  function nearestAble(e, except = -1) {
    let best = null,
      bestD = TAKE;
    for (const m of mates.mates.values()) {
      if (m.seat === except || !mateAble(m)) continue;
      const d = m.fish.position.distanceTo(e.position);
      if (d < bestD) {
        bestD = d;
        best = m;
      }
    }
    return best;
  }
  const snapshot = [];
  function hands(now) {
    const me = able();
    const f = local.fish;
    snapshot.length = 0;
    for (const e of enemies.list) snapshot.push(e);
    // (What was heard of long ago and is not shown here is forgotten.)
    for (const [id, intro] of intros) if (now - intro.at > 60000 && !byId.has(id)) intros.delete(id);
    for (const [id, at] of asked) if (now - at > 10000) asked.delete(id);
    for (const e of snapshot) {
      if (e.dead || e.id <= 0) continue;
      if (e.shared && !e.remote) {
        const n = (e.net ??= ownedNet());
        // (How long it has been after the one it is after now.)
        if (e.target !== n.hunt) {
          n.hunt = e.target;
          n.huntSince = now;
        }
        if (!me) {
          // Paused, away, down, celebrating: to the nearest able mate near it, if any.
          const m = nearestAble(e);
          if (m) assign(e, m.seat, "not able");
          continue;
        }
        const dMe = f.position.distanceTo(e.position);
        const t = e.target;
        // After a mate, clearly nearer it than this fish, and not in the middle of a blow or
        // a burst: that mate runs it from now on and fights it without lag.
        if (t && !t.local && api.follow && now - n.changedAt > SETTLE && now - n.huntSince >= 1000 && !MIDWAY.has(e.mode) && mateAble(mateOf(t.id))) {
          const dT = t.fish.position.distanceTo(e.position);
          if (dT < HUNT && dT < 0.7 * dMe && dT < dMe - 3) {
            assign(e, t.id, `after it ${dT.toFixed(1)} u, me ${dMe.toFixed(1)} u`);
            continue;
          }
        }
        // This fish swam far off, a mate is near it.
        if (dMe > FAR) {
          const m = nearestAble(e);
          if (m && m.fish.position.distanceTo(e.position) < 0.6 * dMe) assign(e, m.seat, "far");
        }
        continue;
      }
      if (!e.remote || !e.net) continue;
      const n = e.net;
      const owner = mateOf(e.owner);
      // (Records stopped from an owner still there: out of its stream, gone here.)
      if (!silent(owner)) {
        n.orphanAt = 0;
        if (performance.now() - n.last > STALE || f.position.distanceTo(e.position) > radius(f) + 40) removeProxy(e);
        continue;
      }
      if (!n.orphanAt) n.orphanAt = performance.now();
      const waited = performance.now() - n.orphanAt;
      const dMe = f.position.distanceTo(e.position);
      if (me && dMe <= TAKE) {
        // The nearest able player takes it at once; any other near one a second later (two
        // at once settle by their claims).
        const m = nearestAble(e, e.owner);
        if (!m || m.fish.position.distanceTo(e.position) >= dMe || waited > 1000) claim(e, `owner ${e.owner} silent ${owner ? Math.round(performance.now() - owner.heardAt) : "?"} ms, pz ${owner?.pz}, connected ${owner?.connected}`);
        continue;
      }
      if (waited > VANISH && !nearestAble(e, e.owner)) {
        counts.vanished++;
        logged("vanish", e.id, e.owner, Math.round(dMe));
        removeProxy(e);
      }
    }
  }

  // ---- Groups and the director.
  const links = new Set();
  let groupSeats = new Set([0]);
  let directs = true;
  function groups() {
    const f = local.fish;
    const me = mySeat();
    const fresh = [];
    for (const m of mates.mates.values()) {
      const there = m.connected !== false && m.states.length && (performance.now() - m.heardAt < 2000 || m.pz === 2);
      if (!there) {
        links.delete(m.seat);
        continue;
      }
      fresh.push(m);
      const d = m.fish.position.distanceTo(f.position);
      if (links.has(m.seat)) {
        if (d > PART) links.delete(m.seat);
      } else if (d <= JOIN) links.add(m.seat);
    }
    // A pair is together when either says so (each by its own view, with its own lag), so
    // both pages build the same groups.
    const linked = (a, b) => {
      if (a === me) return links.has(b) || !!((mateOf(b)?.last?.lk ?? 0) & (1 << me));
      if (b === me) return linked(b, a);
      return !!((mateOf(a)?.last?.lk ?? 0) & (1 << b)) || !!((mateOf(b)?.last?.lk ?? 0) & (1 << a));
    };
    const group = new Set([me]);
    const queue = [me];
    while (queue.length) {
      const a = queue.shift();
      for (const m of fresh)
        if (!group.has(m.seat) && linked(a, m.seat)) {
          group.add(m.seat);
          queue.push(m.seat);
        }
    }
    groupSeats = group;
    // Its lowest able place sends the enemies; with nobody able, its lowest place, holding
    // back while it cannot play.
    let lowest = Infinity;
    for (const s of group) if (s === me ? able() : mateAble(mateOf(s))) lowest = Math.min(lowest, s);
    if (lowest === Infinity) for (const s of group) lowest = Math.min(lowest, s);
    directs = lowest === me;
    if (directs && !able()) combat.director.hold(1);
  }
  const linkMask = () => {
    let k = 0;
    for (const s of links) k |= 1 << s;
    return k;
  };

  // ---- The co-op pause (plan: "Die Welt läuft für die anderen weiter. Der eigene Fisch steht
  // fest im Wasser ... ist aber nicht geschützt"): in a room the world goes on behind the
  // pause card; the fish stands where it was when the pause began -- only across the water
  // while it is still in the air from a jump, then there in the water, where the enemies can
  // reach it -- and its strength and hunger are held, so a break does not starve it, though
  // whatever the enemies do to it counts.
  let pinned = null;
  let held = null;
  api.pin = () => {
    const f = local.fish;
    if (!game.now.paused || !coop.hatched) {
      pinned = null;
      return;
    }
    if (!pinned) pinned = { x: f.position.x, y: f.airborne ? null : f.position.y, z: f.position.z };
    if (pinned.y === null && !f.airborne) pinned.y = f.position.y;
    f.position.x = pinned.x;
    f.position.z = pinned.z;
    if (pinned.y !== null) f.position.y = pinned.y;
    if (pinned.y !== null) f.velocity?.set(0, 0, 0);
    f.relative?.set(0, 0, 0);
    if (held) {
      f.energy = held.energy;
      f.hunger = held.hunger;
      f.starving = held.starving;
      f.stomach = held.stomach;
    }
  };
  api.hold = () => {
    const f = local.fish;
    held = game.now.paused && coop.hatched ? { energy: f.energy, hunger: f.hunger, starving: f.starving, stomach: f.stomach } : null;
  };

  // ---- Away: the tab hidden (or the page going). The page can no longer step: what it runs
  // goes to able mates near it at once, its last state says it is away, and what comes in
  // meanwhile that only changes records is done as it comes.
  function goAway() {
    if (hidden || !coop.hatched) return;
    hidden = true;
    hiddenAt = performance.now();
    for (const e of enemies.list) {
      if (!e.shared || e.remote || e.dead || e.id <= 0) continue;
      const m = nearestAble(e);
      if (m) assign(e, m.seat, "away");
    }
    claimsToBatch();
    flush();
    mates.send(local, stateExtra(2), true);
  }
  function comeBack() {
    if (!hidden) return;
    hidden = false;
    // (Long away: whatever was shown of the others is stale.)
    if (performance.now() - hiddenAt > 1500) dropProxies();
    for (const e of enemies.list) if (!e.remote && e.net?.sentTo) e.net.sentTo = 0;
  }
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => (document.hidden ? goAway() : comeBack()));
    window.addEventListener("pagehide", goAway);
  }
  // A batch while away: claims, deaths and goings done at once; hits on what this page runs
  // taken; a blow or a round at this fish from an owner that saw it land; the rest dropped
  // (nobody watches this page's timelines now).
  function away(m) {
    index();
    const from = m.seat;
    const o = Array.isArray(m.o) ? m.o : [0, 0, 0];
    const xs = Array.isArray(m.x) ? m.x : [];
    for (const ev of xs) if (ev[0] === "c") claimsIn(ev, from, o);
    for (const ev of xs) {
      if (ev[0] === "x") sunkIn(ev, from);
      else if (ev[0] === "g") goneIn(ev[1]);
      else if (ev[0] === "h") {
        const e = byId.get(ev[1]);
        if (e && !e.remote) hitIn(ev, from, m.r);
      } else if (ev[0] === "k" && ev[3] === mySeat() && (ev[4] || ev[5])) awayHurt(byId.get(ev[2]), ev[4] / 1000, !!ev[5]);
    }
    if (typeof m.e === "string") {
      const words = decodeWords(m.e);
      for (let at = 0; ; ) {
        const k = readRecord(words, at, rec);
        if (!k) break;
        at += k;
        const e = byId.get(rec.id);
        // (Only whether one this page runs is another's now.)
        if (e && !e.remote && !e.dead && e.shared) recordIn(rec, from, m.r, o);
      }
    }
    seen[from] = m.r;
    // (A death the hits just caused, or a jellyfish set off, goes out now: no step will send
    // it while the tab is away, and meanwhile a mate near it would claim a fish already sunk.)
    if (urgent) {
      claimsToBatch();
      flush();
    }
  }
  // A blow or a round at this fish while the tab is away: its strength goes as it would have;
  // with none left the fish dies as the tab comes back.
  function awayHurt(e, damage, blow) {
    const f = local.fish;
    if (local.down || game.now.dead > 0 || f.safe) return;
    const clock = performance.now();
    if (clock - awayHitAt < 120) return;
    awayHitAt = clock;
    const level = combat.difficulty.level;
    if (blow && e) {
      const melee = e.spec.weapon?.kind === "melee" ? e.spec.weapon : null;
      if (e.spec.swallows && e.size >= 2.2 * f.length && level.swallow) {
        awayCause = e.spec.name;
        f.energy = 0;
      } else damage = melee ? melee.damage : e.spec.bite * Math.max(0.25, Math.min(1, e.size / f.length));
    }
    f.energy = Math.max(0, f.energy - damage * level.taken);
    if (f.energy <= 0 && !awayCause) awayCause = e?.spec.weapon?.cause ?? e?.spec.name ?? "Im Kampf unterlegen";
    if (f.energy <= 0) mates.send({ ...local, down: true }, stateExtra(2), true);
  }

  // ---- The state this page sends with its fish: its triggers, aim, shots, magazines, its
  // pause or absence, the places it swims together with.
  const extra = {};
  let aimUntil = 0;
  function stateExtra(pz) {
    const a = local.arsenal;
    const pulls = local.pulls ?? 0,
      pulled = local.pulled ?? 0;
    extra.tr = (pulls & 15) | ((pulled & 15) << 4);
    const now = performance.now();
    if (pulls || pulled) aimUntil = now + 1000;
    const aim = combat.aim;
    if (now < aimUntil && aim.point) {
      extra.a = [r2(aim.point.x), r2(aim.point.y), r2(aim.point.z)];
      extra.ag = aim.target && !aim.target.dead && aim.target.id > 0 ? aim.target.id : null;
    } else extra.a = extra.ag = null;
    const t = local.tally ?? [0, 0];
    extra.n = t[0] || t[1] ? [t[0], t[1]] : null;
    extra.rl = ((a.back && a.reloading[a.back] > 0 ? 1 : 0) | (a.belly && a.reloading[a.belly] > 0 ? 2 : 0)) || null;
    extra.lc = a.back === "katana" || a.belly === "katana" ? (local.fish.lungeCount ?? 0) % 1000 : null;
    extra.pz = pz;
    extra.sf = local.fish.safe ? 1 : null;
    extra.lk = linkMask() || null;
    return extra;
  }

  // ---- The mates' weapons, replayed: what their states say, as the moment each is drawn at
  // passes it.
  function replayed(p, mate) {
    const r = p.replay;
    const a = p.arsenal;
    const at = net.now() - mate.delay;
    for (const st of mate.states) {
      if (st.r <= r.lastR) continue;
      if (st.r > at) break;
      if (r.lastR === -Infinity) {
        // (The first state seen: what it had fired before is not fired again here.)
        r.base = [st.n?.[0] ?? 0, st.n?.[1] ?? 0];
      }
      for (let k = 0; k < 2; k++) {
        const place = k ? "belly" : "back";
        const id = (k ? st.bl : st.bk) ?? null;
        if (a[place] !== id) {
          a[place] = id;
          a.ensure(id);
          r.owed[k] = 0;
          r.base[k] = st.n?.[k] ?? 0;
        }
        const n = st.n?.[k] ?? 0;
        const w = WEAPONS[id];
        r.owed[k] = Math.min(r.owed[k] + ((n - (r.base[k] ?? n)) & 255), w ? Math.ceil(0.5 / (w.interval ?? 0.1)) + 1 : 0);
        r.base[k] = n;
        const reloading = !!((st.rl ?? 0) & (k ? 2 : 1));
        if (r.reloading[k] && !reloading) r.refill[k] = true;
        r.reloading[k] = reloading;
      }
      r.latch |= ((st.tr ?? 0) >> 4) & 15;
      r.now = (st.tr ?? 0) & 15;
      if (st.a) {
        p.aim.point.set(st.a[0], st.a[1], st.a[2]);
        r.aimed = true;
      } else r.aimed = false;
      p.aim.target = st.ag ? byId.get(st.ag) ?? null : null;
      r.lastR = st.r;
    }
    const bits = (r.now ?? 0) | r.latch;
    r.latch = 0;
    r.on[0] = !!(bits & 1);
    r.on[1] = !!(bits & 2);
    r.beam[0] = !!(bits & 4);
    r.beam[1] = !!(bits & 8);
    const d = mate.drawn;
    if (!r.aimed) p.aim.point.copy(d.position).addScaledVector(d.heading, 20 * Math.max(0.3, d.length));
    p.aim.direction.subVectors(p.aim.point, d.position);
    if (p.aim.direction.lengthSq() < 1e-6) p.aim.direction.copy(d.heading);
    p.aim.direction.normalize();
    if (p.aim.target?.dead) p.aim.target = null;
  }

  // ---- Each step, in combat's order.
  // Before anything fires or moves: what came in, the mates and the proxies where they are
  // shown, the strikes at this fish, and a death that happened while away.
  api.before = (dt, outcome) => {
    // (Until all have hatched there is nothing to share: a page started for a test runs its
    // river before that.)
    if (!coop.hatched) return;
    enemies.room = true;
    enemies.seat = mySeat();
    local.id = mySeat();
    enemies.now = net.now;
    index();
    for (let i = 0; i < inbox.length; i++) take(inbox[i]);
    inbox.length = 0;
    mates.update(dt);
    players.length = 1;
    targets.length = 1;
    for (const mate of mates.mates.values()) {
      if (!mate.states.length || mate.connected === false) continue;
      const p = shooterOf(mate),
        t = targetOf(mate);
      p.down = t.down = mate.down;
      p.away = t.away = mate.pz === 2;
      t.shun = mate.shun;
      players.push(p);
      targets.push(t);
    }
    const now = net.now();
    for (const e of enemies.list) if (e.remote && !e.dead && e.net) place(e, now, dt);
    strikes(outcome);
    touches();
    if (awayCause && game.now.dead <= 0) {
      outcome.killed = awayCause;
      awayCause = null;
    }
  };
  // Right after the local player's weapons: the mates' replayed.
  api.replays = (dt) => {
    if (!coop.hatched) return;
    for (const p of players) {
      if (p.local) continue;
      const mate = mateOf(p.id);
      if (!mate) continue;
      replayed(p, mate);
      if (!p.down) firing.fire(p, dt, null, true);
    }
  };
  // At the step's end: the hands and groups now and then, the stream, the batch out, and the
  // state of this page's fish.
  api.after = () => {
    if (!coop.hatched) return;
    const clock = performance.now();
    if (clock - lastCheck >= CHECK) {
      lastCheck = clock;
      hands(clock);
      groups();
    }
    claimsToBatch();
    if (clock - lastTick >= TICK || reached) {
      if (!reached) lastTick = clock;
      reached = false;
      stream();
      hitsToBatch();
      if (askFor.length) {
        eventsOut.push(["w", askFor]);
        askFor = [];
      }
      flush();
    } else if (urgent && clock - lastFlush >= URGENT) {
      hitsToBatch();
      flush();
    }
    // (A stage's celebration is said as a pause: this page hands its enemies on while it
    // lasts, and a mate handing them back meanwhile would only have them handed on again.)
    if (mates.due() && mates.send(local, stateExtra(game.now.paused || game.celebration?.active ? 1 : 0))) local.pulled = 0;
  };

  // ---- What combat and the director ask.
  Object.defineProperties(api, {
    // (A test may keep this page's director quiet: api.devQuiet.)
    directs: { get: () => directs && !api.devQuiet && coop.hatched },
    // The whole room's players (the enemies come for as many), connected now.
    roomSize: {
      get: () => {
        let n = 1;
        for (const m of mates.mates.values()) if (m.connected !== false && m.states.length) n++;
        return n;
      },
    },
    // In a room the world goes on behind the pause card.
    running: { get: () => coop.hatched },
    hidden: { get: () => hidden },
  });
  // Whether the director counts an enemy: its group's (what it runs, and what the others of
  // its group run).
  api.counts = (e) => !e.remote || groupSeats.has(e.owner);
  // Whether an enemy goes to the mate it is after (a test may watch one attack a mate's fish
  // from here instead).
  api.follow = true;
  api.counters = counts;
  // (For tests: why an enemy this page runs stays with it.)
  api.why = (id) => {
    const e = byId.get(id) ?? enemies.list.find((x) => x.id === id);
    if (!e || e.remote || !e.net) return null;
    const t = e.target;
    const now = performance.now();
    return { mode: e.mode, target: t ? (t.local ? "me" : t.id) : null, dMe: +local.fish.position.distanceTo(e.position).toFixed(1), dT: t && !t.local ? +t.fish.position.distanceTo(e.position).toFixed(1) : null, settled: Math.round(now - e.net.changedAt), hunting: Math.round(now - e.net.huntSince), mateAble: t && !t.local ? mateAble(mateOf(t.id)) : null, heard: t && !t.local ? Math.round(now - (mateOf(t.id)?.heardAt ?? 0)) : null, follow: api.follow };
  };
  api.shooters = shooters;
  api.log = log;
  api.links = links;
  api.groupSeats = () => [...groupSeats];
  // (For tests.)
  api.goAway = goAway;
  api.comeBack = comeBack;
  combat.join(api, targets);
  // (This page's state goes out from here, with the fight's part: api.after.)
  coop.byOwners = true;
  enemies.room = true;
  enemies.now = net.now;
  settle();
  return api;
}
