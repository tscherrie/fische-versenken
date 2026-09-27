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
import { createLarvae } from "./look/larvae.js";
import { createCapsules } from "./look/capsule.js";
import { createHostile } from "./hostile.js";
import { createGore } from "./gore.js";
import { createGravel } from "./gravel.js";
import { createGround } from "./ground.js";
import { createWeaponModels } from "./models.js";
import { createCombatHud } from "./hud.js";
import { ARSENAL, createPickups } from "./pickups.js";
import { createProjectiles, createRibbons, createSmoke } from "./projectiles.js";
import { createRules } from "./rules.js";
import { createSfx } from "./sfx.js";
import { createSignals } from "./signals.js";
import { WEAPONS, createArsenal, createFiring } from "./weapons.js";
import { tameTheWild } from "./wild.js";

// How far (as a tangent) from the middle of the view an enemy draws a phone's auto-fire: a
// wider cone than with a mouse.
const TOUCH_ASSIST = Math.tan((9 * Math.PI) / 180);

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
  const gore = createGore(scene, camera, { random: look, light });
  const models = createWeaponModels(scene, { mirror: game.mirror });
  // The larvae and the weapon capsules have models of their own (the look's): made here,
  // before the first frame, so the warm-up render compiles them with everything else. The
  // larvae's stand-in bodies in the enemies' crowds are then no longer drawn.
  const larvae = createLarvae(scene, { capacity: 24, light });
  const capsules = createCapsules(scene, { capacity: 24, light });
  enemies.drawnBy("dragonflyLarva");
  enemies.drawnBy("beetleLarva");
  // (The capsules' bubbles take the daylight the game gives life.js.)
  const lifeLight = life.light;
  life.light = function (value, ...rest) {
    capsules.light(value);
    return lifeLight.call(this, value, ...rest);
  };
  const hud = createCombatHud(habitat, { weapons: WEAPONS });
  const difficulty = createDifficulty(habitat);
  const director = createDirector({ random });
  const gravel = createGravel({ random, hud: game.hud });
  const ground = createGround({ terrain, pebbles: game.pebbles });
  const rules = createRules();
  const bosses = createBosses({ enemies, hud, random });
  const pickups = createPickups({ weapons: WEAPONS });
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
  // For trying the weapons out: ?weapon=<id> (and ?belly=<id>) starts with them, and then the
  // number keys 1-9 put the weapons there are on the fish, one after another.
  const query = game.query;
  const tryout = query.has("weapon") || query.has("belly");
  if (tryout) {
    const a = local.arsenal;
    if (WEAPONS[query.get("weapon")]) a.back = query.get("weapon");
    if (query.has("belly")) a.belly = WEAPONS[query.get("belly")] ? query.get("belly") : null;
    a.ensure?.(a.back);
    a.ensure?.(a.belly);
    window.addEventListener("keydown", (event) => {
      const n = Number(event.key);
      const ids = Object.keys(WEAPONS);
      if (!(n >= 1 && n <= ids.length)) return;
      const id = ids[n - 1];
      const place = WEAPONS[id].place === "belly" && fish.stage >= 5 ? "belly" : "back";
      a[place] = id;
      a.ensure?.(id);
      hud.say(WEAPONS[id].title, "", 1.2);
    });
  }
  // What holds the triggers: the mouse buttons, the tests, and on a phone the auto-fire.
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
    aim.update(enemies.list, reach, touchMode ? TOUCH_ASSIST : undefined);
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
      died(e);
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
    if (f.energy <= 0) {
      outcome.killed = shot?.cause ?? e.spec.name;
      died(e);
    }
  }
  function died(e) {
    deaths.push({ t: +clock.toFixed(2), by: e.kind });
    if (deaths.length > 16) deaths.shift();
  }
  // An enemy's gun goes off: its pellets fly from its muzzle toward where the salmon will be.
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
  // hiding (plan: "Kampf nährt das Leben"); a fasting spawner gets strength instead; in the
  // gravel every larva brings hatching nearer.
  function reward(player, e) {
    const f = player.fish;
    const stage = STAGES[f.stage];
    if (stage.fasting) f.energy = Math.min(1, f.energy + (e.size > 2 * f.length ? 0.05 : 0.005));
    else if (stage.yolk) f.progress = Math.min(1, f.progress + 0.02);
    else f.progress = Math.min(1, f.progress + clamp(0.004 + 0.008 * Math.min(1, e.size / (2 * f.length)), 0.004, 0.012));
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
    gore.kill(e, dir, weapon, info, player?.fish.length);
    fx.fizz(e.position.x, e.position.y, e.position.z, { count: Math.round(4 + 2 * e.size), size: 0.01 + 0.008 * e.size, spread: e.size * 0.3, random: look });
  }

  // A small sunk fish can be eaten where it lies, and so can a small one stunned belly-up,
  // and the chunks a burst one left (gore.eat).
  function eatCorpses(player) {
    const f = player.fish;
    if (player.down) return;
    for (const e of enemies.list) {
      if (e.eaten || e.burst || e.size > 1.1 * f.length) continue;
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
    const bits = gore.eat?.(f.mouth, 0.3 * f.length + 0.1) ?? 0;
    if (bits > 0) player.salmon.eat(bits, "flesh");
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
      // The weapons it carried wait where it died (a minute); the sibling starts with the laser.
      const a = local.arsenal;
      for (const id of [a.back, a.belly]) if (id && id !== "piu") pickups.revenge(local, id, fish.position);
      a.back = "piu";
      a.belly = null;
      for (const e of enemies.list)
        if (!e.dead) {
          e.mode = "recover";
          e.t = -4;
        }
      director.hold(10);
    }
    wasDown = local.down;
    rules.step(dt, local, enemies);
    wild.step();
    const L = fish.length;
    const w = WEAPONS[local.arsenal.back] ?? WEAPONS[local.arsenal.belly] ?? WEAPONS.piu;
    if ((touchMode || trigger.auto) && !trigger.test) {
      if (canFire() || trigger.auto) autoFire(local);
      else auto.back = auto.belly = false;
    } else if (trigger.back || trigger.belly || trigger.test) aim.update(enemies.list, Math.max(w.reach(L), 4 * L));
    fireWeapons(local, dt);
    enemies.hpScale = difficulty.level.hp;
    director.update(dt, { fish, stage: fish.stage, enemies, players: players.length, count: difficulty.level.count });
    gravel.update(dt, { fish, enemies, players: players.length });
    bosses.update(dt, {
      fish,
      onBeaten: (boss, e) => {
        game.hud.toast("Der alte König ist versenkt!", "Das Katana, das er bewacht hat, gehört dir.", 6);
        pickups.deliver(local, "katana", e.position);
      },
    });
    // A new stage of life: the new stage's weapon sinks down in a capsule.
    if (!local.down && fish.stage > (local.stageSeen ?? fish.stage)) {
      for (const [id, spec] of Object.entries(ARSENAL)) if (spec.stage === fish.stage && !spec.boss && !spec.secret) pickups.deliver(local, id);
    }
    local.stageSeen = fish.stage;
    pickups.update(dt, {
      players,
      terrain,
      onTake: (player, id) => {
        if (!player.local) return;
        hud.say(WEAPONS[id]?.title ?? id, "Neue Waffe", 1.6);
        sfx.pickup?.(id);
      },
    });
    // (The stones for the crawlers, gathered once, only while there are crawlers about.)
    const crawling = enemies.list.some((e) => e.spec.crawls);
    if (crawling) ground.refresh(fish.position, 12);
    enemies.update(dt, game.now.time, players, { hurt: (p, e) => hurt(p, e, outcome), shoot: enemyShoots, ground: crawling ? ground : null });
    // Thrown and stunned enemies, fire, the katana's swings: after the enemies have moved.
    firing.after(dt);
    hostile.update(dt, players, {
      onPlayer(shot, player) {
        hurt(player, shot.source, outcome, shot);
        gore.hit?.({ position: player.fish.position, heading: player.fish.heading, size: player.fish.length, kind: "salmon", dead: false, spec: {} }, shot.position, shot.velocity.clone().normalize(), shot.weapon);
      },
      onGround(shot) {
        fx.fizz(shot.position.x, shot.position.y, shot.position.z, { count: 2, size: shot.size * 0.4, spread: shot.size, rise: 0.6, random: look });
      },
    });
    signals.whiffs(outcome);
    if (projectiles.live.length) terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones);
    else stones.length = 0;
    projectiles.update(dt, { enemies: enemies.list, stones, onEnemy: firing.onEnemy, onGround: firing.onGround, onStone: firing.onStone, onBounce: firing.onBounce, onExpire: firing.onExpire });
    // What the shots left: the grenades' trails, one splatter call a shell.
    firing.trails(dt);
    firing.flush();
    eatCorpses(local);
    rules.after(local);
    fx.update(dt);
    smoke.update(dt);
    gore.update(dt, enemies.list);
  }

  // The picture of this frame: the shots in flight, the weapons, the sparks, the capsules.
  function frame(dt) {
    const shown = !game.now.paused || trigger.test;
    hud.update(dt, shown ? local.arsenal : null);
    hud.bars(enemies.list, camera, game.now.time);
    fx.begin();
    models.update(players);
    // (The enemies' own weapons, strapped on the same way, once the models draw them.)
    models.enemies?.(enemies.list);
    // The shots in flight, the grenades' bodies, the weapons' own lights.
    firing.draw(local);
    projectiles.draw();
    // The enemies' rounds; a spent one, sinking, is only a faint glint until it gets a look
    // of its own (then the look draws them all: fx.drawsRounds).
    if (!fx.drawsRounds)
      for (const p of hostile.live) {
        if (p.rested) continue;
        const k = p.spent ? 0.06 : 1;
        fx.add(p.position.x, p.position.y, p.position.z, p.spent ? p.size * 0.4 : p.size, p.tint[0] * k, p.tint[1] * k, p.tint[2] * k, p.spent ? 1 : p.stretch, p.velocity.x, p.velocity.y, p.velocity.z);
      }
    fx.end();
    // The larvae and the capsules (held still in the pause), and the weapons inside the
    // capsules once the weapon models dock there (capsules.anchor).
    larvae.draw(enemies.list, shown ? dt : 0);
    capsules.draw(pickups.items, game.now.time);
    models.capsules?.(pickups.items, capsules);
    smoke.frame();
    sfx.update?.();
    gore.frame();
  }

  return {
    players,
    enemies,
    projectiles,
    hostile,
    smoke,
    firing,
    deaths,
    director,
    bosses,
    pickups,
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
