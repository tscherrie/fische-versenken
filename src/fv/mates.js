// The others in the room, in this river (plan, part 5): each player sends their own fish
// twenty times a second (once a second when far from everyone would do, later); here the
// others' fish are drawn where they are, smoothed -- shown a little in the past (`delay`),
// between the two states that bracket that moment, so their swimming is as even as the
// network is not -- with a name over each and their places on the map. Their bodies are the
// base game's own fish bodies for their stage, one small crowd per body and coat, all made
// before the first frame so nothing compiles mid-swim.
//
// How far in the past follows the line: a state comes some time after the room's clock
// stamped it (half a trip, and whatever the line adds), and a mate is shown late enough for
// the next state to be there already -- that lateness and its spread, measured as the
// states come, plus one state's interval. (A fixed delay shows a far player standing still
// between states, and a near one later than it need be.)
//
// Each mate is seen two ways besides the drawn fish (owners.js): `fish`, where the enemies
// go for it -- moved on from its newest state to now, since that is where the fish most
// likely is (an enemy chasing the drawn fish would chase where it was); and `drawn`, the
// fish as drawn, from which its weapons fire when they are replayed here. `salmon` stands in
// for the base game's salmon to the weapon models (models.js): the matrix the mate is drawn
// with, its body and coat, so the mates wear their weapons where they are seen.
//
// What a state carries (all rounded, to keep it small): r the room's time it was taken, x y
// z the position, yw pt the heading's yaw and pitch (centiradians), L the length, st the
// stage, s the place along the river, air (in the air), dn (down: dead or taken over),
// bk/bl the weapons on back and belly; and for the fight (owners.js): tr the triggers
// (bits: 1 back, 2 belly held; 4, 8 the laser's beam on at the back, the belly; the same
// four bits above those for "at any moment since the last state"), a the aim point and ag
// the enemy aimed at, n the shots fired from back and belly (counted mod 256), rl the
// magazines reloading (bits 1 back, 2 belly), lc the lunge count (the katana's dash), pz (1
// paused, 2 away: the tab hidden or the page gone), sf (safe), lk the places this page
// counts as swimming together with it (bits by place).

import * as THREE from "three";
import { BODIES, MODEL_LENGTH, createFishMesh } from "../anatomy.js";
import { locate } from "../course.js";
import { STAGES } from "../salmon.js";

// How far in the past the others are shown at least, and at most (ms).
const DELAY = 120;
const LONGEST = 900;
// How often our own fish is sent (ms).
const EVERY = 50;
// How far ahead of its newest state a fish is taken to be for the enemies, at most (s, and
// lengths).
const AHEAD = 0.25;
const AHEAD_LENGTHS = 1.5;
// A mate that has said nothing for this long is down (ms), unless it said it was away.
const SILENT = 2000;
// The harness colours of the four places (plan: Schwarz, Coyote, Ranger-Grün, Wolfsgrau), as
// the name tags and the map show them.
export const SEAT_COLOURS = ["#e9e6dc", "#d6ae78", "#9dc08a", "#a9b5bf"];
const UP = new THREE.Vector3(0, 1, 0);

const CSS = `
#mates { position: fixed; inset: 0; pointer-events: none; z-index: 2; }
#habitat.menu #mates, #habitat.building #mates { display: none; }
#mates .tag { position: absolute; left: 0; top: 0; transform: translate(-50%, -100%); padding: 2px 7px; border-radius: 6px; background: rgba(8, 18, 16, 0.55); font: 700 12px/1.3 var(--hud-font, var(--font-body)); white-space: nowrap; opacity: 0; transition: opacity 0.25s; will-change: transform; }
#mates .tag.shown { opacity: 1; }
#mates .tag small { font-weight: 600; opacity: 0.75; margin-left: 5px; }
`;

const r2 = (v) => Math.round(v * 100) / 100;
const r3 = (v) => Math.round(v * 1000) / 1000;
const wrap = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));

// A fish as the others see it: enough of the base game's fish for the enemies and the
// weapons (never moved by the base game: `relative` is left out, so a kick does nothing).
function fishView() {
  return { position: new THREE.Vector3(), heading: new THREE.Vector3(1, 0, 0), velocity: new THREE.Vector3(), mouth: new THREE.Vector3(), length: 0.25, stage: 0, river: { s: null, u: 0 }, airborne: false, safe: false, captive: false, lungeCount: 0 };
}

export function createMates(game, net) {
  const { scene, camera, habitat } = game;
  // One crowd per body and coat among the stages, three places each (the others).
  const crowds = new Map();
  const crowdOf = (stage) => {
    const st = STAGES[Math.max(0, Math.min(STAGES.length - 1, stage | 0))];
    return crowds.get(`${st.body}/${st.coat}`);
  };
  for (const st of STAGES) {
    const key = `${st.body}/${st.coat}`;
    if (crowds.has(key)) continue;
    const crowd = createFishMesh(scene, st.body, st.coat, 3, { name: `Mate ${key}`, castShadow: false, detail: 0.8, lod: true });
    const far = crowd.far;
    for (const mesh of [crowd.body, crowd.membranes, far?.mesh ?? far]) mesh?.layers?.set(1);
    crowds.set(key, crowd);
  }

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const box = document.createElement("div");
  box.id = "mates";
  habitat.appendChild(box);

  // The others by place: their name, the states as they came, how they are shown now.
  const mates = new Map();
  const mateOf = (seat) => {
    let m = mates.get(seat);
    if (!m) {
      const tag = document.createElement("div");
      tag.className = "tag";
      tag.style.color = SEAT_COLOURS[seat] ?? "#fff";
      box.appendChild(tag);
      const drawn = fishView();
      m = {
        seat,
        name: `Spieler ${seat + 1}`,
        states: [],
        here: false,
        // (The drawn fish's place and heading, as the map and the name tag read them.)
        position: drawn.position,
        heading: drawn.heading,
        length: 0.25,
        stage: 0,
        speed: 0,
        s: 0,
        yaw: 0,
        phase: 0,
        fin: 0,
        tag,
        tagText: "",
        tagX: -1,
        tagY: -1,
        shown: false,
        down: false,
        // Its newest state, when it came (this page's clock, ms), and how late states come.
        last: null,
        heardAt: 0,
        lateAvg: 0,
        lateDev: 0,
        delay: DELAY,
        // Paused (1) or away (2), and since when away (ms); `shun`: away so long that the
        // enemies no longer go for it.
        pz: 0,
        awayAt: 0,
        shun: false,
        fish: fishView(),
        drawn,
        salmon: null,
      };
      // The base game's salmon as the weapon models read it: its matrix, body and coat.
      m.salmon = { fish: drawn, meshes: [{ instanceMatrix: { array: new Float32Array(16) } }], materials: { plan: BODIES.parr, uniforms: { coat_hump: { value: 0 }, coat_yolk: { value: 0 } } }, speeds: () => ({ cruise: 3.4 * Math.pow(Math.max(0.1, m.length), 0.645) }) };
      mates.set(seat, m);
    }
    return m;
  };
  net.on("state", (m) => {
    if (m.seat === net.seat) return;
    const mate = mateOf(m.seat);
    // (The heading as yaw and pitch; an older page still sends it as a vector.)
    m.yaw = m.yw !== undefined ? m.yw / 100 : Math.atan2(m.hz ?? 0, m.hx ?? 1);
    m.pitch = m.pt !== undefined ? m.pt / 100 : Math.asin(Math.max(-1, Math.min(1, m.hy ?? 0)));
    const list = mate.states;
    // (Out of order would only come from a page whose clock of the room jumped: dropped.)
    if (list.length && m.r <= list[list.length - 1].r) return;
    list.push(m);
    // (Kept short: the two that bracket the moment shown, and a few to spare.)
    if (list.length > 12) list.splice(0, list.length - 12);
    const now = net.now();
    const late = now - m.r;
    if (!mate.last) {
      mate.lateAvg = late;
      mate.lateDev = 20;
      mate.delay = Math.max(DELAY, Math.min(LONGEST, late + 40 + EVERY + 20));
    } else {
      mate.lateAvg += (late - mate.lateAvg) * 0.1;
      mate.lateDev += (Math.abs(late - mate.lateAvg) - mate.lateDev) * 0.1;
    }
    mate.last = m;
    mate.heardAt = performance.now();
    const pz = m.pz ?? 0;
    if (pz === 2 && mate.pz !== 2) mate.awayAt = performance.now();
    mate.pz = pz;
    mate.here = true;
  });
  net.on("lobby", (m) => {
    for (const s of m.seats) {
      if (s.seat === net.seat) continue;
      const mate = mateOf(s.seat);
      mate.name = s.name;
      mate.connected = s.connected;
    }
  });
  net.on("left", (m) => {
    const mate = mates.get(m.seat);
    if (mate) mate.connected = false;
  });

  // ---- Our own fish, out to the others (with what the fight adds: owners.js). `force`: now,
  // whenever the last one went (the tab is being hidden).
  let lastSent = -1e9;
  function send(local, extra = null, force = false) {
    const now = net.now();
    if (!force && now - lastSent < EVERY * 0.8) return false;
    lastSent = now;
    const f = local.fish;
    const state = {
      t: "state",
      r: Math.round(now),
      x: r2(f.position.x),
      y: r2(f.position.y),
      z: r2(f.position.z),
      yw: Math.round(Math.atan2(f.heading.z, f.heading.x) * 100),
      pt: Math.round(Math.asin(Math.max(-1, Math.min(1, f.heading.y))) * 100),
      L: r3(f.length),
      st: f.stage,
      s: Math.round(f.river?.s ?? 0),
      bk: local.arsenal?.back ?? null,
      bl: local.arsenal?.belly ?? null,
    };
    if (f.airborne) state.air = 1;
    if (local.down || game.now.dead > 0) state.dn = 1;
    if (extra) for (const k in extra) if (extra[k] !== null && extra[k] !== undefined && extra[k] !== 0) state[k] = extra[k];
    return net.send(state);
  }

  // ---- Where each mate is: drawn a little in the past, and for the enemies moved on to now.
  const at1 = {};
  // The two states that bracket the moment `at` (ms), and how far between them (0..1).
  function bracket(list, at, out) {
    let a = list[0],
      b = list[list.length - 1];
    for (let i = list.length - 1; i > 0; i--)
      if (list[i - 1].r <= at) {
        a = list[i - 1];
        b = list[i];
        break;
      }
    const span = b.r - a.r;
    out.a = a;
    out.b = b;
    out.k = span > 0 ? Math.min(1, Math.max(0, (at - a.r) / span)) : 1;
    out.span = span;
    return out;
  }
  function headingOf(yaw, pitch, out) {
    const c = Math.cos(pitch);
    return out.set(Math.cos(yaw) * c, Math.sin(pitch), Math.sin(yaw) * c);
  }
  // The drawn fish at the moment `at`, held at the last state when the states stop coming.
  function place(mate, at) {
    const list = mate.states;
    if (!list.length) return false;
    const { a, b, k, span } = bracket(list, at, at1);
    const d = mate.drawn;
    d.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    headingOf(a.yaw + wrap(b.yaw - a.yaw) * k, a.pitch + (b.pitch - a.pitch) * k, d.heading);
    if (span > 0 && k < 1) d.velocity.set(b.x - a.x, b.y - a.y, b.z - a.z).multiplyScalar(1000 / span);
    else d.velocity.set(0, 0, 0);
    d.length = a.L + (b.L - a.L) * k;
    d.stage = b.st;
    d.airborne = !!b.air;
    d.safe = !!b.sf;
    d.lungeCount = b.lc ?? 0;
    d.river.s ??= b.s;
    mate.length = d.length;
    mate.stage = b.st;
    mate.speed = d.velocity.length();
    mate.s = b.s;
    mate.yaw = Math.atan2(d.heading.z, d.heading.x);
    d.mouth.copy(d.heading).multiplyScalar((0.35 * d.length) / MODEL_LENGTH).add(d.position);
    return true;
  }
  // The fish the enemies see: from its newest state on to now along its way.
  function ahead(mate, now) {
    const list = mate.states;
    const n = list.length;
    if (!n) return;
    const b = list[n - 1];
    const f = mate.fish;
    if (n > 1) {
      const a = list[n - 2];
      const span = b.r - a.r;
      if (span > 0) f.velocity.set(b.x - a.x, b.y - a.y, b.z - a.z).multiplyScalar(1000 / Math.max(span, 30));
    } else f.velocity.set(0, 0, 0);
    // (Not when it is down, or has stood still: then it is where it said.)
    const t = Math.min(AHEAD, Math.max(0, (now - b.r) / 1000));
    f.position.set(b.x, b.y, b.z);
    const move = Math.min(f.velocity.length() * t, AHEAD_LENGTHS * b.L);
    if (move > 1e-4) f.position.addScaledVector(f.velocity, move / f.velocity.length());
    headingOf(b.yaw, b.pitch, f.heading);
    f.length = b.L;
    f.stage = b.st;
    f.airborne = !!b.air;
    f.safe = !!b.sf;
    f.lungeCount = b.lc ?? 0;
    f.mouth.copy(f.heading).multiplyScalar((0.35 * f.length) / MODEL_LENGTH).add(f.position);
  }

  const matrix = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  // The drawn fish's matrix (along its heading, upright, at its length), also into the
  // stand-in salmon the weapon models read.
  function pose(mate) {
    const d = mate.drawn;
    axisZ.crossVectors(d.heading, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, d.heading).normalize();
    basis.makeBasis(d.heading, axisY, axisZ);
    quaternion.setFromRotationMatrix(basis);
    const k = d.length / MODEL_LENGTH;
    matrix.compose(d.position, quaternion, scale.set(k, k, k));
    matrix.toArray(mate.salmon.meshes[0].instanceMatrix.array);
    const st = STAGES[Math.max(0, Math.min(STAGES.length - 1, d.stage | 0))];
    mate.salmon.materials.plan = BODIES[st.body] ?? BODIES.parr;
    return matrix;
  }

  // Each step (owners.js, before anything fires or moves): every mate where it is drawn and
  // where the enemies see it, and whether it is down, away or out of the enemies' sight.
  function update(dt) {
    const now = net.now();
    const clock = performance.now();
    for (const mate of mates.values()) {
      if (!mate.states.length) continue;
      // (Eased: later at once when the line gets worse, earlier only slowly.)
      const want = Math.max(DELAY, Math.min(LONGEST, mate.lateAvg + 2 * mate.lateDev + EVERY + 20));
      mate.delay += want > mate.delay ? Math.min(want - mate.delay, 1000 * dt) : Math.max(want - mate.delay, -300 * dt);
      place(mate, now - mate.delay);
      ahead(mate, now);
      const b = mate.last;
      locate(mate.fish.position.x, mate.fish.position.z, mate.fish.river.s ?? b.s, mate.fish.river);
      locate(mate.drawn.position.x, mate.drawn.position.z, mate.drawn.river.s ?? b.s, mate.drawn.river);
      pose(mate);
      const silent = clock - mate.heardAt > SILENT && mate.pz !== 2;
      mate.down = mate.connected === false || !!b.dn || silent;
      mate.shun = mate.pz === 2 && clock - mate.awayAt > 30000;
    }
  }

  // ---- The others, drawn.
  const projector = new THREE.Vector3();
  const slots = new Map();
  function frame(dt) {
    const now = net.now();
    for (const crowd of crowds.values()) crowd.begin();
    slots.clear();
    const w = window.innerWidth,
      h = window.innerHeight;
    for (const mate of mates.values()) {
      const there = mate.connected !== false && place(mate, now - mate.delay);
      let tagShown = false;
      if (there && !mate.down) {
        const crowd = crowdOf(mate.stage);
        const slot = slots.get(crowd) ?? 0;
        pose(mate);
        if (slot < crowd.count) {
          slots.set(crowd, slot + 1);
          crowd.body.setMatrixAt(slot, matrix);
          // Swimming as fast as it goes.
          const beat = 0.8 + (mate.speed / Math.max(0.1, mate.length)) * 1.2;
          mate.phase = (mate.phase + dt * Math.PI * 2 * beat) % (Math.PI * 2);
          mate.fin = (mate.fin + dt * Math.PI * 2 * 1.4) % (Math.PI * 2);
          crowd.swim.setXYZW(slot, mate.phase, 0.3 + Math.min(0.5, (mate.speed / Math.max(0.1, mate.length)) * 0.35), 0, 0.1);
          crowd.fin.setX(slot, mate.fin);
          crowd.mouth.setX(slot, 0.1);
        }
        // The name over it, while it is near enough to matter and in view.
        projector.copy(mate.position);
        projector.y += mate.length * 0.45 + 0.05;
        const d = projector.distanceTo(camera.position);
        if (d < 60) {
          projector.project(camera);
          if (projector.z < 1 && Math.abs(projector.x) < 1.05 && Math.abs(projector.y) < 1.05) {
            tagShown = true;
            const x = Math.round((projector.x * 0.5 + 0.5) * w),
              y = Math.round((0.5 - projector.y * 0.5) * h);
            if (x !== mate.tagX || y !== mate.tagY) {
              mate.tagX = x;
              mate.tagY = y;
              mate.tag.style.transform = `translate(${x}px, ${y}px) translate(-50%, -100%)`;
            }
            const text = `${mate.name}|${Math.round(d / 10)}`;
            if (text !== mate.tagText) {
              mate.tagText = text;
              mate.tag.textContent = mate.name;
              if (d > 15) {
                const small = document.createElement("small");
                small.textContent = `${Math.round(d / 10)} m`;
                mate.tag.appendChild(small);
              }
            }
          }
        }
      }
      if (tagShown !== mate.shown) {
        mate.shown = tagShown;
        mate.tag.classList.toggle("shown", tagShown);
      }
    }
    for (const crowd of crowds.values()) crowd.finish();
  }

  // For the map: the others where they are (world position, heading, place on the river).
  const onMap = [];
  function others() {
    onMap.length = 0;
    for (const mate of mates.values()) {
      if (mate.connected === false || !mate.states.length) continue;
      onMap.push({ name: mate.name, colour: SEAT_COLOURS[mate.seat] ?? "#fff", x: mate.position.x, z: mate.position.z, yaw: mate.yaw, s: mate.s });
    }
    return onMap;
  }

  return { mates, send, update, frame, others, EVERY };
}
