// The weapons: what each one is, where on the fish it sits, and how it fires. A fish carries
// one weapon until the smolt, then two: one on the back (left mouse button) and one at the
// belly (right). A weapon found replaces the one in its place (plan, part 3).
//
// Numbers grow with the fish: a weapon's damage, speed and reach are worked out from the
// body length L when it fires, so an early weapon stays some use later. The balance unit is
// the laser's burst: P(L) = 32.7 x damageScale(L) damage a second.
//
// Ballistics are as in water (the user's rule): bullets and pellets are slowed by the water,
// hurt only over a short distance and then sink; grenades are slowed and sink slower than
// they would fall; lasers fly straight; fire burns (an exaggeration the user may still
// overrule).
//
// Each weapon has a verb (`mode`):
//   bolt     single fast shots, hold for a stream, heat lock (the laser)
//   pellets  a shell of pellets in a cone, two barrels, a break-action reload (the shotgun)
//   lob      a grenade on an arc solved to land at the crosshair, bounces, blast (launcher)
//   blade    a cut over an arc in front of the snout; Space with the blade out is a dash cut
//   flame    a held jet: a cone that burns what it touches, and burning spreads
//
// What it looks like is meant seriously, like the weapons: flesh is left to the splatter
// (gore.js); the weapons add what a real gun adds -- a muzzle flash held a few frames, powder
// smoke, silt kicked off the bed, a blast's white flash and its gas and gravel -- and nothing
// that reads as fireworks. Everything that is only for the eye draws from its own random
// stream (`look`), never from the one the game plays with, and is made in the step, never in
// the frame (the frame goes on in the pause).

import * as THREE from "three";
import { bed, level, locate } from "../course.js";
import { GAS, GRIT, POWDER, SILT, SOOT } from "./projectiles.js";

const GRAVITY = 98;
// How long the katana's cut stays in the water as a thin arc of light (s).
const TRAIL = 0.12;

// place: "back" or "belly"; mount: where on the back (left, right or middle).
// muzzle: where the barrel ends, in the fish's model units (harness spec): `x` along the
// body, and either `bore` (on the middle rail: that far above the rail's top) or `side` (+1
// right, -1 left: on the side clamps' axis).
// heat: added per shot (per second for a jet; 1 = too hot, then it has to cool below
// `unlock`); cool: per second, once the weapon has rested `rest` seconds.
// Under water a grenade is slowed by the water and sinks slower than it would fall.
const WATER_DRAG = 1.4;
const WATER_SINK = 30;

export const WEAPONS = {
  piu: {
    title: "Kompaktlaser",
    mode: "bolt",
    place: "back",
    mount: "middle",
    muzzle: { x: 0.395, bore: 0.016 },
    interval: 0.11,
    damage: 3.6,
    heat: 0.034,
    cool: 0.6,
    rest: 0.25,
    unlock: 0.35,
    spread: 0.012,
    speed: (L) => 24 + 18 * L,
    reach: (L) => 16 + 14 * L,
    // A needle: thin, long, a white-hot core in a red sheath.
    size: (L) => 0.022 + 0.025 * L,
    radius: (L) => 0.02 + 0.05 * L,
    tint: [7, 0.7, 0.4],
    core: [5, 2.6, 2.2],
    glow: [3, 0.35, 0.2],
    stretch: 9.5,
  },
  flinte: {
    title: "Abgesägte Doppelflinte",
    mode: "pellets",
    place: "back",
    mount: "right",
    muzzle: { x: 0.345, side: 1 },
    // Two barrels, one after the other; then the action breaks open and reloads.
    shells: 2,
    interval: 0.15,
    reload: 0.9,
    idleReload: 1.5,
    pellets: 9,
    damage: 2.0,
    cone: 0.085,
    speed: (L) => 36 + 22 * L,
    reach: (L) => 4 + 5 * L,
    // Full damage out to 40 % of the reach, down to 30 % at its end.
    falloff: [0.4, 0.3],
    // A shell that lands all its pellets on something this weak bursts it.
    burstHp: 22,
    // How far the whole shell throws a fish smaller than the salmon (L), and the kick
    // back on the fish (x cruise).
    shove: 1.5,
    recoil: 0.6,
    size: (L) => 0.02 + 0.025 * L,
    radius: (L) => 0.015 + 0.03 * L,
    tint: [5, 3.4, 1.8],
    stretch: 7,
    flash: [9, 5.2, 2],
  },
  granate: {
    title: "Revolver-Granatwerfer",
    mode: "lob",
    place: "back",
    mount: "right",
    muzzle: { x: 0.33, side: 1 },
    shells: 6,
    interval: 0.45,
    reload: 2.4,
    idleReload: 2.5,
    // Launch speed: with sqrt(L) the arc spans the same number of body lengths at any size.
    speed: (L) => 34 * Math.sqrt(L),
    reach: (L) => 12 * L,
    bounce: 0.45,
    fuse: 1.1,
    direct: 8,
    damage: 20,
    // The blast: radius (units), what is left of the damage at its edge, how far it throws.
    blast: (L) => 1.2 * L,
    edge: 0.3,
    shove: 1.5,
    stun: 2,
    recoil: 0.15,
    size: (L) => 0.03 + 0.03 * L,
    radius: (L) => 0.03 + 0.04 * L,
    tint: [1.2, 0.9, 0.4],
    flash: [8, 5, 2.2],
  },
  katana: {
    title: "Katana",
    mode: "blade",
    place: "back",
    mount: "left",
    muzzle: { x: 0.235, side: -1 },
    interval: 0.4,
    damage: 24,
    // The cut: every enemy within `reach` of the fish, `arc` wide in front, `height` up
    // or down (L); it takes `swing` seconds to cross.
    arc: (160 * Math.PI) / 180,
    reach: (L) => 1.0 * L,
    height: 0.25,
    swing: 0.12,
    // Space with the blade out: everything within `dashReach` L of the path, x `dash`.
    dash: 2.5,
    dashReach: 0.6,
    dashTime: 0.3,
    // The blade goes back into its scabbard after this long without a cut.
    sheathe: 1.5,
    // A cut into a strike: the strike is off and the striker stunned this long.
    konter: 1.0,
  },
  flammen: {
    title: "Flammenwerfer",
    mode: "flame",
    place: "back",
    mount: "middle",
    // (The tanks ride on the saddle; the lance and its nozzle on the right clamps.)
    muzzle: { x: 0.33, side: 1 },
    // Per second of jet: 5 s from cold, then it locks.
    heat: 0.2,
    cool: 0.5,
    rest: 0.3,
    unlock: 0.35,
    fuel: true,
    damage: 36,
    burn: 8,
    burnTime: 2.5,
    // The jet: `reach` long, a cone of `cone` rad either side, at most `targets` at once.
    reach: (L) => 3 * L,
    cone: 0.18,
    targets: 10,
    // Burning spreads to enemies this close (L); what the jet touches panics this long.
    spread: 0.5,
    panic: 1,
    // Up through the surface (L).
    sky: 1,
    size: (L) => 0.085 * L,
    tint: [2.1, 1.0, 0.27],
    glow: [0.5, 0.8, 3.2],
  },
};

// Damage grows with the body: a fry's laser stings, the same laser on a big fish burns.
export const damageScale = (L) => Math.min(12, Math.max(1, Math.pow(L / 0.35, 0.7)));
// The balance unit: the laser's burst, damage per second.
export const powerUnit = (L) => 32.7 * damageScale(L);

// The harness on each body build (harness spec, sections 3, 4 and 6), in model units: the
// top of the middle rail at its mount point, and the side clamps' axis (height, and how far
// out to either side). The alevin carries its laser on a clamp block on its cargo strap.
const BUILDS = {
  alevin: { rail: 0.051, side: [0.056, 0.05] },
  parr: { rail: 0.077, side: [0.056, 0.05] },
  salmon: { rail: 0.087, side: [0.064, 0.054] },
};
const buildOf = (stage) => (stage <= 0 ? BUILDS.alevin : stage <= 4 ? BUILDS.parr : BUILDS.salmon);

export function createArsenal() {
  const matrix = new THREE.Matrix4();
  const local = new THREE.Vector3();
  return {
    back: "piu",
    belly: null,
    // Per weapon, made the first time it is carried: heat, whether it is locked (and was, a
    // step ago), the time since it last fired, the rounds left (magazines), the reload time
    // left.
    heat: {},
    locked: {},
    wasLocked: {},
    fired: {},
    ammo: {},
    reloading: {},
    cooldown: { back: 0, belly: 0 },
    // The weapon's state, made if it is new (any id can be put on the fish: tests do).
    ensure(id) {
      if (!id || id in this.heat) return;
      const w = WEAPONS[id];
      this.heat[id] = 0;
      this.locked[id] = false;
      this.wasLocked[id] = false;
      this.fired[id] = 1;
      this.ammo[id] = w?.shells ?? null;
      this.reloading[id] = 0;
    },
    // A weapon found: it goes to its place, replacing what was there, loaded and cold.
    take(id) {
      const w = WEAPONS[id];
      if (!w) return null;
      const old = this[w.place];
      this[w.place] = id;
      delete this.heat[id];
      this.ensure(id);
      return old;
    },
    // Where the barrel of the weapon in `place` ends on this fish now, in the world: `out`.
    // (The harness spec's muzzle points, until the weapon models give their own; the mounts
    // on the back ride up with the spawner's hump.)
    mount(salmon, place, out) {
      const meshes = salmon.meshes;
      if (!meshes?.[0]) return out.copy(salmon.fish.position);
      matrix.fromArray(meshes[0].instanceMatrix.array, 0);
      const w = WEAPONS[this[place]];
      const build = buildOf(salmon.fish.stage ?? 1);
      const hump = 1 + 0.42 * (salmon.materials?.uniforms?.coat_hump?.value ?? 0);
      if (place === "belly") local.set(0.17, -0.1, 0);
      else {
        const m = w?.muzzle ?? { x: 0.16, bore: 0.016 };
        if (m.side) local.set(m.x, build.side[0] * hump, m.side * build.side[1]);
        else local.set(m.x, build.rail * hump + (m.bore ?? 0.016), 0);
      }
      return out.copy(local).applyMatrix4(matrix);
    },
    // Cool every weapon, and count down the time to the next shot.
    cool(dt) {
      this.ensure(this.back);
      this.ensure(this.belly);
      for (const id in this.heat) {
        const w = WEAPONS[id];
        if (!w) continue;
        this.fired[id] = (this.fired[id] ?? 1) + dt;
        if (w.cool && (this.fired[id] > (w.rest ?? 0.25) || this.locked[id])) this.heat[id] = Math.max(0, this.heat[id] - w.cool * dt);
        if (this.locked[id] && this.heat[id] < w.unlock) this.locked[id] = false;
      }
      this.cooldown.back = Math.max(-0.05, this.cooldown.back - dt);
      this.cooldown.belly = Math.max(-0.05, this.cooldown.belly - dt);
    },
    // What the weapon card should show for `id` (for hud.js): `kind` "heat", "fuel" or
    // "shells"; `level` 0..1, how full its bar is (heat rising, fuel falling); `locked`
    // (too hot, or out of fuel); `rounds` of `shells` left; `reload` 0..1 done while a
    // magazine reloads (else 0); `label`, the German word for its state, or "".
    readout(id, out = {}) {
      const w = WEAPONS[id];
      out.kind = w?.shells ? "shells" : w?.fuel ? "fuel" : "heat";
      out.locked = !!this.locked[id];
      out.rounds = this.ammo[id] ?? 0;
      out.shells = w?.shells ?? 0;
      out.reload = w?.shells && this.reloading[id] > 0 ? 1 - this.reloading[id] / w.reload : 0;
      out.level = out.kind === "shells" ? (out.reload > 0 ? out.reload : out.rounds / Math.max(1, out.shells)) : out.kind === "fuel" ? 1 - Math.min(1, this.heat[id] ?? 0) : Math.min(1, this.heat[id] ?? 0);
      out.label = out.reload > 0 ? "Nachladen" : out.locked ? (out.kind === "fuel" ? "Leer" : "Überhitzt") : "";
      return out;
    },
  };
}

// ---- Small geometry.

// Distance from point p to the segment a-b; the closest point is left in `closest`.
const ab = new THREE.Vector3();
const ap = new THREE.Vector3();
function pointSegment(p, a, b, closest) {
  ab.subVectors(b, a);
  ap.subVectors(p, a);
  const len2 = ab.lengthSq();
  const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ap.dot(ab) / len2)) : 0;
  closest.copy(a).addScaledVector(ab, t);
  return closest.distanceTo(p);
}
// An enemy's body as a segment, tail to head (as projectiles.js tests it).
function bodyEnds(e, tail, head) {
  tail.copy(e.position).addScaledVector(e.heading, -0.5 * e.size);
  head.copy(e.position).addScaledVector(e.heading, 0.44 * e.size);
}

// The flame's puffs (tints and how they cool: kept, not made per puff).
const FLAME_CORE_COOL = [0.9, 0.2, 0.03];
const FLAME_BILLOW = [1.5, 0.6, 0.13];
const FLAME_BILLOW_COOL = [0.4, 0.05, 0.01];
// What the jet and a burn tell the splatter (the same every time).
const FIRE_INFO = Object.freeze({ mode: "flame", fire: true });
const BURN_INFO = Object.freeze({ mode: "flame", fire: true, burning: true });

// ---- The firing: every verb, and what the shots do when they land.
//
// ctx: random (the game's stream: aim spread, pellets, anything that decides a hit), look (a
// stream of its own for the looks), enemies, projectiles, smoke, ribbons, fx, sfx, gore,
// models, aim, hud, game, camera, players (the list, local first), clock() (combat's time),
// onKill(e, by, dir, weapon, info).
export function createFiring(ctx) {
  const { random, enemies, projectiles, smoke, ribbons, fx, sfx, gore, models, aim, hud, game, onKill } = ctx;
  const look = ctx.look ?? Math.random;
  const camera = ctx.camera ?? game?.camera ?? null;
  const options = { debug: false };
  const UP = new THREE.Vector3(0, 1, 0);
  const muzzle = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const flight = new THREE.Vector3();
  const side = new THREE.Vector3();
  const up = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const tmp2 = new THREE.Vector3();
  const tail = new THREE.Vector3();
  const head = new THREE.Vector3();
  const closest = new THREE.Vector3();
  const eye = new THREE.Vector3();
  const where = { s: null, u: 0 };
  let clock = 0;
  let volleys = 0;

  // What each weapon has done (for the tests): shots, hits, damage, kills.
  const stats = {};
  const stat = (id) => (stats[id] ??= { shots: 0, hits: 0, damage: 0, kills: 0 });

  // Per player: the katana's swings and dash.
  const blades = new Map();
  const bladeOf = (player) => {
    let b = blades.get(player.id);
    if (!b) blades.set(player.id, (b = { swings: [], side: 1, lastCut: -9, drawn: false, held: false, lunges: player.fish.lungeCount ?? 0, dash: null }));
    return b;
  };
  // Enemies being thrown, stunned belly-up (until when), burning; when each may be stunned
  // again; the pellets of the last shell on each; when each last bled for a jet or a burn.
  const shoves = new Map();
  const stuns = new Map();
  const burning = new Map();
  const stunGuard = new WeakMap();
  const volleyHits = new WeakMap();
  const lastGore = new WeakMap();

  const isLocal = (owner) => owner === ctx.players[0]?.id;
  const playerOf = (owner) => ctx.players.find((p) => p.id === owner);
  const lengthOf = (owner) => playerOf(owner)?.fish.length ?? 1;

  // ---- Damage, with everything a hit brings: the splatter, the mark, the kill.
  // `gory`: tell the splatter (pellets are told once per shell, in flush()); `info`: what
  // the splatter and the kill want to know (mode, point, power, burst, cut, ...).
  function damage(owner, e, amount, dir, point, weapon, gory = true, info = null) {
    if (e.dead || !(amount > 0)) return false;
    // (A stun outlasts the flinch of the hits that follow it.)
    const stagger = e.stagger ?? 0;
    const sunk = enemies.hit(e, amount, dir, owner);
    if (!sunk && stagger > e.stagger) e.stagger = stagger;
    const s = stat(weapon);
    s.hits++;
    s.damage += amount;
    if (gory) gore.hit(e, point ?? e.position, dir ?? UP, weapon, info);
    if (isLocal(owner) && !sunk && gory) hud.hit(false);
    if (sunk) {
      s.kills++;
      // (The point may be a shot's, which goes back to its pool: the kill keeps a copy.)
      if (info?.point && !Object.isFrozen(info)) info.point = info.point.clone();
      // A body thrown by the blow that killed it keeps flying (after() carries corpses).
      onKill(e, owner, dir ?? UP, weapon, info);
    }
    return sunk;
  }

  // Thrown `distance` along `dir` over a moment (the water gives way, as air would).
  function shove(e, dir, distance) {
    if (!(distance > 0)) return;
    const tau = 0.18;
    let s = shoves.get(e);
    if (!s) shoves.set(e, (s = { v: new THREE.Vector3(), tau }));
    s.v.addScaledVector(dir, distance / tau);
    s.tau = tau;
  }
  // Something that can swallow the fish, or half again its size, is not thrown about like a
  // swarm: it does not panic, and a stun holds it half as long.
  const heavy = (e, L) => !!e.spec?.swallows || e.size >= 1.5 * L;
  // Stunned: slowed and out of its attack for `seconds`, on its back if `belly`. After a stun
  // an enemy cannot be stunned again for a few seconds, so no weapon holds it down for good;
  // a Konter (a cut into its strike) always lands.
  function stun(e, seconds, belly, L, konter = false) {
    if (e.dead) return false;
    if (!konter) {
      if (clock < (stunGuard.get(e) ?? -1)) return false;
      if (heavy(e, L)) seconds *= 0.5;
      stunGuard.set(e, clock + seconds + 3.5);
    }
    e.stagger = Math.max(e.stagger ?? 0, seconds);
    e.mode = "recover";
    e.t = Math.min(e.t ?? 0, -seconds);
    if (belly) stuns.set(e, Math.max(stuns.get(e) ?? 0, clock + seconds));
    return true;
  }
  const stunned = (e) => !e.dead && (stuns.get(e) ?? -1) > clock;
  // Panic: off and away from the fish for `seconds` (a swarm breaks up). A strike already
  // under way goes on; what can swallow the fish does not panic.
  function panic(e, seconds, L) {
    if (e.dead || heavy(e, L)) return;
    if (e.mode !== "approach" && e.mode !== "orbit" && e.mode !== "coil" && e.mode !== "recover" && e.mode !== "lurk") return;
    if (e.mode !== "recover" || e.t > -seconds * 0.5) {
      e.mode = "recover";
      e.t = -seconds;
    }
  }

  // ---- The muzzle and the aim.
  function muzzleOf(player, place, out) {
    if (!models.muzzle(player, place, out)) player.arsenal.mount(player.salmon, place, out);
    return out;
  }
  // From the muzzle to the crosshair (or along the view when that is too close or behind).
  function aimFrom(from, L, out) {
    out.subVectors(aim.point, from);
    if (out.lengthSq() < 0.25 * L * L || out.dot(aim.direction) < 0) out.copy(aim.direction);
    return out.normalize();
  }
  // A direction scattered by up to `spread` rad each way.
  function scatter(dir, spread, out) {
    out.copy(dir);
    out.x += (random() - 0.5) * 2 * spread;
    out.y += (random() - 0.5) * 2 * spread;
    out.z += (random() - 0.5) * 2 * spread;
    return out.normalize();
  }
  // Within a cone of half-angle `half` (well under 90 degrees), evenly over its disc.
  const X = new THREE.Vector3(1, 0, 0);
  function cone(dir, half, out, rnd = random) {
    side.crossVectors(dir, Math.abs(dir.y) < 0.95 ? UP : X).normalize();
    up.crossVectors(side, dir);
    const r = Math.tan(half) * Math.sqrt(rnd());
    const a = rnd() * Math.PI * 2;
    const dx = dir.x,
      dy = dir.y,
      dz = dir.z;
    return out.set(dx, dy, dz).addScaledVector(side, Math.cos(a) * r).addScaledVector(up, Math.sin(a) * r).normalize();
  }
  // Any direction.
  function sphere(out, rnd = random) {
    const u = rnd() * 2 - 1,
      a = rnd() * Math.PI * 2,
      w = Math.sqrt(1 - u * u);
    return out.set(w * Math.cos(a), u, w * Math.sin(a));
  }
  // The fish kicked back through the water (x its cruise).
  function kick(player, dir, amount) {
    const f = player.fish;
    if (!amount || f.airborne || f.captive || player.down) return;
    const cruise = player.salmon.speeds?.().cruise ?? 3.4 * Math.pow(f.length, 0.645);
    f.relative?.addScaledVector(dir, -amount * cruise);
  }

  // A puff of smoke (one options record, filled in place for each puff).
  const puffing = { vx: 0, vy: 0, vz: 0, size: 0.1, grow: 3, life: 1.5, alpha: 0.5, drag: 2, lift: 0, random: look, s: null, top: undefined, floor: undefined };
  function puff(kind, x, y, z, vx, vy, vz, size, grow, life, alpha, drag, lift, s = null, top = undefined, floor = undefined) {
    if (!smoke) return;
    puffing.vx = vx;
    puffing.vy = vy;
    puffing.vz = vz;
    puffing.size = size;
    puffing.grow = grow;
    puffing.life = life;
    puffing.alpha = alpha;
    puffing.drag = drag;
    puffing.lift = lift;
    puffing.s = s;
    puffing.top = top;
    puffing.floor = floor;
    smoke.puff(kind, x, y, z, puffing);
  }

  // A muzzle flash: a hot core held a few frames (the temporal blend swallows less), a
  // tongue of burning powder along the shot, grey powder smoke that billows as in air, gas
  // bubbles.
  const flashDir = new THREE.Vector3();
  function flash(at, towards, L, colour, scale = 1, s = null) {
    const [r, g, b] = colour;
    const dir = flashDir.copy(towards);
    // (At least a few centimetres across, whatever the fish: the flash is the gun's size.)
    const k = Math.max(L, 0.45) * scale;
    // (Glows share one square quad: the bigger one is, the dimmer it must be, or its edge
    // shows. So a small white-hot core and a tongue along the shot, and no wide bloom.)
    fx.spark(at.x + dir.x * 0.05 * k, at.y + dir.y * 0.05 * k, at.z + dir.z * 0.05 * k, { size: 0.2 * k, life: 0.09, r: r * 1.3, g: g * 1.5, b: b * 2 });
    fx.spark(at.x + dir.x * 0.16 * k, at.y + dir.y * 0.16 * k, at.z + dir.z * 0.16 * k, { size: 0.3 * k, life: 0.1, r: r * 0.45, g: g * 0.4, b: b * 0.35, stretch: 2.2, vx: dir.x * 1e-3, vy: dir.y * 1e-3, vz: dir.z * 1e-3 });
    for (let i = 0; i < 5 * scale; i++) {
      cone(dir, 0.25, tmp, look);
      const v = (4 + 6 * look()) * k;
      fx.spark(at.x, at.y, at.z, { vx: tmp.x * v, vy: tmp.y * v, vz: tmp.z * v, size: 0.06 * k, life: 0.07 + 0.05 * look(), r: r * 0.6, g: g * 0.5, b: b * 0.4, stretch: 3.5 });
    }
    // Powder smoke: pushed out along the shot, then it slows, swells and hangs.
    for (let i = 0; i < 3 * scale; i++) {
      cone(dir, 0.35, tmp, look);
      const v = (1.5 + 3 * look()) * k;
      puff(POWDER, at.x + dir.x * 0.1 * k, at.y + dir.y * 0.1 * k, at.z + dir.z * 0.1 * k, tmp.x * v, tmp.y * v, tmp.z * v, 0.12 * k, 3.2, 1.3 + 0.6 * look(), 0.45, 3.5, 0.15 * k, s);
    }
    fx.fizz(at.x + dir.x * 0.2 * L, at.y + dir.y * 0.2 * L, at.z + dir.z * 0.2 * L, { count: Math.round(3 * scale), size: 0.012 * L + 0.005, spread: 0.2 * L, rise: 0.8, random: look });
  }

  // ---- The verbs.

  // bolt: one fast shot (the laser).
  function bolt(player, place, w, id) {
    const f = player.fish;
    const L = f.length;
    muzzleOf(player, place, muzzle);
    models.recoil(player, place);
    aimFrom(muzzle, L, aimDir);
    scatter(aimDir, w.spread, tmp);
    const speed = w.speed(L);
    flight.copy(tmp).multiplyScalar(speed);
    const p = projectiles.spawn(player.id, id, muzzle, flight, f.river.s);
    p.damage = w.damage * damageScale(L);
    p.radius = w.radius(L);
    p.life = w.reach(L) / speed;
    p.size = w.size(L);
    p.tint = w.tint;
    p.core = w.core;
    p.stretch = w.stretch;
    p.shooter = L;
    // The emitter's lens flashes (a red glint, held a few frames).
    fx.spark(muzzle.x, muzzle.y, muzzle.z, { size: w.size(L) * 2.2, life: 0.07, r: 4, g: 0.5, b: 0.3 });
    stat(id).shots++;
    if (player.local) sfx.piu(L, player.arsenal.heat[id] ?? 0);
  }

  // pellets: a shell of pellets in a cone, the flash, the kick.
  function shell(player, place, w, id) {
    const f = player.fish;
    const L = f.length;
    muzzleOf(player, place, muzzle);
    models.recoil(player, place);
    aimFrom(muzzle, L, aimDir);
    const speed = w.speed(L);
    // Water stops the pellets: at the end of the reach they have a quarter of their speed left
    // (d = 0.75 v / k); after that they sink and lie a few seconds.
    const drag = (0.75 * speed) / w.reach(L);
    const life = (3 * w.reach(L)) / speed + 7;
    const volley = ++volleys;
    const dmg = w.damage * damageScale(L);
    for (let i = 0; i < w.pellets; i++) {
      cone(aimDir, w.cone, tmp);
      // (Not all at once off the muzzle: a little stagger along the shot.)
      flight.copy(tmp).multiplyScalar(speed * (0.92 + 0.16 * random()));
      const p = projectiles.spawn(player.id, id, muzzle, flight, f.river.s);
      p.damage = dmg;
      p.radius = w.radius(L);
      p.life = life;
      p.size = w.size(L);
      p.tint = w.tint;
      p.stretch = w.stretch;
      p.volley = volley;
      p.falloff = w.falloff;
      p.water = true;
      p.drag = drag;
      p.speed0 = flight.length();
      p.shove = (w.shove * L) / w.pellets;
      p.shooter = L;
    }
    flash(muzzle, aimDir, L, w.flash, 1.3, f.river.s);
    kick(player, aimDir, w.recoil);
    stat(id).shots++;
    if (player.local) sfx.flinte(L);
  }

  // lob: a grenade on an arc to land at the crosshair. Under water it is slowed (`WATER_DRAG`)
  // and sinks slower than it would fall (`WATER_SINK`); the launch angle is searched for that
  // curve, so it still comes down at the crosshair.
  function lob(player, place, w, id) {
    const f = player.fish;
    const L = f.length;
    muzzleOf(player, place, muzzle);
    models.recoil(player, place);
    aimFrom(muzzle, L, aimDir);
    const v = w.speed(L);
    // The target: the crosshair's point, no further than the reach.
    tmp.subVectors(aim.point, muzzle);
    if (tmp.dot(aim.direction) < 0 || tmp.lengthSq() < 0.09 * L * L) tmp.copy(aimDir).multiplyScalar(4 * L);
    const g = WATER_SINK;
    const k = WATER_DRAG;
    const reach = w.reach(L);
    let d = 0,
      h = 0,
      angle = 0;
    const solve = () => {
      d = Math.hypot(tmp.x, tmp.z);
      h = tmp.y;
      if (d > reach) {
        h *= reach / d;
        tmp.x *= reach / d;
        tmp.z *= reach / d;
        d = reach;
      }
      if (d < 0.05 * L) {
        angle = Math.asin(Math.max(-1, Math.min(1, aimDir.y)));
        return;
      }
      // With drag k and a pull g: x(t) = vx (1 - e^-kt) / k, y(t) = (vy + g/k)(1 - e^-kt)/k - g t / k.
      // The lowest angle whose curve passes nearest the target at its distance.
      let best = Infinity;
      angle = Math.PI / 4;
      for (let a = -0.7; a <= 1.3; a += 0.02) {
        const vx = v * Math.cos(a),
          vy = v * Math.sin(a);
        const q = 1 - (d * k) / vx;
        if (q <= 0) continue;
        const t = -Math.log(q) / k;
        const y = ((vy + g / k) * (1 - q)) / k - (g * t) / k;
        const miss = Math.abs(y - h);
        if (miss < best - 1e-3) {
          best = miss;
          angle = a;
        }
      }
    };
    solve();
    // A target under the crosshair is led: where it will be when the grenade gets there.
    const target = aim.target;
    if (target && !target.dead && target.velocity) {
      const time = d / Math.max(1e-3, v * Math.cos(angle));
      tmp.subVectors(target.position, muzzle).addScaledVector(target.velocity, Math.min(0.8, time));
      solve();
    }
    // (A shot straight down or up keeps the view's direction.)
    const hx = d > 1e-4 ? tmp.x / Math.hypot(tmp.x, tmp.z) : aimDir.x;
    const hz = d > 1e-4 ? tmp.z / Math.hypot(tmp.x, tmp.z) : aimDir.z;
    const norm = Math.hypot(hx, hz) || 1;
    flight.set((hx / norm) * Math.cos(angle) * v, Math.sin(angle) * v, (hz / norm) * Math.cos(angle) * v);
    const p = projectiles.spawn(player.id, id, muzzle, flight, f.river.s);
    p.damage = w.direct * damageScale(L);
    p.radius = w.radius(L);
    p.life = w.fuse;
    p.size = w.size(L);
    p.tint = w.tint;
    p.stretch = 1;
    p.gravity = g;
    p.drag = k;
    p.bounce = w.bounce;
    p.maxBounces = 1;
    p.fuse = true;
    p.sky = Infinity;
    p.solid = "grenade";
    p.scale = L;
    p.shooter = L;
    aimDir.copy(flight).normalize();
    flash(muzzle, aimDir, L, w.flash, 0.8, f.river.s);
    kick(player, aimDir, w.recoil);
    stat(id).shots++;
    if (player.local) sfx.granate(L);
  }

  // A blast at `at`: everything in the radius takes the splash (less toward the edge), is
  // thrown outward, the outer half stunned belly-up; the fish that fired is only pushed.
  function blast(owner, at, w, id, L, direct = null) {
    const R = w.blast(L);
    const dS = damageScale(L);
    const s = stat(id);
    s.blasts = (s.blasts ?? 0) + 1;
    const shooter = playerOf(owner);
    locate(at.x, at.z, where.s, where);
    const top = level(where.s);
    const floor = bed(where.s, where.u);
    // (For the tests: the last few blasts, [from the fish, under the surface, over the bed] in
    // fish lengths, and whether it was a direct hit; and where the last one was.)
    if (options.debug && shooter) {
      const log = (s.blastLog ??= []);
      log.push([+(shooter.fish.position.distanceTo(at) / L).toFixed(1), +((top - at.y) / L).toFixed(1), +((at.y - floor) / L).toFixed(1), direct ? "hit" : "-"]);
      if (log.length > 8) log.shift();
      s.lastBlast = [at.x, at.y, at.z];
    }
    for (const e of enemies.list) {
      if (e.dead && e !== direct && e.corpse > 1.5) continue;
      bodyEnds(e, tail, head);
      const d = Math.max(0, pointSegment(at, tail, head, closest) - e.size * 0.09);
      if (d > R) continue;
      const k = d / R;
      const amount = w.damage * dS * (1 - (1 - w.edge) * k);
      tmp.subVectors(e.position, at);
      if (tmp.lengthSq() < 1e-8) tmp.set(random() - 0.5, 0.5, random() - 0.5);
      tmp.normalize();
      const small = Math.min(1, Math.sqrt(L / e.size));
      shove(e, tmp, w.shove * L * small * (1 - 0.5 * k));
      const sunk = damage(owner, e, amount, tmp, closest, id, true, { mode: "lob", blast: true, burst: k < 0.5, point: at, power: 1 - k });
      if (!sunk && k >= 0.5) stun(e, w.stun, true, L);
    }
    // The fish that fired, and any other player in reach: pushed, never hurt.
    for (const p of ctx.players) {
      if (p.down) continue;
      const d = p.fish.position.distanceTo(at);
      if (d > R * 1.3) continue;
      tmp.subVectors(p.fish.position, at).normalize();
      kick(p, tmp, -1.4 * (1 - d / (R * 1.3)));
    }
    // What it looks like. The flash: a white-hot core held six frames and a short orange
    // fireball in it -- then what a charge leaves in water: a grey-brown bubble of gas
    // swelling and rising, dark gravel flung out on arcs as in air, a brown ring of silt
    // rolling out along the bed, and a column of bubbles.
    const [r, g, b] = w.flash;
    fx.spark(at.x, at.y, at.z, { size: R * 0.9, life: 0.1, r: r * 1.3, g: g * 1.55, b: b * 2.6 });
    fx.spark(at.x, at.y, at.z, { size: R * 2, life: 0.12, r: r * 0.2, g: g * 0.19, b: b * 0.2 });
    for (let i = 0; i < 9; i++) {
      sphere(tmp, look);
      const v = R * (1.5 + 2 * look());
      fx.spark(at.x + tmp.x * R * 0.2, at.y + tmp.y * R * 0.2, at.z + tmp.z * R * 0.2, { vx: tmp.x * v, vy: tmp.y * v, vz: tmp.z * v, size: R * (0.4 + 0.3 * look()), life: 0.16 + 0.1 * look(), r: 2.6, g: 1.05, b: 0.25, stretch: 1.2 });
    }
    // The shock front: a thin bright ring, gone in a few frames.
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * Math.PI * 2 + look() * 0.2;
      const v = R * 11;
      fx.spark(at.x, at.y, at.z, { vx: Math.cos(a) * v, vy: (look() - 0.5) * v * 0.1, vz: Math.sin(a) * v, size: R * 0.1, life: 0.1, r: 1.1, g: 1.2, b: 1.35, stretch: 4 });
    }
    // The gas: puffs pushed out, then slowing, swelling, rising; darker in the middle.
    for (let i = 0; i < 16; i++) {
      sphere(tmp, look);
      const v = R * (1.2 + 2 * look());
      puff(GAS, at.x + tmp.x * R * 0.3, at.y + tmp.y * R * 0.3, at.z + tmp.z * R * 0.3, tmp.x * v, tmp.y * v + R * 0.4, tmp.z * v, R * (0.6 + 0.3 * look()), 3, 2.6 + 1.4 * look(), 0.8, 2.6, R * 0.8, where.s, top, floor);
    }
    for (let i = 0; i < 2; i++) puff(POWDER, at.x, at.y + i * R * 0.3, at.z, 0, R * 0.6, 0, R * 1.0, 2.4, 3.4, 0.6, 1.5, R * 0.5, where.s, top, floor);
    // Gravel and dirt flung out on arcs (as in air: speeds as the launcher's, sqrt(L)).
    const near = at.y - floor < R * 1.2;
    const grit = near ? 16 : 7;
    for (let i = 0; i < grit; i++) {
      sphere(tmp, look);
      tmp.y = Math.abs(tmp.y) * (near ? 1.3 : 1);
      tmp.normalize();
      const v = (7 + 10 * look()) * Math.sqrt(L);
      puff(GRIT, at.x, near ? Math.max(at.y, floor + 0.01) : at.y, at.z, tmp.x * v, tmp.y * v, tmp.z * v, R * (0.025 + 0.03 * look()), 1, 1.2, 0.95, 0.6, -GRAVITY, where.s, top, floor);
    }
    // A few hot fragments.
    fx.burst(at.x, at.y, at.z, { count: 5, speed: R * 9, size: R * 0.05, life: 0.25, r: 6, g: 2.4, b: 0.6, random: look });
    // Silt off the bed: a low brown ring rolling outward.
    if (near) {
      const n = 12;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + look() * 0.4;
        const v = R * (3.5 + 2 * look());
        puff(SILT, at.x + Math.cos(a) * R * 0.3, floor + R * 0.15, at.z + Math.sin(a) * R * 0.3, Math.cos(a) * v, R * (0.3 + 0.5 * look()), Math.sin(a) * v, R * (0.45 + 0.2 * look()), 3.2, 3.5 + 1.5 * look(), 0.6, 1.6, R * 0.05, where.s, top, floor);
      }
    }
    // The bubble column: the gas of the charge boiling up.
    fx.fizz(at.x, at.y, at.z, { count: 16, size: 0.03 * L + 0.01, spread: R * 1.1, rise: 1.8, random: look });
    fx.fizz(at.x, at.y + R * 0.5, at.z, { count: 8, size: 0.05 * L + 0.015, spread: R * 0.6, rise: 2.4, random: look });
    if (top - at.y < R * 1.2) {
      game.falls?.splash?.(at.x, top, at.z, 2 + 6 * L);
      game.ripples?.add?.(at.x, at.z, 3 + 4 * L);
    }
    if (isLocal(owner)) sfx.explosion(L, camera ? camera.position.distanceTo(at) / Math.max(0.3, L) : 4);
  }

  // blade: a cut begins. The blade crosses the arc over `swing` seconds; what it passes is
  // cut then (swings are carried on in `bladeSteps`).
  function cut(player, place, w, id) {
    const b = bladeOf(player);
    if (!b.drawn) {
      b.drawn = true;
      if (player.local) sfx.katanaDraw();
    }
    b.side = -b.side;
    b.lastCut = clock;
    b.swings.push({ age: 0, side: b.side, from: b.side * w.arc * 0.5, hit: new Set() });
    models.recoil(player, place);
    stat(id).shots++;
    if (player.local) sfx.katanaSwing(b.side);
  }
  // A lunge with the blade out is a dash cut: looked for before the enemies move, so the
  // lunge is safe from its very first step.
  function dashCheck(player) {
    const b = bladeOf(player);
    const f = player.fish;
    const lunges = f.lungeCount ?? 0;
    if (lunges === b.lunges) return;
    b.lunges = lunges;
    const a = player.arsenal;
    if (a.back !== "katana" && a.belly !== "katana") return;
    const w = WEAPONS.katana;
    const out = b.drawn && (clock - b.lastCut < w.sheathe || b.held);
    if (!out || player.down) return;
    const from = (f.mouth ?? f.position).clone();
    b.dash = { age: 0, from, to: from.clone(), hit: new Set() };
    player.safeUntil = Math.max(player.safeUntil ?? 0, (ctx.clock?.() ?? clock) + w.dashTime);
    stat("katana").dashes = (stat("katana").dashes ?? 0) + 1;
    if (player.local) sfx.katanaDash();
  }

  // The fish's own frame: forward (with pitch), right, up.
  function frameOf(f, fwd, right, upward) {
    fwd.copy(f.heading).normalize();
    right.crossVectors(fwd, UP);
    if (right.lengthSq() < 1e-6) right.set(0, 0, 1);
    right.normalize();
    upward.crossVectors(right, fwd).normalize();
  }
  const fwd = new THREE.Vector3(),
    right = new THREE.Vector3(),
    upward = new THREE.Vector3();

  // The katana's swings and dash for one player, each step.
  function bladeSteps(player, dt) {
    const b = blades.get(player.id);
    if (!b) return;
    const a = player.arsenal;
    const carried = a.back === "katana" || a.belly === "katana";
    const f = player.fish;
    const L = f.length;
    const w = WEAPONS.katana;
    if (!carried) {
      b.swings.length = 0;
      b.dash = null;
      b.drawn = false;
      return;
    }
    frameOf(f, fwd, right, upward);
    const dS = damageScale(L);
    // The swings.
    for (let i = b.swings.length - 1; i >= 0; i--) {
      const s = b.swings[i];
      if (s.age < w.swing) {
        const a0 = s.from * (1 - 2 * Math.min(1, s.age / w.swing));
        const a1 = s.from * (1 - 2 * Math.min(1, (s.age + dt) / w.swing));
        const lo = Math.min(a0, a1),
          hi = Math.max(a0, a1);
        // The blade plane tilts 15 degrees, the other way on the other cut.
        const tilt = s.side * 0.26;
        // What it passes.
        for (const e of enemies.list) {
          if (e.dead || s.hit.has(e)) continue;
          bodyEnds(e, tail, head);
          const d = pointSegment(f.position, tail, head, closest);
          if (d > w.reach(L) + e.size * 0.09) continue;
          tmp.subVectors(closest, f.position);
          const along = tmp.dot(fwd),
            across = tmp.dot(right),
            high = tmp.dot(upward) - across * Math.tan(tilt);
          if (Math.abs(high) > w.height * L + e.size * 0.12) continue;
          const angle = Math.atan2(across, along);
          // (Right next to the fish counts wherever the blade is.)
          if (angle < lo - 0.05 || angle > hi + 0.05) continue;
          s.hit.add(e);
          // Konter: a cut into the tell or the strike itself stops it.
          const striking = e.mode === "coil" || e.mode === "strike";
          tmp2.copy(right).multiplyScalar(-s.side).addScaledVector(fwd, 0.4).normalize();
          const sunk = damage(player.id, e, w.damage * dS, tmp2, closest, "katana", true, { mode: "blade", cut: true, plane: tmp2.clone(), point: closest });
          if (player.local) sfx.katanaHit(e.size);
          if (striking) {
            stat("katana").konter = (stat("katana").konter ?? 0) + 1;
            if (!sunk) stun(e, w.konter, false, L, true);
            if (player.local) {
              sfx.konter();
              hud.say("Konter!", "", 0.7);
            }
            // Steel on bone: a white glint and a few sparks, nothing more.
            fx.spark(closest.x, closest.y, closest.z, { size: 0.12 * L, life: 0.08, r: 5, g: 5, b: 5.5 });
            fx.burst(closest.x, closest.y, closest.z, { count: 5, speed: 3 * L, size: 0.03 * L, life: 0.12, r: 5, g: 4.6, b: 4, random: look });
          }
        }
      }
      s.age += dt;
      // (Kept a moment after the cut: its arc of light fades.)
      if (s.age >= w.swing + TRAIL) b.swings.splice(i, 1);
    }
    // The dash cut: everything near the path so far, and a little ahead of the snout.
    if (b.dash) {
      const dash = b.dash;
      if (dash.age < w.dashTime) {
        head.copy(f.mouth ?? f.position).addScaledVector(fwd, 0.25 * L);
        dash.to.copy(head);
        for (const e of enemies.list) {
          if (e.dead || dash.hit.has(e)) continue;
          const d = pointSegment(e.position, dash.from, head, closest);
          if (d > w.dashReach * L + e.size * 0.3) continue;
          dash.hit.add(e);
          tmp2.copy(right).multiplyScalar(look() < 0.5 ? 1 : -1).addScaledVector(fwd, 0.5).normalize();
          damage(player.id, e, w.damage * w.dash * dS, tmp2, e.position, "katana", true, { mode: "blade", cut: true, dash: true, plane: tmp2.clone(), point: e.position.clone() });
          if (player.local) sfx.katanaHit(e.size);
        }
      }
      dash.age += dt;
      if (dash.age >= w.dashTime + 0.2) b.dash = null;
    }
    // Back into the scabbard after a while without a cut.
    if (b.drawn && !b.held && clock - b.lastCut > w.sheathe && !b.dash) {
      b.drawn = false;
      if (player.local) sfx.sheathe();
    }
  }

  // flame: the jet, a step of it. Damage to what is in the cone, fire to what it touches.
  const flameAt = new THREE.Vector3();
  const flameDir = new THREE.Vector3();
  const coneE = [];
  const coneT = [];
  function jet(player, place, w, id, dt) {
    const f = player.fish;
    const L = f.length;
    muzzleOf(player, place, flameAt);
    aimFrom(flameAt, L, flameDir);
    const reach = w.reach(L);
    const dS = damageScale(L);
    // (Up through the surface only so far.)
    locate(flameAt.x, flameAt.z, f.river.s, where);
    const ceiling = level(where.s) + w.sky * L;
    let n = 0;
    for (const e of enemies.list) {
      if (e.dead || e.position.y > ceiling) continue;
      bodyEnds(e, tail, head);
      // The body's point nearest the jet's axis (a few samples along it).
      let best = Infinity,
        bestT = 0;
      for (let k = 0; k <= 4; k++) {
        tmp.lerpVectors(tail, head, k / 4).sub(flameAt);
        const t = tmp.dot(flameDir);
        if (t < -0.1 * L || t > reach) continue;
        const across = Math.sqrt(Math.max(0, tmp.lengthSq() - t * t));
        const allowed = Math.tan(w.cone) * Math.max(0, t) + 0.06 * L + e.size * 0.1;
        const over = across - allowed;
        if (over < best) {
          best = over;
          bestT = t;
        }
      }
      if (best > 0) continue;
      // (Kept sorted near to far as they come: the jet burns the nearest first.)
      let j = n++;
      while (j > 0 && coneT[j - 1] > bestT) {
        coneT[j] = coneT[j - 1];
        coneE[j] = coneE[j - 1];
        j--;
      }
      coneT[j] = bestT;
      coneE[j] = e;
    }
    for (let i = 0; i < Math.min(w.targets, n); i++) {
      const e = coneE[i];
      ignite(e, player.id, w.burnTime);
      panic(e, w.panic, L);
      damage(player.id, e, w.damage * dS * dt, null, e.position, id, gorier(e, 0.15), FIRE_INFO);
    }
    coneE.fill(null, 0, n);
    // The flame itself: puffs thrown down the jet that swell, cool from white-yellow to
    // deep red and slow down (fire has drag in air as well). Each is born at the nozzle at
    // its own moment within the step, so the jet is one continuous tongue from the lance.
    const speed = 16 * L;
    const per = Math.max(4, Math.round(dt * 180));
    for (let i = 0; i < per; i++) {
      // Half hot streaks down the core, half billows that swell and roll at the end.
      const core = i % 2 === 0;
      cone(flameDir, w.cone * (core ? 0.45 : 0.85), tmp, look);
      flight.copy(tmp).multiplyScalar(speed * (0.85 + 0.3 * look()) * (core ? 1.05 : 0.9));
      // (Born u of a step ago: placed a step back, and the step's move brings it out.)
      const u = (i + look()) / per;
      tmp2.copy(flameAt).addScaledVector(flight, (u - 1) * dt);
      const p = projectiles.spawn(player.id, id, tmp2, flight, f.river.s);
      p.ghost = true;
      p.age = (u - 1) * dt;
      p.sky = w.sky * L;
      if (core) {
        p.drag = 4;
        p.life = 0.28 + 0.1 * look();
        p.size = w.size(L) * (0.55 + 0.45 * look());
        p.grow = 2.8;
        p.tint = w.tint;
        p.cool = FLAME_CORE_COOL;
        p.fade = 0.9;
        p.stretch = 2.8;
      } else {
        p.drag = 4.5;
        p.life = 0.36 + 0.12 * look();
        p.size = w.size(L) * (0.8 + 0.6 * look());
        p.grow = 4.5;
        p.tint = FLAME_BILLOW;
        p.cool = FLAME_BILLOW_COOL;
        p.fade = 1.1;
        p.stretch = 1.3;
      }
    }
    // Black smoke rolling off the end of the jet, and the water boiling round it (a few
    // small beads, not a froth).
    if (look() < dt * 12) {
      tmp.copy(flameAt).addScaledVector(flameDir, reach * (0.35 + 0.45 * look()));
      puff(SOOT, tmp.x, tmp.y, tmp.z, flameDir.x * speed * 0.2, flameDir.y * speed * 0.2 + 0.2 * L, flameDir.z * speed * 0.2, 0.25 * L, 3.8, 1.6 + 0.8 * look(), 0.55, 1.6, 0.35 * L, f.river.s);
    }
    if (look() < dt * 12) {
      tmp.copy(flameAt).addScaledVector(flameDir, reach * (0.2 + 0.7 * look()));
      fx.fizz(tmp.x, tmp.y, tmp.z, { count: 1, size: 0.01 * L + 0.004, spread: 0.3 * L, rise: 1.4, random: look });
    }
    models.recoil(player, place);
    stat(id).time = (stat(id).time ?? 0) + dt;
  }
  // Only now and then a splatter call for damage that comes every step.
  function gorier(e, every) {
    const t = lastGore.get(e) ?? -9;
    if (clock - t < every) return false;
    lastGore.set(e, clock);
    return true;
  }
  function ignite(e, owner, seconds) {
    const b = burning.get(e);
    if (b) {
      b.left = Math.max(b.left, seconds);
      return;
    }
    burning.set(e, { left: seconds, owner });
  }
  // Each step: burning enemies take damage, light their neighbours, shed fire, embers and
  // black smoke.
  function burn(dt) {
    const w = WEAPONS.flammen;
    for (const [e, b] of burning) {
      b.left -= dt;
      if (b.left <= 0 || (e.dead && e.corpse > 3)) {
        burning.delete(e);
        continue;
      }
      const L = lengthOf(b.owner);
      if (!e.dead) {
        damage(b.owner, e, w.burn * damageScale(L) * dt, null, e.position, "flammen", gorier(e, 0.3), BURN_INFO);
        // Neighbours catch (the closer, the sooner).
        for (const o of enemies.list) {
          if (o === e || o.dead || burning.has(o)) continue;
          const d = o.position.distanceTo(e.position) - 0.3 * (o.size + e.size);
          if (d < w.spread * L && random() < dt * 6) {
            ignite(o, b.owner, w.burnTime * 0.8);
            panic(o, w.panic, L);
          }
        }
      }
      bodyEnds(e, tail, head);
      if (look() < dt * 16) {
        tmp.lerpVectors(tail, head, look());
        fx.spark(tmp.x, tmp.y + e.size * 0.05, tmp.z, { vx: (look() - 0.5) * 0.3 * e.size, vy: 0.5 * e.size, vz: (look() - 0.5) * 0.3 * e.size, size: e.size * (0.1 + 0.08 * look()), life: 0.22, r: 3.2, g: 1.2, b: 0.25, stretch: 1.2 });
      }
      if (look() < dt * 6) {
        tmp.lerpVectors(tail, head, look());
        fx.spark(tmp.x, tmp.y, tmp.z, { vx: (look() - 0.5) * e.size, vy: e.size * (0.5 + look()), vz: (look() - 0.5) * e.size, size: 0.02 * e.size + 0.01, life: 0.5, r: 5, g: 1.4, b: 0.2, stretch: 2 });
      }
      if (look() < dt * 4) {
        tmp.lerpVectors(tail, head, look());
        puff(SOOT, tmp.x, tmp.y + e.size * 0.1, tmp.z, 0, 0.3 * e.size, 0, 0.15 * e.size, 3, 1.3 + 0.5 * look(), 0.32, 1.5, 0.25 * e.size, e.river?.s ?? null);
      }
    }
  }

  // ---- Magazines: a reload starts when the last round is gone, or after a rest with some
  // spent; the rounds come back when it is done.
  function magazine(player, id, dt) {
    const a = player.arsenal;
    const w = WEAPONS[id];
    if (!w?.shells) return;
    if (a.reloading[id] > 0) {
      a.reloading[id] -= dt;
      if (a.reloading[id] <= 0) {
        a.reloading[id] = 0;
        a.ammo[id] = w.shells;
      }
      return;
    }
    const spent = a.ammo[id] < w.shells;
    if (a.ammo[id] <= 0 || (spent && a.fired[id] > (w.idleReload ?? Infinity))) {
      a.reloading[id] = w.reload;
      stat(id).reloads = (stat(id).reloads ?? 0) + 1;
      if (player.local) sfx.reload(id, w.reload);
    }
  }

  // ---- One step of one player's weapons, before the enemies move. `held(place)`: the
  // trigger for that place.
  const PLACES = ["back", "belly"];
  function fire(player, dt, held, can) {
    const a = player.arsenal;
    a.cool(dt);
    for (const place of PLACES) {
      const id = a[place];
      if (!id) continue;
      magazine(player, id, dt);
      const w = WEAPONS[id];
      if (!w) continue;
      const on = can && !player.down && held(place) && !a.locked[id];
      if (w.mode === "blade") bladeOf(player).held = on;
      if (w.mode === "flame") {
        if (on) {
          jet(player, place, w, id, dt);
          a.heat[id] += w.heat * dt;
          a.fired[id] = 0;
          if (a.heat[id] >= 1) {
            a.locked[id] = true;
            if (player.local) sfx.flameEmpty();
          }
        }
        if (player.local) sfx.flame(on && !a.locked[id], a.heat[id], player.fish.length);
        continue;
      }
      if (!on) continue;
      while (a.cooldown[place] <= 0) {
        if (w.shells && (a.ammo[id] <= 0 || a.reloading[id] > 0)) break;
        a.cooldown[place] += w.interval;
        if (w.mode === "bolt") bolt(player, place, w, id);
        else if (w.mode === "pellets") shell(player, place, w, id);
        else if (w.mode === "lob") lob(player, place, w, id);
        else if (w.mode === "blade") cut(player, place, w, id);
        a.fired[id] = 0;
        if (w.shells) a.ammo[id]--;
        if (w.mode === "bolt" && w.heat) {
          a.heat[id] += w.heat;
          if (a.heat[id] >= 1) {
            a.locked[id] = true;
            if (player.local) sfx.overheat(id);
            break;
          }
        }
      }
    }
    dashCheck(player);
    // A weapon that has cooled enough clicks back on.
    for (const id in a.locked) {
      if (a.wasLocked[id] && !a.locked[id] && player.local) sfx.unlocked(id);
      a.wasLocked[id] = a.locked[id];
    }
  }

  // ---- What happens after the enemies have moved: throws, stuns, fire, blades.
  const shoveStep = new THREE.Vector3();
  function after(dt) {
    clock += dt;
    for (const [e, s] of shoves) {
      const move = shoveStep.copy(s.v).multiplyScalar(dt);
      e.position.add(move);
      locate(e.position.x, e.position.z, e.river.s, e.river);
      const floor = bed(e.river.s, e.river.u),
        top = level(e.river.s);
      if (top - floor < e.size * 0.3) {
        // Not onto the bank.
        e.position.sub(move);
        locate(e.position.x, e.position.z, e.river.s, e.river);
        shoves.delete(e);
        continue;
      }
      e.position.y = Math.min(Math.max(e.position.y, floor + e.size * 0.1), top - e.size * 0.05);
      s.v.multiplyScalar(Math.exp(-dt / s.tau));
      if (s.v.lengthSq() < 1e-4) shoves.delete(e);
    }
    for (const [e, until] of stuns) {
      if (e.dead) {
        stuns.delete(e);
        continue;
      }
      const on = clock < until;
      e.rolled = on ? Math.min(Math.PI, (e.rolled ?? 0) + dt * 9) : Math.max(0, (e.rolled ?? 0) - dt * 4);
      if (!on && e.rolled <= 0) stuns.delete(e);
    }
    burn(dt);
    for (const p of ctx.players) bladeSteps(p, dt);
  }

  // ---- The shots landing (projectiles.update's callbacks). A shot record goes back to its
  // pool after its callback: nothing of it is kept.

  // The pellets of one shell on one enemy are told to the splatter as one hit (flush()).
  const volleyGore = [];
  let volleyCount = 0;
  function pelletGore(owner, e, volley, point, dir, weapon, power) {
    for (let i = 0; i < volleyCount; i++) {
      const r = volleyGore[i];
      if (r.e === e && r.volley === volley) {
        r.n++;
        r.point.add(point);
        r.dir.add(dir);
        r.power = Math.max(r.power, power);
        return;
      }
    }
    const r = (volleyGore[volleyCount] ??= { e: null, volley: 0, n: 0, point: new THREE.Vector3(), dir: new THREE.Vector3(), weapon: null, power: 0, owner: 0 });
    volleyCount++;
    r.owner = owner;
    r.e = e;
    r.volley = volley;
    r.n = 1;
    r.point.copy(point);
    r.dir.copy(dir);
    r.weapon = weapon;
    r.power = power;
  }
  function onEnemy(shot, e) {
    flight.copy(shot.velocity).normalize();
    const w = WEAPONS[shot.weapon];
    if (w?.mode === "lob") {
      damage(shot.owner, e, shot.damage, flight, shot.position, shot.weapon, true, { mode: "lob", direct: true, point: shot.position });
      blast(shot.owner, shot.position, w, shot.weapon, shot.shooter, e);
      return;
    }
    let amount = shot.damage;
    let power = 1;
    if (shot.falloff) {
      const k = shot.age / shot.life;
      const [full, least] = shot.falloff;
      power = k <= full ? 1 : 1 - (1 - least) * ((k - full) / (1 - full));
      amount *= power;
    }
    const L = shot.shooter;
    let sunk = false;
    if (shot.volley) {
      // A shell's pellets on one fish: counted, so a full hit at point blank bursts it.
      let v = volleyHits.get(e);
      if (!v) volleyHits.set(e, (v = { volley: 0, n: 0 }));
      if (v.volley !== shot.volley) {
        v.volley = shot.volley;
        v.n = 0;
      }
      const n = ++v.n;
      const pellets = w?.pellets ?? 9;
      // (Point blank, while the shell still has its full force: a weak fish that takes most
      // of it bursts; one that dies to the first few is reported burst to the splatter.)
      const weak = power >= 1 && e.maxHp <= (w?.burstHp ?? 22);
      const burst = weak && n >= Math.ceil(pellets * 0.6);
      const splat = weak && n >= 4;
      if (shot.shove && e.size < L * 1.6) shove(e, flight, shot.shove * power * Math.min(1, Math.sqrt((L * 1.2) / e.size)));
      else if (shot.shove) shove(e, flight, shot.shove * power * 0.35);
      sunk = damage(shot.owner, e, burst ? Math.max(amount, e.hp + 1) : amount, flight, shot.position, shot.weapon, false, { mode: "pellets", burst: burst || splat, power, point: shot.position });
      if (!sunk) pelletGore(shot.owner, e, shot.volley, shot.position, flight, shot.weapon, power);
    } else {
      sunk = damage(shot.owner, e, amount, flight, shot.position, shot.weapon, true, { mode: w?.mode ?? "bolt", power, point: shot.position });
      // The laser's pulse burns: an ember glowing a moment in the wound.
      if (w?.mode === "bolt" && !sunk) fx.spark(shot.position.x, shot.position.y, shot.position.z, { size: 0.025 + 0.03 * L, life: 0.3, r: 5, g: 1.2, b: 0.3 });
    }
    if (isLocal(shot.owner)) sfx.hit(shot.weapon);
    return sunk;
  }
  // After the shots have flown: the shells' pellets told to the splatter, one call a shell
  // and a fish (not for a fish the shell sank: the kill has been told).
  function flush() {
    for (let i = 0; i < volleyCount; i++) {
      const r = volleyGore[i];
      if (!r.e.dead) {
        r.point.divideScalar(r.n);
        r.dir.normalize();
        const pellets = WEAPONS[r.weapon]?.pellets ?? 9;
        gore.hit(r.e, r.point, r.dir, r.weapon, { mode: "pellets", pellets: r.n, power: (r.n / pellets) * r.power, point: r.point.clone() });
        if (isLocal(r.owner)) hud.hit(false);
      }
      r.e = null;
    }
    volleyCount = 0;
  }
  // A shot into the bed: pellets and bolts kick up a puff of silt (the laser also boils a
  // few beads); fire and grenades have their own endings.
  function onGround(shot) {
    const w = WEAPONS[shot.weapon];
    if (w?.mode === "lob") return blast(shot.owner, shot.position, w, shot.weapon, shot.shooter);
    if (shot.ghost) return;
    const L = shot.shooter;
    const p = shot.position;
    puff(SILT, p.x, p.y + 0.02 * L, p.z, 0, 0.4 * L, 0, 0.08 * L + 0.02, 2.6, 1.2 + 0.6 * look(), 0.4, 3, 0.05 * L, shot.river.s);
    if (w?.mode === "bolt") {
      fx.spark(p.x, p.y, p.z, { size: 0.02 + 0.02 * L, life: 0.2, r: 4, g: 1, b: 0.25 });
      fx.fizz(p.x, p.y, p.z, { count: 2, size: 0.008 + 0.006 * L, spread: 0.05 * L, rise: 0.8, random: look });
    }
    if (isLocal(shot.owner)) sfx.ground();
  }
  // Off a stone: the same puff, and a pellet ricochets with a spark.
  function onStone(shot) {
    const w = WEAPONS[shot.weapon];
    if (w?.mode === "lob") return blast(shot.owner, shot.position, w, shot.weapon, shot.shooter);
    if (shot.ghost) return;
    const L = shot.shooter;
    const p = shot.position;
    puff(SILT, p.x, p.y, p.z, 0, 0.3 * L, 0, 0.06 * L + 0.015, 2.4, 1 + 0.5 * look(), 0.3, 3, 0.05 * L, shot.river.s);
    if (w?.mode === "pellets" && look() < 0.5) {
      sphere(tmp, look);
      fx.spark(p.x, p.y, p.z, { vx: tmp.x * 3, vy: Math.abs(tmp.y) * 3, vz: tmp.z * 3, size: 0.015 + 0.01 * L, life: 0.08, r: 5, g: 4, b: 2.5, stretch: 4 });
    }
    if (isLocal(shot.owner)) sfx.ground();
  }
  function onBounce(shot, what) {
    const L = shot.shooter;
    const p = shot.position;
    fx.fizz(p.x, p.y, p.z, { count: 2, size: 0.006 + 0.006 * L, spread: 0.05 * L, rise: 0.5, random: look });
    puff(SILT, p.x, p.y, p.z, 0, 0.3 * L, 0, 0.1 * L, 2.5, 1.2, what === "bed" ? 0.4 : 0.2, 3, 0.05 * L, shot.river.s);
    if (isLocal(shot.owner)) sfx.bounce(what);
  }
  function onExpire(shot) {
    const w = WEAPONS[shot.weapon];
    if (w?.mode === "lob") blast(shot.owner, shot.position, w, shot.weapon, shot.shooter);
  }

  // ---- Each step, after the shots have flown: what trails behind them. A grenade draws a
  // thread of gas bubbles and a faint wisp of smoke all along its path through the step,
  // so its arc stays in the water a moment and can be followed.
  function trails(dt) {
    for (const p of projectiles.live) {
      if (!p.solid) continue;
      const L = p.scale;
      for (let k = 0; k < 4; k++) {
        const u = (k + look()) / 4;
        tmp.lerpVectors(p.last, p.position, u);
        fx.bubble(tmp.x, tmp.y, tmp.z, 0.008 + 0.022 * L * (0.6 + 0.8 * look()), { rise: 0.4, life: 0.5, random: look });
        if (k % 2 === 0) puff(GAS, tmp.x, tmp.y, tmp.z, 0, 0.1 * L, 0, 0.05 * L + 0.012, 3, 0.55 + 0.25 * look(), 0.5, 3, 0.2 * L, p.river.s);
      }
    }
  }

  // ---- The picture of this frame (it goes on in the pause: nothing here moves or spawns
  // anything): the shots in flight, the katana's arc, the weapons' own lights.
  function draw(local) {
    if (camera) camera.getWorldPosition(eye);
    const tall = 2 * Math.tan(((camera?.fov ?? 62) * Math.PI) / 360);
    for (const p of projectiles.live) {
      if (p.solid) continue;
      const k = Math.min(1, Math.max(0, p.age / p.life));
      let r = p.tint[0],
        g = p.tint[1],
        b = p.tint[2];
      if (p.cool) {
        r += (p.cool[0] - r) * k;
        g += (p.cool[1] - g) * k;
        b += (p.cool[2] - b) * k;
      }
      const fade = p.fade ? Math.pow(Math.max(0, 1 - k), p.fade) : 1;
      let size = p.size * (1 + p.grow * k);
      const v = p.velocity;
      if (p.core) {
        // A needle: never thinner than about five pixels (its core three), so the temporal
        // blend keeps it; a white-hot core down the red sheath.
        if (camera) size = Math.max(size, 0.007 * tall * eye.distanceTo(p.position));
        fx.add(p.position.x, p.position.y, p.position.z, size, r, g, b, p.stretch, v.x, v.y, v.z);
        fx.add(p.position.x, p.position.y, p.position.z, size * 0.45, p.core[0], p.core[1], p.core[2], p.stretch * 1.4, v.x, v.y, v.z);
        continue;
      }
      fx.add(p.position.x, p.position.y, p.position.z, size, r * fade, g * fade, b * fade, p.stretch, v.x, v.y, v.z);
    }
    // The katana: a thin crescent of light where the blade's tip has just been, and the
    // dash cut's line along its path, both fading in a moment.
    if (ribbons) {
      ribbons.begin();
      for (const player of ctx.players) {
        const b = blades.get(player.id);
        if (!b || player.down) continue;
        const f = player.fish;
        const L = f.length;
        const w = WEAPONS.katana;
        frameOf(f, fwd, right, upward);
        const R = w.reach(L);
        for (const s of b.swings) {
          const t1 = Math.min(s.age, w.swing),
            t0 = Math.max(0, s.age - TRAIL);
          if (t1 <= t0) continue;
          const tilt = Math.tan(s.side * 0.26);
          const n = 12;
          for (let i = 0; i <= n; i++) {
            const t = t0 + ((t1 - t0) * i) / n;
            const fresh = 1 - (s.age - t) / TRAIL;
            if (fresh <= 0) continue;
            const angle = s.from * (1 - 2 * Math.min(1, t / w.swing));
            const ca = Math.cos(angle),
              sa = Math.sin(angle);
            // The blade's way in its tilted plane; the arc from its last fifth to its tip.
            tmp.copy(fwd).multiplyScalar(ca).addScaledVector(right, sa).addScaledVector(upward, sa * tilt).normalize();
            const outer = R * 1.02,
              inner = R * (1 - 0.16 * fresh);
            const light = fresh * fresh;
            ribbons.point(f.position.x + tmp.x * inner, f.position.y + tmp.y * inner, f.position.z + tmp.z * inner, f.position.x + tmp.x * outer, f.position.y + tmp.y * outer, f.position.z + tmp.z * outer, 1.2 * light, 1.32 * light, 1.6 * light);
          }
          ribbons.cut();
        }
        if (b.dash) {
          const d = b.dash;
          const fresh = d.age < w.dashTime ? 1 : Math.max(0, 1 - (d.age - w.dashTime) / 0.2);
          if (fresh > 0) {
            const half = 0.03 * L;
            const n = 8;
            for (let i = 0; i <= n; i++) {
              const t = i / n;
              tmp.lerpVectors(d.from, d.to, t);
              const light = fresh * (0.25 + 0.75 * t);
              ribbons.point(tmp.x - right.x * half, tmp.y - right.y * half, tmp.z - right.z * half, tmp.x + right.x * half, tmp.y + right.y * half, tmp.z + right.z * half, 1.4 * light, 1.55 * light, 1.9 * light);
            }
            ribbons.cut();
          }
        }
      }
      ribbons.end();
    }
    if (!local || local.down || local.fish.captive) return;
    const a = local.arsenal;
    const L = local.fish.length;
    for (const place of PLACES) {
      const w = WEAPONS[a[place]];
      if (!w?.glow) continue;
      muzzleOf(local, place, muzzle);
      if (w.mode === "flame") {
        // The pilot light, always burning while the weapon is carried.
        if (!a.locked[a[place]]) fx.add(muzzle.x, muzzle.y, muzzle.z, 0.05 * L, w.glow[0], w.glow[1], w.glow[2], 1.6, local.fish.heading.x, local.fish.heading.y, local.fish.heading.z);
        continue;
      }
      // A weapon that is hot glows at the muzzle.
      const hot = Math.min(1, a.heat[a[place]] ?? 0);
      if (hot > 0.05) fx.add(muzzle.x, muzzle.y, muzzle.z, w.size(L) * (0.8 + 1.2 * hot), w.glow[0] * hot * 1.4, w.glow[1] * hot * 1.4, w.glow[2] * hot, 1);
    }
  }

  return { fire, after, trails, flush, onEnemy, onGround, onStone, onBounce, onExpire, draw, stunned, stats, burning, blades, options };
}
