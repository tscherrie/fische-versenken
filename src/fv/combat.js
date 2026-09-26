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
import { createDirector } from "./director.js";
import { createEnemies } from "./enemies.js";
import { createFx } from "./fx.js";
import { createGore } from "./gore.js";
import { createWeaponModels } from "./models.js";
import { createCombatHud } from "./hud.js";
import { createProjectiles, createRibbons, createSmoke } from "./projectiles.js";
import { createSfx } from "./sfx.js";
import { WEAPONS, createArsenal, createFiring } from "./weapons.js";
import { tameTheWild } from "./wild.js";

export function createCombat(game) {
  const { scene, camera, canvas, habitat, salmon, fish, life, terrain, sound, settings, touchMode } = game;
  const random = randomGenerator(0x51a7e);
  // (A stream of its own for what is only for the eye -- sparks, smoke, bubbles -- so the
  // looks never change what the game does next.)
  const look = randomGenerator(0x10c4);
  const light = !settings?.detail || touchMode;
  const wild = tameTheWild(game);
  const enemies = createEnemies(scene, { random });
  const projectiles = createProjectiles({ capacity: light ? 150 : 300, scene, camera });
  const smoke = createSmoke(scene, camera, { capacity: light ? 128 : 256 });
  const ribbons = createRibbons(scene);
  const fx = createFx(scene, camera, { capacity: light ? 400 : 768, bubbleCapacity: light ? 240 : 480 });
  const sfx = createSfx(sound);
  const gore = createGore(scene, camera, { random, light });
  const models = createWeaponModels(scene, { mirror: game.mirror });
  const hud = createCombatHud(habitat, { weapons: WEAPONS });
  const director = createDirector({ random });
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
  const trigger = { back: false, belly: false, test: false, auto: false };
  // On a phone the weapons fire themselves (auto-fire): per place, whether they do now.
  const auto = { back: false, belly: false };
  const stones = [];
  let clock = 0,
    wasDown = false;
  // The weapons' verbs and what their shots do (weapons.js).
  const firing = createFiring({ random, look, enemies, projectiles, smoke, ribbons, fx, sfx, gore, models, aim, hud, game, camera, players, onKill, clock: () => clock });
  // For tests: the last few deaths of the local fish that combat caused ({ t, by }).
  const deaths = [];

  // The mouse buttons, while the pointer is caught and the fish can fight (on a phone, with
  // no pointer to catch, whenever the fish can fight). (mousedown and mouseup come for each
  // button, pointer events only for the first one pressed.)
  const canFire = () => (game.now.locked || !!touchMode) && !game.now.paused && game.now.dead <= 0 && !game.celebration.active;
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
    if (touchMode || trigger.auto) return auto[place];
    if (single) return trigger.back;
    return place === "back" ? trigger.back : trigger.belly;
  }

  // Auto-fire on a phone: a gun fires while the aim has an enemy in its reach (the aim's own
  // pull onto a target near the middle of the view picks it); the katana cuts while an
  // enemy is within its reach in front of the fish.
  const toward = new THREE.Vector3();
  function autoFire(player) {
    const f = player.fish;
    const L = f.length;
    const a = player.arsenal;
    let reach = 4 * L;
    for (const place of ["back", "belly"]) {
      const w = WEAPONS[a[place]];
      if (w && w.mode !== "blade") reach = Math.max(reach, w.reach(L));
    }
    aim.update(enemies.list, reach);
    for (const place of ["back", "belly"]) {
      const w = WEAPONS[a[place]];
      auto[place] = false;
      if (!w) continue;
      if (w.mode === "blade") {
        for (const e of enemies.list) {
          if (e.dead) continue;
          toward.subVectors(e.position, f.position);
          if (toward.length() - e.size * 0.45 < 1.05 * L && toward.dot(f.heading) > 0) {
            auto[place] = true;
            break;
          }
        }
        continue;
      }
      const t = aim.target;
      auto[place] = !!t && !t.dead && t.position.distanceTo(f.position) - t.size * 0.45 < w.reach(L);
    }
  }

  // One step of a player's weapons: each verb in weapons.js.
  function fireWeapons(player, dt) {
    firing.fire(player, dt, (place) => held(player, place), canFire() || trigger.test || trigger.auto);
  }

  // An enemy's strike landed on a player.
  function hurt(outcome) {
    return (player, e) => {
      const f = player.fish;
      if (clock < player.safeUntil || f.safe || game.now.dead > 0) return;
      player.safeUntil = clock + 0.8;
      if (e.spec.swallows && e.size >= 2.2 * f.length) {
        outcome.killed = e.spec.name;
        deaths.push({ t: +clock.toFixed(2), by: e.kind });
        if (deaths.length > 16) deaths.shift();
        return;
      }
      const damage = e.spec.bite * clamp(e.size / f.length, 0.25, 1);
      f.energy = Math.max(0, f.energy - damage);
      outcome.bitten = true;
    };
  }

  // What a sunk enemy gives back: a little growth for every kill, so fighting pays as well as
  // hiding (plan: "Kampf nährt das Leben"); a fasting spawner gets strength instead.
  function reward(player, e) {
    const f = player.fish;
    const stage = STAGES[f.stage];
    if (stage.fasting) f.energy = Math.min(1, f.energy + (e.size > 2 * f.length ? 0.05 : 0.005));
    else if (!stage.yolk) f.progress = Math.min(1, f.progress + clamp(0.004 + 0.008 * Math.min(1, e.size / (2 * f.length)), 0.004, 0.012));
  }

  function onKill(e, by, dir, weapon, info = null) {
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
    // What it leaves in the water is the splatter's (gore.js); here only the air it had.
    gore.kill(e, dir, weapon, info);
    fx.fizz(e.position.x, e.position.y, e.position.z, { count: Math.round(4 + 2 * e.size), size: 0.01 + 0.008 * e.size, spread: e.size * 0.3, random: look });
  }

  // A small sunk fish can be eaten where it lies, and so can a small one stunned belly-up.
  function eatCorpses(player) {
    const f = player.fish;
    if (player.down) return;
    for (const e of enemies.list) {
      if (e.eaten || e.size > 1.1 * f.length) continue;
      if (!e.dead && !firing.stunned(e)) continue;
      if (f.mouth.distanceTo(e.position) < 0.25 * f.length + 0.35 * e.size) {
        if (!e.dead) {
          // (Swallowed alive: a kill, but nothing is left to splatter.)
          enemies.hit(e, e.hp + 1, null, player.id);
          player.kills++;
        }
        e.eaten = true;
        player.salmon.eat(35 * e.size, e.kind);
        fx.fizz(e.position.x, e.position.y, e.position.z, { count: 5, size: 0.015 + 0.01 * e.size, spread: e.size * 0.3, random: look });
      }
    }
  }

  function step(dt, outcome) {
    if (dt <= 0) return;
    clock += dt;
    if (clock > 4) {
      if (touchMode) game.hud.tip("fv-fire", "<b>Feuer frei!</b> Deine Waffe feuert von selbst, sobald ein Feind im Visier und in Reichweite ist. Alles, was kein Lachs ist, will dich fressen.", 11);
      else game.hud.tip("fv-fire", "<b>Feuer frei!</b> Die linke Maustaste schießt mit deiner Waffe, die Leertaste bleibt Spurt, Biss und Sprung. Alles, was kein Lachs ist, will dich fressen.", 11);
    }
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
    wild.step();
    const L = fish.length;
    const w = WEAPONS[local.arsenal.back] ?? WEAPONS[local.arsenal.belly] ?? WEAPONS.piu;
    if ((touchMode || trigger.auto) && !trigger.test) {
      if (canFire() || trigger.auto) autoFire(local);
      else auto.back = auto.belly = false;
    } else if (trigger.back || trigger.belly || trigger.test) aim.update(enemies.list, Math.max(w.reach(L), 4 * L));
    fireWeapons(local, dt);
    director.update(dt, { fish, stage: fish.stage, enemies, players: players.length });
    enemies.update(dt, game.now.time, players, hurt(outcome));
    // Thrown and stunned enemies, fire, the katana's swings: after the enemies have moved.
    firing.after(dt);
    if (projectiles.live.length) terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones);
    else stones.length = 0;
    projectiles.update(dt, { enemies: enemies.list, stones, onEnemy: firing.onEnemy, onGround: firing.onGround, onStone: firing.onStone, onBounce: firing.onBounce, onExpire: firing.onExpire });
    // What the shots left: the grenades' trails, one splatter call a shell.
    firing.trails(dt);
    firing.flush();
    eatCorpses(local);
    fx.update(dt);
    smoke.update(dt);
    gore.update(dt, enemies.list);
  }

  // The picture of this frame: the shots in flight, the weapon's own light, the sparks.
  function frame(dt) {
    const shown = !game.now.paused || trigger.test;
    hud.update(dt, shown ? local.arsenal : null);
    fx.begin();
    models.update(players);
    // The shots in flight, the grenades' bodies, the weapons' own lights.
    firing.draw(local);
    projectiles.draw();
    fx.end();
    smoke.frame();
    sfx.update();
    gore.frame();
  }

  return {
    players,
    enemies,
    projectiles,
    smoke,
    firing,
    deaths,
    director,
    aim,
    step,
    frame,
    // The left button is the weapon's, no longer the lunge's (that stays on Space).
    takesPrimary: () => !!local.arsenal.back,
    // For tests and automation (no pointer lock there): hold the trigger down or let go.
    fire(on) {
      trigger.test = !!on;
    },
    // For tests: the phone's auto-fire, on a computer.
    autoFire(on) {
      trigger.auto = !!on;
      if (!on) auto.back = auto.belly = false;
    },
  };
}
