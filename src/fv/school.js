// The salmon's own school, armed (plan, part 4: "Verbündete"). The base game has two schools
// (school.js, made in life.js): the smolt run -- silver smolts going down to the sea with the
// fish, breaking up at the coast -- and the run home, the grown salmon going up the river
// together. In Extreme the smolt school no longer breaks up at the coast: it stays with the
// fish at sea, its fish growing as the salmon grows, until the run home takes over. And from
// the smolt on every fish of either school carries one of the salmon's own guns of the stage
// it has reached, strapped on as the salmon's are (look/school-gear.js), and fights: it picks
// what is about to strike the salmon or one of the school first, then the nearest threat,
// turns its gun onto it a moment (the tell, as the enemies have one), and fires through the
// very code the salmon's own weapons fire through (weapons.js: createFiring, each fish a
// light record of its own), so that its bolts, pellets and blasts behave, look and sound as
// the salmon's do. It never goes for the peaceful shoal fish (e.neutral) nor for one that only
// flees, and it cannot hurt the salmon or the others: shots and blasts only ever strike
// enemies. It neither bites nor swallows.
//
// The enemies go for the school too (enemies.js: pick): a hunter striking into the school
// takes a school fish often, as the base game says. A school fish has strength of its own;
// hits and strikes wound it (the splatter shows on it as on an enemy), a fish big enough
// swallows it whole, and one that dies is gone from the school for good -- its body floats up
// belly first with its gun still strapped on (an enemy record of its own by then:
// enemies.fallen), or bursts, by the weapon, as the enemies' do. It comes back only with the
// next run: a new generation's school.
//
// Nothing of the base files changes: the smolt school is a school.js school of Extreme's own
// (its rule for when it runs is Extreme's), handed in where life.js keeps the base one, whose
// methods now go to it -- so the base game's badges, tips and the goosanders' drive, which
// read life.school, read this one.

import * as THREE from "three";
import { randomGenerator } from "../../shared/random.js";
import { level } from "../course.js";
import { phaseOf } from "../salmon.js";
import { createSchool } from "../school.js";
import { createSchoolGear } from "./look/school-gear.js";
import { SKY, WEAPONS, createArsenal } from "./weapons.js";

// The guns the school carries, by the salmon's stage: the ranged weapons of the stage it has
// reached and of the one or two before it, the newest first, handed round the school in turn
// so that it carries a mix. (No laser: a fry's gun. No flamethrower, mines, blades, beam or
// cannon: a school fish holding station round the salmon has no use for a jet at arm's length,
// mines dropped behind, a sword or a secret gun, and the beam is one of a kind.)
export const SCHOOL_ARMS = {
  5: ["minigun", "torpedo", "granate", "flinte"],
  6: ["raketen", "minigun", "torpedo", "granate"],
  7: ["panzerbuechse", "blitz", "raketen", "torpedo"],
  8: ["harpune", "panzerbuechse", "blitz", "raketen"],
  9: ["harpune", "panzerbuechse", "blitz", "raketen"],
};
const ALL_ARMS = [...new Set(Object.values(SCHOOL_ARMS).flat())];
// The smolt school's size, and the run's (life.js).
const SMOLTS = 16;
const RUN = 10;

// How a school fish uses each gun: `tell` seconds on target before the trigger goes down,
// then held `burst` seconds and let go `rest` [least, most]; `cone`: for a gun bolted under the
// belly, how far off its fish's heading the target may be (rad); `close`: the share of the
// gun's reach it fires within; `lead`: whether its rounds are led onto a moving target.
// (The rifle is held to steady and let go to fire: its burst is the steadying.)
const USE = {
  // (The minigun's burst counts from the trigger: its barrels wind up 0.45 s before the first round.)
  minigun: { tell: 0.3, burst: 0.95, rest: [1.8, 3.2], close: 0.85, lead: true },
  flinte: { tell: 0.35, burst: 0.25, rest: [1.2, 2.1], close: 0.7, lead: true },
  granate: { tell: 0.4, burst: 1, rest: [1.5, 3], close: 0.9, lead: false },
  torpedo: { tell: 0.35, burst: 0.8, rest: [2.2, 3.7], close: 0.8, cone: 0.6, lead: false },
  raketen: { tell: 0.4, burst: 0.5, rest: [1.8, 3.3], close: 0.6, lead: true },
  panzerbuechse: { tell: 0.3, burst: 0.75, rest: [0.9, 1.8], close: 0.9, lead: true },
  blitz: { tell: 0.3, burst: 0.9, rest: [1.2, 2.2], close: 0.9, cone: 0.55, lead: false },
  harpune: { tell: 0.4, burst: 0.3, rest: [1.8, 3], close: 0.8, cone: 0.25, lead: true },
};
// How far a school fish looks for what to fire at (units, by its length): it guards the
// salmon and itself, it does not snipe at what is still far off -- a long gun's reach is
// used only nearer than this.
const GUARD = (L) => 2.5 + 4 * L;
// What a school fish takes of a blow, as the salmon's strength bar would (difficulty and all):
// a little less, so a school stands a fight a while.
const TAKES = 2.5;
// Wounds heal slowly once nothing has struck it for this long (its strength a second).
const CALM = 6;
const HEAL = 0.01;
// Enemy guns heavy enough to burst a school fish they kill (weapons.js: bursts; the enemies'
// charges -- the sea mine, the bombs -- burst it anyway).
const HEAVY = new Set(["sawnoff", "pumpgun", "elephantgun", "minigun"]);

const UP = new THREE.Vector3(0, 1, 0);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
// The player's school: every enemy that means it is fair game, never one of the peaceful fish
// stood in for (neutrals.js) nor one that only flees, nor a bird high over the water. In a
// room only what this page runs: the school's shots stay on this page (weapons.js: `kept`),
// and an enemy another page runs is that page's to fight.
const fair = (e) => !e.dead && !e.remote && !e.neutral && !e.passive && !(e.spec.flies && e.position.y > level(e.river.s) + SKY);
const striking = (e) => e.mode === "coil" || e.mode === "strike" || e.mode === "aim" || e.mode === "fire";

// ctx: game (life, scene, camera, hud, mirror, now), enemies, firing, gore, sfx, fx,
// difficulty, players, clock() (combat's time).
export function createArmedSchool(ctx) {
  const { game, enemies, firing, gore, fx, difficulty, players } = ctx;
  const { life, scene, camera } = game;
  const random = randomGenerator(0x5c4001);
  const range = (a, b) => a + (b - a) * random();
  const clock = () => ctx.clock();

  // ---- The smolt school: Extreme's own, handed in where life.js keeps the base one.
  // It runs from the smolt on, at sea too, until the run home takes over: the run's own rule
  // (life.js), read here as the moment to go.
  const runsHome = (fish, w) => phaseOf(fish.stage) === "spawner" && w.sea + w.estuary < 0.4 && fish.river.s > 400 && fish.progress < 0.97;
  const stays = (fish, w) => {
    const phase = phaseOf(fish.stage);
    return phase === "smolt" || phase === "sea" || (phase === "spawner" && !runsHome(fish, w) && w.sea + w.estuary >= 0.4);
  };
  const base = life.school;
  const school = createSchool(scene, { random: randomGenerator(9912), count: SMOLTS, when: stays });
  game.mirror?.(school.meshes);
  // (The base school is never drawn again: its meshes keep no fish.)
  for (const mesh of base.meshes) {
    mesh.count = 0;
    mesh.visible = false;
  }
  const run = life.run;
  // Every fish either school has, the fallen too (they come back with the next run).
  const smoltsAll = [...school.members];
  const runAll = [...run.members];
  base.members = school.members;
  base.decoy = (...args) => school.decoy(...args);
  base.take = (at) => school.take(at);
  Object.defineProperty(base, "count", { configurable: true, get: () => school.count });
  base.reset = () => school.reset();
  base.update = function (dt, fish, time, food, lead) {
    school.update(dt, fish, time, food, lead);
    grow(fish);
  };
  // Its fish grow as the salmon grows: each keeps its size against the salmon's and its place
  // in the school in body lengths.
  function grow(fish) {
    const L = fish.length;
    for (const m of school.members) {
      if (!m.active) {
        m.grownFor = 0;
        continue;
      }
      // (Just joined: sized for the salmon as it is now.)
      if (!m.grownFor) m.grownFor = L;
      else if (Math.abs(L - m.grownFor) > 1e-4) {
        const k = L / m.grownFor;
        m.size *= k;
        m.offset.multiplyScalar(k);
        m.grownFor = L;
      }
    }
  }
  // The spawners going home carry the humped back and hooked jaw (life.js): their fallen too.
  const fallenSpawner = enemies.crowds.schoolSpawner?.materials?.uniforms;
  if (fallenSpawner?.coat_hump) {
    fallenSpawner.coat_hump.value = 0.7;
    fallenSpawner.coat_kype.value = 0.8;
  }

  // ---- Each fish of either school as a shooter: a light record the salmon's firing code
  // takes as it takes a player ({ fish, arsenal }), with its own aim, its own gun on its body
  // (`models`) and its own way of being heard (`sfx`: from where it is).
  const gear = createSchoolGear(scene, { ids: ALL_ARMS, capacity: SMOLTS + RUN, clock: () => game.now.time });
  // (A salmon of its own it has not: kick() reads the salmon's cruising speed if there is one.)
  const NO_SALMON = {};
  // The shots whose sounds it gives, by the name weapons.js asks for: made with the salmon's
  // own makings, heard from where the school fish is (sfx.from). Nothing else of the salmon's
  // weapons is heard of it: no reload clack, no overheat hiss, no loops -- but the minigun's
  // stream of rounds, which is the old king's minigun heard from where it is.
  const SHOTS = new Set(["flinte", "granate", "torpedo", "rocket", "rifle", "arc", "harpoon"]);
  const NOOP = () => {};
  function soundsOf(rec) {
    const sfx = ctx.sfx;
    const at = () => rec.fish.position.distanceTo(camera.position);
    const own = {
      hold(id, spin, heat, L, on) {
        if (id === "minigun" && on) sfx.enemyShot?.("minigun", at());
      },
    };
    for (const name of SHOTS) own[name] = (...args) => sfx.from?.(at(), () => sfx[name]?.(...args));
    return new Proxy(own, { get: (target, key) => target[key] ?? NOOP });
  }
  function makeRecord(m, i, kind) {
    const rec = {
      id: 1000 + i,
      school: true,
      kind,
      member: m,
      local: false,
      // (One of many firing at once: its shots make half the sparks, smoke and bubbles.)
      detail: 0.5,
      down: true,
      weapon: null,
      place: null,
      fish: { position: m.position, velocity: m.velocity, heading: m.heading, river: m.river, relative: m.velocity, length: 1, stage: 5 },
      salmon: NO_SALMON,
      arsenal: createArsenal(),
      aim: { point: new THREE.Vector3(), direction: new THREE.Vector3(1, 0, 0), target: null },
      trigger: false,
      // What the splatter and the enemies' hooks read of a body.
      position: m.position,
      heading: m.heading,
      river: m.river,
      size: 1,
      spec: { coat: kind === "spawner" ? "spawner" : "smolt", title: kind === "spawner" ? "Laichlachs" : "Smolt" },
      dead: false,
      hp: 1,
      maxHp: 1,
      safeUntil: 0,
      hitAt: -99,
      // Its gun: how it points (in its fish's frame), when it last kicked, shots fired, the
      // minigun's barrels; its fight: the enemy it is on, how long it has aimed, the trigger's
      // rhythm.
      yaw: 0,
      pitch: 0,
      kickAt: -9,
      shots: 0,
      spinAngle: 0,
      hump: kind === "spawner" ? 0.7 : 0,
      stage: 5,
      foe: null,
      look: 0,
      onTarget: 0,
      held: 0,
      resting: 0,
      // (The time its weapon has waited for its step: see step.)
      idle: 0,
      wasOn: false,
      kills: 0,
    };
    rec.arsenal.back = null;
    rec.models = {
      muzzle: (r, place, out) => gear.muzzle(r, out),
      recoil: (r) => {
        r.kickAt = game.now.time;
        r.shots++;
      },
    };
    rec.sfx = soundsOf(rec);
    // (Its trigger, as the firing asks for it: held or not, whatever the place.)
    rec.pull = () => rec.trigger;
    return rec;
  }
  const records = [...smoltsAll.map((m, i) => makeRecord(m, i, "smolt")), ...runAll.map((m, i) => makeRecord(m, SMOLTS + i, "spawner"))];
  const byId = new Map(records.map((r) => [r.id, r]));
  // The armed and alive this step, and the targets the enemies choose among (the players,
  // then the armed school fish); the bodies of the fallen still wearing their guns.
  const armed = [];
  const targets = [];
  const fallen = [];
  const bleeders = [];
  let kills = 0,
    taken = 0,
    lost = 0,
    lostNoteAt = -99,
    seenStage = -1,
    tipped = false;

  // A school fish takes up its gun of the salmon's stage (or puts it down, before the smolt).
  function arm(rec, stage) {
    const mix = SCHOOL_ARMS[Math.min(9, stage)];
    const id = mix ? mix[(rec.id - 1000) % mix.length] : null;
    rec.stage = stage;
    if (rec.weapon === id) return;
    const a = rec.arsenal;
    a.back = a.belly = null;
    rec.weapon = id;
    rec.place = id ? WEAPONS[id].place : null;
    if (id) {
      a[rec.place] = id;
      a.take(id);
    }
    rec.foe = null;
    rec.onTarget = 0;
    rec.yaw = rec.pitch = 0;
  }

  // Whether the line from a school fish to where it would shoot passes close by a player's
  // fish: it holds its fire rather than shoot past the salmon's head (its rounds could not
  // hurt it, but nobody fires across a friend).
  const across = new THREE.Vector3(),
    toward = new THREE.Vector3(),
    closest = new THREE.Vector3();
  function blocked(from, to) {
    toward.subVectors(to, from);
    const length = toward.length();
    if (length < 1e-4) return false;
    toward.divideScalar(length);
    for (const p of players) {
      if (p.down) continue;
      const f = p.fish;
      across.subVectors(f.position, from);
      const t = clamp(across.dot(toward), 0, length);
      closest.copy(from).addScaledVector(toward, t);
      if (closest.distanceTo(f.position) < 0.55 * f.length + 0.1 && t < length - 0.3 * f.length) return true;
    }
    return false;
  }

  // Its enemy: what is about to strike the salmon or one of the school comes first (closest
  // first), then whatever is nearest -- within its gun's reach and, for a gun bolted under the
  // belly, ahead of it.
  const toFoe = new THREE.Vector3();
  function choose(rec, reach, use) {
    const f = rec.fish;
    let best = null,
      bestScore = Infinity;
    for (const e of enemies.list) {
      if (!fair(e)) continue;
      toFoe.subVectors(e.position, f.position);
      const d = toFoe.length();
      if (d - 0.45 * e.size > reach * use.close) continue;
      if (use.cone && toFoe.dot(f.heading) < Math.cos(use.cone) * d) continue;
      // (What is drawing a bead or drawing up to strike at the salmon or at the school.)
      const t = e.target;
      const threat = striking(e) && !!t && (t.school || players.includes(t));
      const score = d / reach - (threat ? 1 : 0) - (t === rec ? 0.25 : 0) + (e === rec.foe ? -0.1 : 0);
      if (score >= bestScore) continue;
      if (blocked(f.position, e.position)) continue;
      best = e;
      bestScore = score;
    }
    return best;
  }

  // Where to aim at `e`, and how the gun must turn for it (into rec.want).
  const aimAt = new THREE.Vector3(),
    axisY = new THREE.Vector3(),
    axisZ = new THREE.Vector3(),
    local = new THREE.Vector3();
  const want = { yaw: 0, pitch: 0, off: 0 };
  function sight(rec, e, w, use) {
    const f = rec.fish;
    const L = f.length;
    aimAt.copy(e.position);
    if (use.lead && e.velocity) {
      const speed = w.speed ? w.speed(L) : 30;
      aimAt.addScaledVector(e.velocity, Math.min(1, f.position.distanceTo(e.position) / Math.max(1, speed)));
    }
    // The way to it in its fish's own frame: ahead, up, to the right.
    toFoe.subVectors(aimAt, f.position);
    axisZ.crossVectors(f.heading, UP);
    if (axisZ.lengthSq() < 1e-6) axisZ.set(0, 0, 1);
    axisZ.normalize();
    axisY.crossVectors(axisZ, f.heading).normalize();
    local.set(toFoe.dot(f.heading), toFoe.dot(axisY), toFoe.dot(axisZ));
    const yaw = Math.atan2(-local.z, local.x),
      pitch = Math.atan2(local.y, Math.hypot(local.x, local.z));
    const arc = gear.arcOf(rec.weapon);
    want.yaw = clamp(yaw, arc.yaw[0], arc.yaw[1]);
    want.pitch = clamp(pitch, arc.pitch[0], arc.pitch[1]);
    // (How far the gun, turned as far as it goes, still points off the target; a gun bolted
    // on points where its fish does, and fires within its cone.)
    want.off = use.cone ? (Math.hypot(yaw, pitch) < use.cone ? 0 : 1) : Math.hypot(yaw - want.yaw, pitch - want.pitch);
    return want;
  }

  // A fish of the school struck: by an enemy's strike, its round (`shot`), or a charge.
  function hurt(rec, e, shot = null) {
    if (rec.down || clock() < rec.safeUntil) return;
    const L = rec.fish.length;
    const level = difficulty.level;
    const melee = e?.spec.weapon?.kind === "melee" ? e.spec.weapon : null;
    // A fish big enough swallows it whole (the base game's rule), whatever its strength.
    if (!shot && e?.spec.swallows && e.size >= 2.2 * L) {
      taken += rec.hp;
      fall(rec, e, null, null, true);
      return;
    }
    const damage = (shot ? shot.hitDamage ?? shot.damage : melee ? melee.damage : (e?.spec.bite ?? 0.1) * clamp((e?.size ?? L) / L, 0.25, 1)) * level.taken * TAKES;
    rec.safeUntil = clock() + (shot ? 0.12 : 0.8);
    rec.hitAt = clock();
    taken += Math.min(rec.hp, damage);
    rec.hp -= damage;
    // A strike's wound shows where it went in (a round's the hooks show).
    if (!shot && e) {
      toFoe.subVectors(rec.fish.position, e.position).normalize();
      gore.hit?.(rec, rec.fish.position, toFoe, melee?.id ?? e.kind);
    }
    if (rec.hp <= 0) fall(rec, e, shot?.weapon ?? melee?.id ?? null, shot ? shot.velocity : null);
  }

  // Dead: gone from the school for good. Swallowed, nothing is left; killed, the body floats up
  // belly first with its gun strapped on, or bursts (a heavy gun, a charge).
  const dirOf = new THREE.Vector3();
  function fall(rec, e, weapon, along, swallowed = false) {
    const m = rec.member;
    rec.down = true;
    rec.hp = 0;
    rec.trigger = false;
    lost++;
    const members = rec.kind === "spawner" ? run.members : school.members;
    const i = members.indexOf(m);
    if (i >= 0) members.splice(i, 1);
    m.active = false;
    if (swallowed) {
      fx.fizz(m.position.x, m.position.y, m.position.z, { count: 6, size: 0.01 + 0.01 * m.size, spread: m.size * 0.3, random: Math.random });
    } else {
      const body = enemies.fallen(rec.kind === "spawner" ? "schoolSpawner" : "schoolSmolt", m.position, m.heading, m.size, m.velocity, m.river.s);
      if (body) {
        if (along) dirOf.copy(along).normalize();
        else if (e) dirOf.subVectors(m.position, e.position).normalize();
        else dirOf.copy(UP);
        const burst = weapon && (HEAVY.has(weapon) || weapon === "seamine" || weapon === "bombs");
        // (What the splatter goes by: a heavy gun as the salmon's shotgun, anything else by
        // its own name.)
        gore.kill(body, dirOf, burst && HEAVY.has(weapon) ? "flinte" : weapon ?? e?.kind ?? "knife");
        fallen.push({ e: body, record: rec });
      }
    }
    // (Heard as a note of the game's, now and then: not for every fish of a big fight.)
    if (clock() - lostNoteAt > 5) {
      lostNoteAt = clock();
      game.hud?.note?.("Ein Schwarmfisch ist gefallen");
    }
  }

  // The fallen come back with the next run: a new generation's smolts (the fish below the
  // smolt again), a new run home (the fish no longer a spawner).
  function restore(members, all, kind) {
    if (members.length === all.length) return;
    members.length = 0;
    members.push(...all);
    for (const rec of records) if (rec.kind === kind) rec.down = true;
  }

  // ---- One step, after the salmon's own weapons have fired and before the enemies move.
  function step(dt, { stage }) {
    const phase = phaseOf(stage);
    if (phase !== "smolt" && phase !== "sea" && phase !== "spawner") restore(school.members, smoltsAll, "smolt");
    if (phase !== "spawner") restore(run.members, runAll, "spawner");
    if (stage !== seenStage) {
      seenStage = stage;
      for (const rec of records) arm(rec, stage);
    }
    armed.length = 0;
    const now = clock();
    for (const rec of records) {
      const m = rec.member;
      const present = m.active && !m.leaving && (rec.kind === "spawner" ? run.members : school.members).includes(m);
      if (!present) {
        rec.down = true;
        rec.trigger = false;
        rec.foe = null;
        continue;
      }
      // (Joined anew: whole, and its gun cold.)
      if (rec.down) {
        rec.down = false;
        rec.hp = rec.maxHp = 1;
        rec.foe = null;
        rec.held = rec.resting = rec.onTarget = 0;
      }
      rec.fish.length = rec.size = m.size;
      rec.fish.stage = stage;
      if (!rec.weapon) continue;
      if (now - rec.hitAt > CALM) rec.hp = Math.min(rec.maxHp, rec.hp + HEAL * dt);
      armed.push(rec);
    }
    if (armed.length && !tipped && stage >= 5) {
      tipped = true;
      game.hud?.tip?.("fv-school", "<b>Dein Schwarm kämpft mit.</b> Jeder Fisch deines Schwarms trägt jetzt eine Waffe und schießt auf alles, was dich oder ihn angreift – zuerst auf die, die gerade zustoßen. Dafür kommen mehr Feinde. Ein gefallener Schwarmfisch kommt nicht wieder.", 12);
    }
    for (const rec of armed) fight(rec, dt);
    // Shots fired here are the local game's alone: the school is its player's (plan, part 5),
    // and until co-op carries school fish across (co-op part 3, being built: net.js, mates.js)
    // the others neither see these shots nor are told what they hit.
    // (A fish whose trigger is off -- the most of them, most of the time -- has its weapon cooled
    // and reloaded a quarter of a second at a time rather than every step; one that fires, or
    // has just let go, is stepped every step.)
    for (const rec of armed) {
      rec.idle += dt;
      if (rec.trigger || rec.wasOn || rec.idle >= 0.25) {
        firing.fire(rec, rec.idle, rec.pull, true);
        rec.idle = 0;
      }
      rec.wasOn = rec.trigger;
    }
    // The enemies choose among the players and the armed school.
    targets.length = 0;
    for (const p of players) targets.push(p);
    for (const rec of armed) targets.push(rec);
    // (Bodies gone -- burst, eaten, their time up -- take their guns with them.)
    for (let i = fallen.length - 1; i >= 0; i--) if (!enemies.list.includes(fallen[i].e)) fallen.splice(i, 1);
  }

  // One school fish's fight this step: its enemy, its aim, its trigger.
  function fight(rec, dt) {
    const w = WEAPONS[rec.weapon];
    const use = USE[rec.weapon] ?? USE.minigun;
    const L = rec.fish.length;
    const reach = Math.min(w.reach(L), GUARD(L) / use.close);
    rec.look -= dt;
    const foe = rec.foe;
    if (foe && (!fair(foe) || foe.position.distanceTo(rec.fish.position) - 0.45 * foe.size > reach)) rec.foe = null;
    if (rec.look <= 0) {
      rec.look = range(0.25, 0.45);
      const next = choose(rec, reach, use);
      if (next !== rec.foe) {
        rec.foe = next;
        rec.onTarget = 0;
      }
    }
    // The gun eases toward its aim (back to straight ahead with nothing to aim at).
    let off = 1;
    if (rec.foe) {
      sight(rec, rec.foe, w, use);
      off = want.off;
    } else want.yaw = want.pitch = 0;
    const ease = 1 - Math.exp(-dt * 9);
    rec.yaw += (want.yaw - rec.yaw) * ease;
    rec.pitch += (want.pitch - rec.pitch) * ease;
    const settled = Math.abs(want.yaw - rec.yaw) + Math.abs(want.pitch - rec.pitch) < 0.12;
    // The minigun's barrels, shown turning (as the salmon's do: no faster than 25 degrees a
    // frame, or six barrels would seem to turn backward).
    const spin = rec.arsenal.state.minigun?.spin ?? 0;
    if (spin > 0) rec.spinAngle = (rec.spinAngle + Math.min(25 * (Math.PI / 180), spin * 40 * dt)) % (Math.PI * 2);
    // The tell: on target a moment before the trigger goes down; then bursts and rests.
    const on = !!rec.foe && off < 0.1 && settled;
    rec.onTarget = on ? rec.onTarget + dt : 0;
    if (api.holdFire) rec.trigger = false;
    else if (rec.trigger) {
      rec.held += dt;
      if (!on || rec.held >= use.burst) {
        rec.trigger = false;
        rec.resting = range(use.rest[0], use.rest[1]);
      }
    } else {
      rec.resting -= dt;
      if (on && rec.onTarget >= use.tell && rec.resting <= 0) {
        rec.trigger = true;
        rec.held = 0;
      }
    }
    if (rec.foe) {
      rec.aim.point.copy(aimAt);
      rec.aim.direction.subVectors(aimAt, rec.fish.position).normalize();
      rec.aim.target = rec.foe;
    } else {
      rec.aim.point.copy(rec.fish.position).addScaledVector(rec.fish.heading, reach);
      rec.aim.direction.copy(rec.fish.heading);
      rec.aim.target = null;
    }
  }

  // A charge of the enemies' going off (combat's explode): every school fish in its radius is
  // struck as the salmon would be, less toward the edge.
  const near = new THREE.Vector3();
  function blast(at, gun, source) {
    const R = gun.blast;
    for (const rec of armed) {
      if (rec.down) continue;
      const f = rec.fish;
      const d = Math.max(0, f.position.distanceTo(at) - 0.3 * f.length);
      if (d > R) continue;
      const damage = gun.damage * (1 - (1 - gun.edge) * (d / R));
      near.subVectors(f.position, at);
      if (near.lengthSq() < 1e-8) near.set(0, 1, 0);
      near.normalize();
      gore.hit?.(rec, f.position, near, gun.id);
      boom.damage = boom.hitDamage = damage;
      boom.weapon = gun.id;
      boom.velocity = near;
      hurt(rec, source, boom);
    }
  }
  const boom = { damage: 0, hitDamage: 0, weapon: null, velocity: null };

  const api = {
    records,
    targets,
    // For tests: the school keeps its guns but holds its fire.
    holdFire: false,
    fallen,
    gear,
    step,
    hurt,
    blast,
    // A shooter's record by its id (weapons.js: whose a shot is), or undefined.
    recordOf: (id) => byId.get(id),
    // A kill of the school's.
    killed(rec) {
      rec.kills++;
      kills++;
    },
    // Each frame: the guns on the school's bodies.
    frame() {
      gear.update(armed, fallen, enemies.pose);
    },
    // How many armed fish are about (the director sends more for them), the school's kills,
    // and how many have fallen.
    get armed() {
      return armed.length;
    },
    get kills() {
      return kills;
    },
    get lost() {
      return lost;
    },
    // (The strength its fish have lost in all, for the balance tests.)
    get taken() {
      return taken;
    },
    // What bleeds (the splatter's update): the enemies, and the wounded of the school, whose
    // wounds bleed as an enemy's do. (One list, filled afresh each step.)
    bleeding(list) {
      bleeders.length = 0;
      for (let i = 0; i < list.length; i++) bleeders.push(list[i]);
      for (const rec of armed) if (rec.hp < rec.maxHp) bleeders.push(rec);
      return bleeders;
    },
    // For tests: the whole school round the fish at once (the smolts', or the run home's), or
    // sent away for good.
    gather(fish) {
      const { now } = game;
      school.update(3, fish, now.time, null, null);
      run.update(3, fish, now.time);
      grow(fish);
      const yaw = Math.atan2(fish.heading.z, fish.heading.x);
      const c = Math.cos(yaw),
        s = Math.sin(yaw);
      for (const m of [...school.members, ...run.members]) {
        if (!m.active) continue;
        m.leaving = 0;
        m.position.set(fish.position.x + m.offset.x * c - m.offset.z * s, fish.position.y + m.offset.y, fish.position.z + m.offset.x * s + m.offset.z * c);
        m.velocity.copy(fish.velocity);
        m.heading.copy(fish.heading);
      }
    },
    disband() {
      school.members.length = 0;
      run.members.length = 0;
      for (const m of [...smoltsAll, ...runAll]) m.active = false;
      smoltsAll.length = 0;
      runAll.length = 0;
    },
  };
  return api;
}
