// The others in the room, in this river (plan, part 5): each player sends their own fish
// twenty times a second (once a second when far from everyone would do, later); here the
// others' fish are drawn where they are, smoothed -- shown a little in the past (DELAY),
// between the two states that bracket that moment, so their swimming is as even as the
// network is not -- with a name over each and their places on the map. Their bodies are the
// base game's own fish bodies for their stage, one small crowd per body and coat, all made
// before the first frame so nothing compiles mid-swim.
//
// What a state carries (all rounded, to keep it small): r the room's time it was taken, x y
// z the position, hx hy hz the heading, L the length, st the stage, sp the speed, s the place
// along the river, yaw, air (in the air), dn (down: dead or taken over), bk/bl the weapons
// on back and belly.

import * as THREE from "three";
import { MODEL_LENGTH, createFishMesh } from "../anatomy.js";
import { STAGES } from "../salmon.js";

// How far in the past the others are shown (ms): enough for two states to bracket it.
const DELAY = 120;
// How often our own fish is sent (ms).
const EVERY = 50;
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

const r3 = (v) => Math.round(v * 1000) / 1000;

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
      mates.set(seat, (m = { seat, name: `Spieler ${seat + 1}`, states: [], here: false, position: new THREE.Vector3(), heading: new THREE.Vector3(1, 0, 0), length: 0.25, stage: 0, speed: 0, s: 0, yaw: 0, phase: 0, fin: 0, tag, tagText: "", tagX: -1, tagY: -1, shown: false, down: false }));
    }
    return m;
  };
  net.on("state", (m) => {
    if (m.seat === net.seat) return;
    const mate = mateOf(m.seat);
    mate.states.push(m);
    // (Kept short: the two that bracket the moment shown, and a few to spare.)
    if (mate.states.length > 12) mate.states.splice(0, mate.states.length - 12);
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

  // ---- Our own fish, out to the others.
  let lastSent = -1e9;
  function send(local) {
    const now = net.now();
    if (now - lastSent < EVERY) return;
    lastSent = now;
    const f = local.fish;
    net.send({
      t: "state",
      r: Math.round(now),
      x: r3(f.position.x),
      y: r3(f.position.y),
      z: r3(f.position.z),
      hx: r3(f.heading.x),
      hy: r3(f.heading.y),
      hz: r3(f.heading.z),
      L: r3(f.length),
      st: f.stage,
      sp: r3(f.velocity?.length() ?? 0),
      s: Math.round(f.river?.s ?? 0),
      yaw: r3(f.yaw ?? 0),
      air: f.airborne ? 1 : 0,
      dn: local.down || game.now.dead > 0 ? 1 : 0,
      bk: local.arsenal?.back ?? null,
      bl: local.arsenal?.belly ?? null,
    });
  }

  // ---- The others, drawn.
  const matrix = new THREE.Matrix4();
  const basis = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const axisY = new THREE.Vector3();
  const axisZ = new THREE.Vector3();
  const projector = new THREE.Vector3();
  const slots = new Map();
  // Where a mate is at the moment shown: between the two states that bracket it (held at
  // the last one when the states stop coming).
  function place(mate, at) {
    const list = mate.states;
    if (!list.length) return false;
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
    mate.position.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    mate.heading.set(a.hx + (b.hx - a.hx) * k, a.hy + (b.hy - a.hy) * k, a.hz + (b.hz - a.hz) * k);
    if (mate.heading.lengthSq() < 1e-6) mate.heading.set(1, 0, 0);
    mate.heading.normalize();
    mate.length = a.L + (b.L - a.L) * k;
    mate.stage = b.st;
    mate.speed = a.sp + (b.sp - a.sp) * k;
    mate.s = b.s;
    mate.yaw = b.yaw;
    mate.down = !!b.dn;
    return true;
  }
  function frame(dt) {
    const at = net.now() - DELAY;
    for (const crowd of crowds.values()) crowd.begin();
    slots.clear();
    const w = window.innerWidth,
      h = window.innerHeight;
    for (const mate of mates.values()) {
      const there = mate.connected !== false && place(mate, at);
      let tagShown = false;
      if (there && !mate.down) {
        const crowd = crowdOf(mate.stage);
        const slot = slots.get(crowd) ?? 0;
        if (slot < crowd.count) {
          slots.set(crowd, slot + 1);
          // Along its heading, upright, at its length.
          axisZ.crossVectors(mate.heading, UP);
          if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
          axisZ.normalize();
          axisY.crossVectors(axisZ, mate.heading).normalize();
          basis.makeBasis(mate.heading, axisY, axisZ);
          quaternion.setFromRotationMatrix(basis);
          const k = mate.length / MODEL_LENGTH;
          matrix.compose(mate.position, quaternion, scale.set(k, k, k));
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

  return { mates, send, frame, others };
}
