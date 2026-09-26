// Combat: the players, their weapons, the enemies, the shots and what they do, wired into the
// game's step (after the river's life has moved, before the game reacts to what happened to
// the fish) and its frame (the picture). Everything is kept per player from the start, with
// the local player as the only one for now, so co-op can add the others later.

import * as THREE from "three";
import { randomGenerator } from "../../shared/random.js";
import { STAGES } from "../salmon.js";
import { clamp } from "../course.js";
import "./i18n.js";
import { createAim } from "./aim.js";
import { createBosses } from "./bosses.js";
import { createDifficulty } from "./difficulty.js";
import { createDirector } from "./director.js";
import { createEnemies } from "./enemies.js";
import { createFx } from "./fx.js";
import { createHostile } from "./hostile.js";
import { createGore } from "./gore.js";
import { createGravel } from "./gravel.js";
import { createGround } from "./ground.js";
import { createWeaponModels } from "./models.js";
import { createCombatHud } from "./hud.js";
import { createProjectiles } from "./projectiles.js";
import { createRules } from "./rules.js";
import { createSfx } from "./sfx.js";
import { createSignals } from "./signals.js";
import { WEAPONS, createArsenal, damageScale } from "./weapons.js";
import { tameTheWild } from "./wild.js";

export function createCombat(game) {
  const { scene, camera, canvas, habitat, salmon, fish, life, terrain, sound, settings, touchMode } = game;
  const random = randomGenerator(0x51a7e);
  const light = !settings?.detail || touchMode;
  const wild = tameTheWild(game);
  const enemies = createEnemies(scene, { random });
  const projectiles = createProjectiles({ capacity: light ? 150 : 300 });
  const fx = createFx(scene, camera, { capacity: light ? 400 : 768, bubbleCapacity: light ? 240 : 480 });
  const sfx = createSfx(sound);
  const gore = createGore(scene, camera, { random, light });
  const models = createWeaponModels(scene, { mirror: game.mirror });
  const hud = createCombatHud(habitat, { weapons: WEAPONS });
  const difficulty = createDifficulty(habitat);
  const director = createDirector({ random });
  const gravel = createGravel({ random, hud: game.hud });
  const ground = createGround({ terrain, pebbles: game.pebbles });
  const rules = createRules();
  const bosses = createBosses({ enemies, hud, random });
  const hostile = createHostile({ capacity: light ? 90 : 160 });
  const signals = createSignals(game, enemies);
  const aim = createAim(camera);

  const players = [{ id: 0, local: true, fish, salmon, arsenal: createArsenal(), down: false, safeUntil: 0, kills: 0 }];
  // The weapon on the title card's list of keys, after the lunge.
  const keys = habitat.querySelector("#intro .keys:not(.touch-keys)");
  if (keys) {
    const item = document.createElement("li");
    item.innerHTML = '<span class="mouse" aria-hidden="true"></span> Linke Maustaste: schießen';
    keys.insertBefore(item, keys.children[3] ?? null);
  }
  const local = players[0];
  const trigger = { back: false, belly: false, test: false };
  const stones = [];
  const muzzle = new THREE.Vector3();
  const aimDir = new THREE.Vector3();
  const flight = new THREE.Vector3();
  let clock = 0,
    wasDown = false;

  // The mouse buttons, while the pointer is caught and the fish can fight. (mousedown and
  // mouseup come for each button, pointer events only for the first one pressed.)
  const canFire = () => game.now.locked && !game.now.paused && game.now.dead <= 0 && !game.celebration.active;
  canvas.addEventListener("mousedown", (event) => {
    if (!canFire()) return;
    if (event.button === 0) trigger.back = true;
    if (event.button === 2) trigger.belly = true;
  });
  window.addEventListener("mouseup", (event) => {
    if (event.button === 0) trigger.back = false;
    if (event.button === 2) trigger.belly = false;
  });
  window.addEventListener("blur", () => {
    trigger.back = trigger.belly = false;
  });
  document.addEventListener("pointerlockchange", () => {
    if (!game.now.locked) trigger.back = trigger.belly = false;
  });

  // Before the smolt a fish carries one weapon, fired with the left button wherever it sits.
  function held(player, place) {
    const a = player.arsenal;
    const single = !(a.back && a.belly);
    if (trigger.test) return true;
    if (single) return trigger.back;
    return place === "back" ? trigger.back : trigger.belly;
  }

  function shoot(player, place, w, id) {
    const f = player.fish;
    const L = f.length;
    if (!models.muzzle(player, place, muzzle)) player.arsenal.mount(player.salmon, place, muzzle);
    models.recoil(player, place);
    const speed = w.speed(L);
    const reach = w.reach(L);
    aimDir.subVectors(aim.point, muzzle);
    // Too close to aim from the weapon (or behind it): straight along the view.
    if (aimDir.lengthSq() < 0.25 * L * L || aimDir.dot(aim.direction) < 0) aimDir.copy(aim.direction);
    aimDir.normalize();
    aimDir.x += (random() - 0.5) * 2 * w.spread;
    aimDir.y += (random() - 0.5) * 2 * w.spread;
    aimDir.z += (random() - 0.5) * 2 * w.spread;
    aimDir.normalize();
    flight.copy(aimDir).multiplyScalar(speed);
    projectiles.fire({ owner: player.id, weapon: id, position: muzzle, velocity: flight, damage: w.damage * damageScale(L), radius: w.radius(L), life: reach / speed, size: w.size(L), tint: w.tint, stretch: w.stretch, s: f.river.s });
    // The flash at the weapon (held a few frames, or the temporal blend swallows it).
    fx.spark(muzzle.x, muzzle.y, muzzle.z, { size: w.size(L) * 2.4, life: 0.08, r: w.tint[0] * 0.5, g: w.tint[1] * 0.5, b: w.tint[2] * 0.5 });
    if (player.local) sfx[w.sound]?.(L);
  }

  function fireWeapons(player, dt) {
    const a = player.arsenal;
    a.cool(dt);
    if (player.down || !(canFire() || trigger.test)) return;
    for (const place of ["back", "belly"]) {
      const id = a[place];
      if (!id || !held(player, place) || a.locked[id]) continue;
      const w = WEAPONS[id];
      while (a.cooldown[place] <= 0) {
        a.cooldown[place] += w.interval;
        shoot(player, place, w, id);
        a.heat[id] += w.heat;
        a.fired[id] = 0;
        if (a.heat[id] >= 1) {
          a.locked[id] = true;
          if (player.local) sfx.overheat();
          break;
        }
      }
    }
  }

  // An enemy's strike landed on a player: a fish big enough swallows it (the base game's
  // rule), a knife stabs, a plain bite bites. After a strike a player is untouchable a
  // moment, after a bullet only a blink (a burst should count, not just its first round).
  function hurt(player, e, outcome, shot = null) {
    const f = player.fish;
    if (clock < player.safeUntil || f.safe || game.now.dead > 0) return;
    const melee = e.spec.weapon?.kind === "melee" ? e.spec.weapon : null;
    const level = difficulty.level;
    const swallows = !shot && e.spec.swallows && e.size >= 2.2 * f.length;
    if (swallows && level.swallow) {
      outcome.killed = e.spec.name;
      return;
    }
    // (On Tourist a fish that would swallow the salmon only bites it, hard.)
    const damage = (swallows ? 0.35 : shot ? shot.hitDamage ?? shot.damage : melee ? melee.damage : e.spec.bite * clamp(e.size / f.length, 0.25, 1)) * level.taken;
    player.safeUntil = clock + (shot ? 0.12 : 0.8);
    f.energy = Math.max(0, f.energy - damage);
    if (clock - (player.feltAt ?? -1) > 0.35) {
      player.feltAt = clock;
      outcome.bitten = true;
    }
    if (f.energy <= 0) outcome.killed = shot?.cause ?? e.spec.name;
  }
  // An enemy's gun goes off: its pellets fly from its snout toward where the salmon will be.
  const enemyMuzzle = new THREE.Vector3();
  const pellet = new THREE.Vector3();
  function enemyShoots(e, dir, gun) {
    if (!models.enemyMuzzle?.(e, enemyMuzzle)) enemies.snout(e, enemyMuzzle);
    for (let i = 0; i < gun.pellets; i++) {
      pellet.copy(dir);
      pellet.x += (random() - 0.5) * 2 * gun.spread;
      pellet.y += (random() - 0.5) * 2 * gun.spread;
      pellet.z += (random() - 0.5) * 2 * gun.spread;
      pellet.normalize().multiplyScalar(gun.speed * (0.92 + 0.16 * random()));
      hostile.fire({ source: e, weapon: gun.id, cause: gun.cause, position: enemyMuzzle.clone(), velocity: pellet.clone(), damage: gun.damage, drag: gun.drag, radius: 0.03 + 0.01 * e.size, life: 12, size: 0.05 + 0.02 * e.size, tint: [7, 3.2, 0.7], stretch: 3.5, s: e.river.s });
    }
    fx.spark(enemyMuzzle.x, enemyMuzzle.y, enemyMuzzle.z, { size: 0.12 + 0.05 * e.size, life: 0.08, r: 5, g: 2.6, b: 0.6 });
    sfx.enemyShot?.(gun.id, enemyMuzzle.distanceTo(camera.position));
  }

  // What a sunk enemy gives back: a little growth for every kill, so fighting pays as well as
  // hiding (plan: "Kampf nährt das Leben"); a fasting spawner gets strength instead.
  function reward(player, e) {
    const f = player.fish;
    const stage = STAGES[f.stage];
    if (stage.fasting) f.energy = Math.min(1, f.energy + (e.size > 2 * f.length ? 0.05 : 0.005));
    else if (stage.yolk) f.progress = Math.min(1, f.progress + 0.02);
    else f.progress = Math.min(1, f.progress + clamp(0.004 + 0.008 * Math.min(1, e.size / (2 * f.length)), 0.004, 0.012));
  }

  function onKill(e, by, dir, weapon) {
    const player = players.find((p) => p.id === by);
    if (player) {
      player.kills++;
      reward(player, e);
    }
    if (by === local.id) {
      hud.hit(true);
      hud.say("Versenkt!", e.spec.title);
    }
    sfx.sunk(e.size);
    gore.kill(e, dir, weapon);
    fx.fizz(e.position.x, e.position.y, e.position.z, { count: Math.round(10 + 5 * e.size), size: 0.02 + 0.015 * e.size, spread: e.size * 0.4, random });
    fx.burst(e.position.x, e.position.y, e.position.z, { count: 10, speed: 1.2 + e.size, size: 0.05 + 0.03 * e.size, life: 0.4, r: 7, g: 2.4, b: 0.8, random });
  }

  // A small sunk fish can be eaten where it lies.
  function eatCorpses(player) {
    const f = player.fish;
    if (player.down) return;
    for (const e of enemies.list) {
      if (!e.dead || e.eaten || e.size > 1.1 * f.length) continue;
      if (f.mouth.distanceTo(e.position) < 0.25 * f.length + 0.35 * e.size) {
        e.eaten = true;
        player.salmon.eat(35 * e.size, e.kind);
        fx.fizz(e.position.x, e.position.y, e.position.z, { count: 5, size: 0.015 + 0.01 * e.size, spread: e.size * 0.3, random });
      }
    }
  }

  function step(dt, outcome) {
    if (dt <= 0) return;
    clock += dt;
    if (clock > 4) game.hud.tip("fv-fire", "<b>Feuer frei!</b> Die linke Maustaste schießt mit deiner Waffe, die Leertaste bleibt Spurt, Biss und Sprung. Alles, was kein Lachs ist, will dich fressen.", 11);
    local.down = game.now.dead > 0;
    // A death: the enemies fall back and no new ones come for a while, so the sibling that
    // takes over has a moment to find its feet.
    if (local.down && !wasDown) {
      for (const e of enemies.list) if (!e.dead) {
        e.mode = "recover";
        e.t = -4;
      }
      director.hold(10);
    }
    wasDown = local.down;
    rules.step(dt, local, enemies);
    wild.step();
    const L = fish.length;
    if (trigger.back || trigger.belly || trigger.test) aim.update(enemies.list, WEAPONS[local.arsenal.back ?? "piu"].reach(L));
    fireWeapons(local, dt);
    enemies.hpScale = difficulty.level.hp;
    director.update(dt, { fish, stage: fish.stage, enemies, players: players.length, count: difficulty.level.count });
    gravel.update(dt, { fish, enemies, players: players.length });
    bosses.update(dt, { fish, onBeaten: (boss) => game.hud.toast("Der alte König ist versenkt!", "Das Katana, das er bewacht hat, gehört dir.", 6) });
    // (The stones for the crawlers, gathered once, only while there are crawlers about.)
    const crawling = enemies.list.some((e) => e.spec.crawls);
    if (crawling) ground.refresh(fish.position, 12);
    enemies.update(dt, game.now.time, players, { hurt: (p, e) => hurt(p, e, outcome), shoot: enemyShoots, ground: crawling ? ground : null });
    hostile.update(dt, players, {
      onPlayer(shot, player) {
        hurt(player, shot.source, outcome, shot);
        fx.burst(shot.position.x, shot.position.y, shot.position.z, { count: 4, speed: 0.6, size: shot.size * 0.8, life: 0.12, r: 6, g: 1.2, b: 0.6, random });
        gore.hit?.({ position: player.fish.position, heading: player.fish.heading, size: player.fish.length, kind: "salmon", dead: false }, shot.position, shot.velocity.clone().normalize(), shot.weapon);
      },
      onGround(shot) {
        fx.fizz(shot.position.x, shot.position.y, shot.position.z, { count: 2, size: shot.size * 0.4, spread: shot.size, rise: 0.6, random });
      },
    });
    signals.whiffs(outcome);
    if (projectiles.live.length) terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones);
    else stones.length = 0;
    projectiles.update(dt, {
      enemies: enemies.list,
      stones,
      onEnemy(shot, e) {
        flight.copy(shot.velocity).normalize();
        const sunk = enemies.hit(e, shot.damage, flight, shot.owner);
        gore.hit(e, shot.position, flight, shot.weapon);
        fx.burst(shot.position.x, shot.position.y, shot.position.z, { count: 5, speed: 0.6 + fish.length, size: shot.size * 0.9, life: 0.16, r: shot.tint[0] * 0.7, g: shot.tint[1] * 0.9, b: shot.tint[2], random });
        if (shot.owner === local.id) {
          sfx.hit();
          if (!sunk) hud.hit(false);
        }
        if (sunk) onKill(e, shot.owner, flight, shot.weapon);
      },
      onGround(shot) {
        fx.fizz(shot.position.x, shot.position.y, shot.position.z, { count: 3, size: shot.size * 0.5, spread: shot.size, rise: 0.6, random });
        fx.burst(shot.position.x, shot.position.y, shot.position.z, { count: 3, speed: 0.4, size: shot.size * 0.7, life: 0.12, r: 2, g: 1.4, b: 0.8, random });
        if (shot.owner === local.id) sfx.ground();
      },
      onStone(shot) {
        fx.burst(shot.position.x, shot.position.y, shot.position.z, { count: 4, speed: 0.6, size: shot.size * 0.7, life: 0.14, r: 3, g: 2, b: 1, random });
        if (shot.owner === local.id) sfx.ground();
      },
    });
    eatCorpses(local);
    rules.after(local);
    fx.update(dt);
    gore.update(dt, enemies.list);
  }

  // The picture of this frame: the shots in flight, the weapon's own light, the sparks.
  function frame(dt) {
    const shown = !game.now.paused || trigger.test;
    hud.update(dt, shown ? local.arsenal : null);
    hud.bars(enemies.list, camera, game.now.time);
    fx.begin();
    for (const p of projectiles.live) fx.add(p.position.x, p.position.y, p.position.z, p.size, p.tint[0], p.tint[1], p.tint[2], p.stretch, p.velocity.x, p.velocity.y, p.velocity.z);
    // (A spent bullet, sinking, is only a faint glint until it gets a look of its own.)
    for (const p of hostile.live) {
      if (p.rested) continue;
      const k = p.spent ? 0.06 : 1;
      fx.add(p.position.x, p.position.y, p.position.z, p.spent ? p.size * 0.4 : p.size, p.tint[0] * k, p.tint[1] * k, p.tint[2] * k, p.spent ? 1 : p.stretch, p.velocity.x, p.velocity.y, p.velocity.z);
    }
    models.update(players);
    // (The enemies' own weapons, strapped on the same way, once the models draw them.)
    models.enemies?.(enemies.list);
    // A weapon that is hot glows at the muzzle.
    const a = local.arsenal;
    const w = WEAPONS[a.back];
    const hot = Math.min(1, a.heat[a.back] ?? 0);
    if (w?.glow && hot > 0.05 && !local.down && !fish.captive) {
      if (!models.muzzle(local, "back", muzzle)) a.mount(salmon, "back", muzzle);
      fx.add(muzzle.x, muzzle.y, muzzle.z, w.size(fish.length) * (0.35 + 0.4 * hot), w.glow[0] * hot * 2, w.glow[1] * hot * 2, w.glow[2] * hot, 1);
    }
    fx.end();
    gore.frame();
  }

  return {
    players,
    enemies,
    projectiles,
    hostile,
    director,
    bosses,
    aim,
    step,
    frame,
    // The left button is the weapon's, no longer the lunge's (that stays on Space).
    takesPrimary: () => !!local.arsenal.back,
    // For tests and automation (no pointer lock there): hold the trigger down or let go.
    fire(on) {
      trigger.test = !!on;
    },
  };
}
