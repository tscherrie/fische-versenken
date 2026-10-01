// Combat: the players, their weapons, the enemies, the shots and what they do, wired into the
// game's step (after the river's life has moved, before the game reacts to what happened to
// the fish) and its frame (the picture). Everything is kept per player from the start, the
// local player first. In co-op (owners.js, joined with join()) the mates come after it: in
// `players` as they are drawn, whose weapons are replayed here for the eye, and in
// `targets` as the enemies see them, to go for; solo the two lists are one.

import * as THREE from "three";
import { randomGenerator } from "../../shared/random.js";
import { STAGES } from "../salmon.js";
import { clamp, level as surface } from "../course.js";
import "./i18n.js";
import { createAim } from "./aim.js";
import { createBosses } from "./bosses.js";
import { createDifficulty } from "./difficulty.js";
import { createDirector } from "./director.js";
import { createEnemies } from "./enemies.js";
import { createFx } from "./fx.js";
import { createLarvae } from "./look/larvae.js";
import { createNeutrals } from "./neutrals.js";
import { createCapsules } from "./look/capsule.js";
import { createOrdnance } from "./look/ordnance.js";
import { createHostile } from "./hostile.js";
import { createGore } from "./gore.js";
import { createGravel } from "./gravel.js";
import { createGround } from "./ground.js";
import { createWeaponModels } from "./models.js";
import { createCombatHud } from "./hud.js";
import { ARSENAL, createPickups } from "./pickups.js";
import { createProjectiles, createRibbons, createSmoke } from "./projectiles.js";
import { createRules } from "./rules.js";
import { createArmedSchool } from "./school.js";
import { createSfx } from "./sfx.js";
import { createSignals } from "./signals.js";
import { SKY, WEAPONS, createArsenal, createFiring, damageScale } from "./weapons.js";
import { tameTheWild } from "./wild.js";
import { seeded } from "./wire.js";

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
  // (What the splatter marks: the enemies' skins, the salmon's own, the bed with its stones.)
  gore.attach?.({ enemies, salmon, fish, terrain, pebbles: game.pebbles });
  const models = createWeaponModels(scene, { mirror: game.mirror, enemies, camera });
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
  const difficulty = createDifficulty();
  const director = createDirector({ random });
  const gravel = createGravel({ random, hud: game.hud });
  const ground = createGround({ terrain, pebbles: game.pebbles });
  const rules = createRules();
  const bosses = createBosses({ enemies, hud, random });
  const pickups = createPickups({ weapons: WEAPONS });
  const hostile = createHostile({ capacity: light ? 90 : 160 });
  const signals = createSignals(game, enemies);
  // (Set up below, once the players are there.)
  let neutrals = null;
  const aim = createAim(camera);

  const players = [{ id: 0, local: true, fish, salmon, arsenal: createArsenal(), down: false, safeUntil: 0, kills: 0 }];
  const local = players[0];
  // The rounds, the cases and the ordnance as things (the look's, look/ordnance.js): made now,
  // before the first frame, so the warm-up compiles them; from here on they draw the rounds
  // the glow drew, the torpedoes, rockets, mines, harpoons and balls, and the bombs.
  const ordnance = createOrdnance(scene, camera, { fx, models, enemies, projectiles, players, light });
  // Who the enemies may go for (co-op: a list of its own, filled by owners.js); what may
  // take this page's capsules (the local player alone: each player has their own).
  let targets = players;
  const mine = [local];
  // Co-op's owners of the enemies (owners.js), once joined; null solo.
  let owners = null;
  // The peaceful fish of the shoals, open to attack (neutrals.js).
  neutrals = createNeutrals({ life, enemies, players, clock: () => game.now.time });
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
  // The weapons' verbs and what their shots do (weapons.js); the salmon's own school fires
  // through them too (school.js: each fish a shooter of its own, found by its id). In a room
  // what the local player's shots did to an enemy another page runs goes to its owner.
  let school = null;
  const firing = createFiring({ random, look, enemies, projectiles, smoke, ribbons, fx, sfx, gore, models, aim, hud, game, camera, players, onKill, clock: () => clock, shooter: (id) => school?.recordOf(id), report: (e, hit) => owners?.report(e, hit) });
  school = createArmedSchool({ game, enemies, firing, gore, fx, sfx, difficulty, players, clock: () => clock });
  // What the enemies go for: the players as the enemies see them and the armed school fish.
  // Solo that is the school's own list (school.targets: the players, then its armed fish).
  // In a room the players are co-op's `targets` (the mates where their pages have them,
  // owners.js), and the school fish this page's own (school.targets after its players).
  const hunted = [];
  function prey() {
    if (targets === players) return school.targets;
    hunted.length = 0;
    for (const t of targets) hunted.push(t);
    for (const t of school.targets) if (t.school) hunted.push(t);
    return hunted;
  }
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
      // (A bird circling high over the water is out of every weapon's reach: no use firing.)
      auto[place] = !!t && !t.dead && t.position.distanceTo(f.position) - t.size * 0.45 < w.reach(L) && !(t.spec.flies && t.position.y > surface(t.river.s) + SKY);
    }
  }

  // One step of a player's weapons: each verb in weapons.js.
  function fireWeapons(player, dt) {
    firing.fire(player, dt, (place) => held(player, place), canFire() || trigger.test || trigger.auto);
  }

  // (The way a heavy round throws the fish it strikes.)
  const thrown = new THREE.Vector3();
  // An enemy's strike landed on a player: a fish big enough swallows it (the base game's
  // rule), a knife stabs, a plain bite bites. After a strike a player is untouchable a
  // moment, after a bullet only a blink (a burst should count, not just its first round).
  function hurt(player, e, outcome, shot = null) {
    // (A fish of the salmon's school, struck: school.js keeps its strength. The school is
    // this page's own, so in a room too its hurts are worked out here.)
    if (player.school) return school.hurt(player, e, shot);
    // (Only this page's own fish: whether a mate was hit is its own page's to say.)
    if (!player.local) return;
    const f = player.fish;
    if (clock < player.safeUntil || f.safe || game.now.dead > 0) return;
    const melee = e.spec.weapon?.kind === "melee" ? e.spec.weapon : null;
    const level = difficulty.level;
    const swallows = !shot && e.spec.swallows && e.size >= 2.2 * f.length;
    if (swallows && level.swallow) {
      player.taken = (player.taken ?? 0) + f.energy;
      outcome.killed = e.spec.name;
      died(e);
      return;
    }
    // (On Tourist a fish that would swallow the salmon only bites it, hard.)
    const damage = (swallows ? 0.35 : shot ? shot.hitDamage ?? shot.damage : melee ? melee.damage : e.spec.bite * clamp(e.size / f.length, 0.25, 1)) * level.taken;
    player.safeUntil = clock + (shot ? 0.12 : 0.8);
    // (What the fights have taken of its strength in all, and by what kind: the balance tests
    // weigh it.)
    player.taken = (player.taken ?? 0) + Math.min(f.energy, damage);
    const by = (player.takenBy ??= {});
    by[e.kind] = (by[e.kind] ?? 0) + Math.min(f.energy, damage);
    f.energy = Math.max(0, f.energy - damage);
    // (The blade's own part of the blow; the game plays the body's knock: outcome.bitten.)
    if (melee && !shot) sfx.enemyStrike?.(melee.id, e.position.distanceTo(camera.position), true);
    // A heavy round (the pike's) throws the fish along its line as well, less the slower it
    // has got in the water.
    if (shot?.shove && !f.airborne && !f.captive) {
      const cruise = player.salmon?.speeds?.().cruise ?? 3.4 * Math.pow(f.length, 0.645);
      f.relative?.addScaledVector(thrown.copy(shot.velocity).normalize(), shot.shove * cruise * ((shot.hitDamage ?? shot.damage) / Math.max(1e-6, shot.damage)));
    }
    // (A shock -- the eel's -- stops the salmon short for a moment.)
    if (melee?.stun) f.relative?.multiplyScalar(0.1);
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
  // (One description of a round, filled in for each shot and handed to hostile.fire for every
  // pellet, which copies it into a record of its pool: nothing is made per shot. Its tint is
  // one array for all the rounds, only ever read.)
  const enemyMuzzle = new THREE.Vector3();
  const pellet = new THREE.Vector3();
  const round = { source: null, weapon: null, cause: null, position: enemyMuzzle, velocity: pellet, damage: 0, drag: undefined, shove: 0, air: false, radius: 0, life: 12, size: 0, tint: [7, 3.2, 0.7], stretch: 3.5, s: null };
  // (The muzzle's flash, one description for every shot too: fx.spark only reads it.)
  const flash = { size: 0, life: 0.08, r: 5, g: 2.6, b: 0.6 };
  // In a room an enemy the others see fires its pellets from a seed, which goes to them with
  // the shot (owners.js): the same pellets fly on every page. (Solo, and for this page's own,
  // they draw from the game's stream as ever.) `rnd`: the seeded stream of a shot replayed.
  function enemyShoots(e, dir, gun, rnd = null) {
    if (!rnd && owners && e.shared && !e.remote) {
      const seed = Math.floor(random() * 65536);
      rnd = seeded(seed);
      owners.shot(e, dir, gun, seed);
    }
    rnd ??= random;
    if (!models.enemyMuzzle?.(e, enemyMuzzle)) enemies.snout(e, enemyMuzzle);
    round.source = e;
    round.weapon = gun.id;
    round.cause = gun.cause;
    round.damage = gun.damage;
    round.drag = gun.drag;
    round.shove = gun.shove ?? 0;
    round.air = !!gun.air;
    round.radius = 0.03 + 0.01 * e.size;
    round.size = 0.05 + 0.02 * e.size;
    round.s = e.river.s;
    for (let i = 0; i < gun.pellets; i++) {
      pellet.copy(dir);
      pellet.x += (rnd() - 0.5) * 2 * gun.spread;
      pellet.y += (rnd() - 0.5) * 2 * gun.spread;
      pellet.z += (rnd() - 0.5) * 2 * gun.spread;
      pellet.normalize().multiplyScalar(gun.speed * (0.92 + 0.16 * rnd()));
      hostile.fire(round);
    }
    flash.size = 0.12 + 0.05 * e.size;
    fx.spark(enemyMuzzle.x, enemyMuzzle.y, enemyMuzzle.z, flash);
    ordnance.shot(e, gun);
    sfx.enemyShot?.(gun.id, enemyMuzzle.distanceTo(camera.position));
    models.enemyShot?.(e);
  }
  // The enemies' weapons heard beyond their shots (sfx-enemies.js), each from where it is: the
  // wind-up of an aim (and of a bomber tipping into its dive), `seconds` before it fires, and a
  // blade swung as a strike begins.
  function enemyAims(e, gun, seconds) {
    sfx.enemyAim?.(gun.id, (e.muzzle ?? e.position).distanceTo(camera.position), seconds);
  }
  function enemySwings(e) {
    const blade = e.spec.weapon;
    if (blade?.kind === "melee") sfx.enemyStrike?.(blade.id, e.position.distanceTo(camera.position), false);
  }
  // (As a strike begins: heard, and in a room, when it is at a mate, told to the mate's page,
  // which decides whether it lands -- owners.js. A school fish is this page's own: hurt()
  // decides here.)
  function swings(e) {
    enemySwings(e);
    if (owners && e.shared && e.target && !e.target.local && !e.target.school) owners.strike(e, e.target.id);
  }
  // The salmon as the splatter sees it when an enemy's round strikes it (gore.hit takes an
  // enemy), and the round's direction handed in beside it. Each hit of a step gets a record
  // of its own, as when one was made for every hit: gore.hit adds a step's hits up by the
  // record they come with, so one shared record would turn several rounds into one splash.
  // The records are made the first time a step needs that many and are used again from the
  // next step on (gore lets go of them at the end of every step, in gore.update).
  const struckBodies = [];
  let struckUsed = 0;
  const struckAlong = new THREE.Vector3();
  function struckBody(f) {
    const body = (struckBodies[struckUsed++] ??= { position: f.position, heading: f.heading, size: f.length, kind: "salmon", dead: false, spec: {} });
    body.position = f.position;
    body.heading = f.heading;
    body.size = f.length;
    return body;
  }
  // What the enemies' rounds do when they strike, made once rather than every step; the
  // step's outcome is handed to them in `stepOutcome` just before hostile.update.
  let stepOutcome = null;
  const hostileHooks = {
    // (On a mate the round only shows: its own page decides whether it struck. A mate whose
    // page is away cannot, so the page that fired it tells it -- owners.js.)
    onPlayer(shot, player) {
      // (A school fish is a body of its own for the splatter.)
      if (player.school) {
        gore.hit?.(player, shot.position, struckAlong.copy(shot.velocity).normalize(), shot.weapon);
        return hurt(player, shot.source, stepOutcome, shot);
      }
      hurt(player, shot.source, stepOutcome, shot);
      gore.hit?.(struckBody(player.fish), shot.position, struckAlong.copy(shot.velocity).normalize(), shot.weapon);
      if (!player.local && player.away && owners && shot.source?.shared && !shot.source.remote) owners.strike(shot.source, player.id, shot.hitDamage ?? shot.damage);
    },
    onGround(shot) {
      fx.fizz(shot.position.x, shot.position.y, shot.position.z, { count: 2, size: shot.size * 0.4, spread: shot.size, rise: 0.6, random: look });
      // (A bolt, a star, a knife that strikes the bed stays stuck in it: the look keeps it.)
      ordnance.struck(shot);
    },
    // (A round fired from over the water -- the heron's harpoon -- going in: heard.)
    onWater(shot) {
      sfx.enemyEntry?.(shot.weapon, shot.position.distanceTo(camera.position));
    },
  };

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

  // An enemy sunk here -- by the page that runs it: in a room one the others see goes out to
  // them (owners.js), and every page shows the same death (sunkShown).
  function onKill(e, by, dir, weapon, info = null) {
    // (A kill of this page's school goes out as its player's: the other pages know nothing
    // of the school, and would take its fish's id for one of their own school's.)
    if (owners && e.shared) owners.sunk(e, school.recordOf(by) ? local.id : by, dir, weapon);
    sunkShown(e, by, dir, weapon, info);
  }
  // A death as every page shows it: counted and rewarded for the killer on the killer's own
  // page ("Kampf nährt das Leben"), its sound, the jellyfish's own mine, the body burst or
  // floating up as the weapon decides.
  function sunkShown(e, by, dir, weapon, info = null) {
    const player = players.find((p) => p.id === by);
    if (player?.local) {
      player.kills++;
      reward(player, e);
    }
    // (A kill of the school's is counted as the school's: it does not feed the salmon, which
    // grows by its own fights.)
    const shooter = player ? null : school.recordOf(by);
    if (shooter) school.killed(shooter);
    if (by === local.id) {
      hud.hit(true);
      hud.say("Versenkt!", e.spec.title);
    }
    // (The school's kills are heard from where they sink.)
    if (shooter) sfx.from(e.position.distanceTo(camera.position), () => sfx.sunk(e.size));
    else sfx.sunk(e.size);
    // A jellyfish's mine goes off as it dies, whatever killed it: at once when a shot did, a
    // moment later when another blast did, so that a field goes up one after another. Its
    // own mine tears it apart then, not what killed it; the chain is the killer's too.
    const gun = e.spec.weapon;
    if (gun?.kind === "contact") {
      charges.push({ source: e, gun, at: e.position.clone(), fuse: by >= 0 && !info?.blast ? 0 : 0.12 + 0.1 * random(), body: true, by });
      return;
    }
    // What it leaves in the water is the splatter's (gore.js); here only the air it had.
    gore.kill(e, dir, weapon, info, (player ?? shooter)?.fish.length);
    fx.fizz(e.position.x, e.position.y, e.position.z, { count: Math.round(4 + 2 * e.size), size: 0.01 + 0.008 * e.size, spread: e.size * 0.3, random: look });
  }

  // The enemies' charges -- the jellyfish's sea mines, the gannet's bombs -- set off during
  // the step (a touch, a bomb's fuse, a death) and going off after the shots have flown,
  // each on its own short fuse: { source, gun, at, fuse, body (the charge tears its source
  // apart), by (whose the kills are: -1, the enemies') }.
  const charges = [];
  // The shared blast of the enemies' charges. The salmon within its radius takes `damage`
  // of its strength, less toward the edge (`edge` of it there), and bleeds where it was
  // struck; every player in reach is thrown outward, and the enemies caught in it take it
  // as they would a blast of the salmon's own -- hurt, thrown, stunned, the salmon's own
  // mines near it set off -- so a jellyfish caught in it goes off in turn: weapons.js's
  // blast(), which also shows it, as the salmon's sea mines look going off.
  const blastAt = new THREE.Vector3();
  const blastDir = new THREE.Vector3();
  const bodyTail = new THREE.Vector3();
  const bodyHead = new THREE.Vector3();
  const bodyNear = new THREE.Vector3();
  const along = new THREE.Vector3();
  const boom = { cause: null, damage: 0, hitDamage: 0 };
  // (A charge as blast() reads a weapon: drawn as big as a salmon's mine that blows as wide,
  // doing `harm` hit points at its heart.)
  const charged = {};
  const chargeSize = (gun) => gun.blast / 1.6;
  // (`quiet`: blast() does not play the salmon's explosion for it, whoever set it off; its own
  // sound is played here.)
  const chargeOf = (gun) => (charged[gun.id] ??= { blast: () => gun.blast, damage: gun.harm / damageScale(chargeSize(gun)), edge: gun.edge, shove: WEAPONS.minen.shove, stun: WEAPONS.minen.stun, flash: WEAPONS.minen.flash, quiet: true });
  function explode(c) {
    const gun = c.gun,
      e = c.source;
    blastAt.copy(c.body ? e.position : c.at);
    if (c.body) gore.kill(e, UP, gun.id);
    const R = gun.blast;
    // (Every player's fish in reach is struck; hurt() harms only this page's own, a mate's
    // body only bleeds here.)
    for (const player of players) {
      const f = player.fish;
      if (player.down || f.airborne) continue;
      bodyTail.copy(f.position).addScaledVector(f.heading, -0.5 * f.length);
      bodyHead.copy(f.position).addScaledVector(f.heading, 0.44 * f.length);
      along.subVectors(bodyHead, bodyTail);
      const t = clamp(blastDir.subVectors(blastAt, bodyTail).dot(along) / Math.max(1e-6, along.lengthSq()), 0, 1);
      bodyNear.copy(bodyTail).addScaledVector(along, t);
      const d = Math.max(0, bodyNear.distanceTo(blastAt) - 0.1 * f.length);
      if (d > R) continue;
      boom.cause = gun.cause;
      boom.damage = boom.hitDamage = gun.damage * (1 - (1 - gun.edge) * (d / R));
      hurt(player, e, stepOutcome, boom);
      blastDir.subVectors(bodyNear, blastAt);
      if (blastDir.lengthSq() < 1e-8) blastDir.set(0, 1, 0);
      gore.hit?.(struckBody(f), bodyNear, blastDir.normalize(), gun.id);
    }
    // (And the salmon's school, as the salmon: this page's own, in a room too.)
    school.blast(blastAt, gun, e);
    // (In a room each page's blast hits only the enemies it runs: the charge goes off on every
    // page, so each enemy in reach is struck once, by its owner.)
    firing.blast(c.by, blastAt, chargeOf(gun), gun.id, chargeSize(gun), null, !!owners);
    // The charge's own sound -- a sea mine, bombs -- also when the salmon set it off.
    sfx.enemyBlast?.(gun.id, camera.position.distanceTo(blastAt), chargeSize(gun));
  }
  // The charges whose fuse is up go off (and those they set off with no fuse left, at once).
  function detonations(dt) {
    const n = charges.length;
    for (let i = 0; i < n; i++) charges[i].fuse -= dt;
    for (let i = 0; i < charges.length; i++) {
      const c = charges[i];
      if (c.fuse > 0) continue;
      charges.splice(i--, 1);
      explode(c);
    }
  }
  // What the enemies do that ends in a blast: a jellyfish touched dies with its mine, a bomb
  // goes off where it is; and where a bomb goes into the water, it splashes.
  const chargeHooks = {
    touch(e) {
      if (e.dead) return;
      enemies.hit(e, e.hp + 1, null, -1);
      if (owners && e.shared) owners.sunk(e, -1, UP, "seamine");
      charges.push({ source: e, gun: e.spec.weapon, at: e.position.clone(), fuse: 0, body: true, by: -1 });
    },
    blast(at, gun, source) {
      charges.push({ source, gun, at: at.clone(), fuse: 0, body: false, by: -1 });
    },
    water(x, y, z, size, gun) {
      game.falls?.splash?.(x, y, z, size);
      game.ripples?.add?.(x, z, size);
      sfx.enemyEntry?.(gun?.id ?? "bombs", Math.hypot(x - camera.position.x, y - camera.position.y, z - camera.position.z));
    },
  };

  // A small sunk fish can be eaten where it lies, and so can a small one stunned belly-up,
  // and the chunks a burst one left (gore.eat).
  function eatCorpses(player) {
    const f = player.fish;
    if (player.down) return;
    for (const e of enemies.list) {
      // (Nor a jellyfish with its mine: a live one goes off at a touch, and a dead one's own
      // mine is about to tear it apart. Nor one another page runs, alive: its page decides.)
      // (Nor one of its own school, fallen.)
      if (e.eaten || e.burst || e.size > 1.1 * f.length || e.spec.weapon?.kind === "contact" || e.spec.kin || (e.remote && !e.dead)) continue;
      if (!e.dead && !firing.stunned(e)) continue;
      if (f.mouth.distanceTo(e.position) < 0.25 * f.length + 0.35 * e.size) {
        if (!e.dead) {
          // (Swallowed alive: a kill, but nothing is left to splatter.)
          enemies.hit(e, e.hp + 1, null, player.id);
          player.kills++;
          if (owners && e.shared) owners.sunk(e, player.id, UP, "bite");
        }
        // (A body the others see as well goes on their pages too: one this page ran, and one
        // another page ran that became this page's own body when it sank. Only this page's
        // own -- the larvae, the shoal fish -- have no id the others know.)
        if (owners && e.id > 0) owners.eaten(e);
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
      // (Those this page runs: another page's go on as their page has them.)
      for (const e of enemies.list)
        if (!e.dead && !e.remote) {
          e.mode = "recover";
          e.t = -4;
        }
      director.hold(10);
    }
    wasDown = local.down;
    rules.step(dt, local, enemies);
    // Co-op: what the others sent, the mates and the proxies placed, their events due.
    owners?.before(dt, outcome);
    wild.step();
    const L = fish.length;
    const w = WEAPONS[local.arsenal.back] ?? WEAPONS[local.arsenal.belly] ?? WEAPONS.piu;
    if ((touchMode || trigger.auto) && !trigger.test) {
      if (canFire() || trigger.auto) autoFire(local);
      else auto.back = auto.belly = false;
    } else if (trigger.back || trigger.belly || trigger.test) aim.update(enemies.list, Math.max(w.reach(L), 4 * L));
    fireWeapons(local, dt);
    // The salmon's school fights too (from the smolt on), and the director sends more for it.
    // (In a room the school is this page's alone: it fires here, and its shots are not sent.)
    school.step(dt, { stage: fish.stage });
    // (The mates' weapons, replayed for the eye.)
    owners?.replays(dt);
    enemies.hpScale = difficulty.level.hp;
    // In a room one page of a group sends the enemies, for as many players as are in the
    // room, counting what its group has about (owners.js), and more for its own armed school
    // (the others' schools are their pages' own); the larvae come to each alevin for its own
    // gravel.
    if (owners?.directs ?? true) director.update(dt, { fish, stage: fish.stage, enemies, players: owners?.roomSize ?? players.length, armed: school.armed, count: difficulty.level.count, dark: 1 - (game.daylight?.state?.daylight ?? 1), counts: owners?.counts });
    gravel.update(dt, { fish, enemies, players: owners ? 1 : players.length });
    bosses.update(dt, {
      fish,
      spawns: owners?.directs ?? true,
      room: !!owners,
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
      players: mine,
      terrain,
      onTake: (player, id) => {
        if (!player.local) return;
        hud.say(WEAPONS[id]?.title ?? id, "Neue Waffe", 1.6);
        sfx.pickup?.(id);
      },
    });
    // (The stones for the crawlers, only while there are crawlers about, and gathered again
    // only once the fish has moved on, the gravel has been laid anew or a second has gone
    // by: ground.js.)
    const crawling = enemies.list.some((e) => e.spec.crawls);
    if (crawling) ground.refresh(fish.position, 12, game.now.time);
    neutrals.update(fish);
    // (The enemies go for the players and the armed school fish alike: prey(). A blow that
    // reached this page's own fish -- the player's or one of its school -- is worked out here;
    // one that reached a mate is told to the mate's page, owners.js.)
    enemies.update(dt, game.now.time, prey(), { hurt: (p, e) => (p.local || p.school ? hurt(p, e, outcome) : owners?.landed(e, p)), shoot: enemyShoots, aim: enemyAims, swing: swings, ground: crawling ? ground : null, ...chargeHooks });
    // Thrown and stunned enemies, fire, the katana's swings: after the enemies have moved.
    firing.after(dt);
    // (The splatter's records for the salmon are free again: gore.update let go of them.)
    stepOutcome = outcome;
    struckUsed = 0;
    // (The enemies' rounds strike the players' fish as they are drawn here -- on a mate the
    // hit only shows -- and this page's armed school fish: school.targets.)
    hostile.update(dt, school.targets, hostileHooks);
    signals.whiffs(outcome);
    if (projectiles.live.length) terrain.collidersNear(fish.position.x, fish.position.z, WEAPONS.piu.reach(L) + 4, stones);
    else stones.length = 0;
    projectiles.update(dt, { enemies: enemies.list, stones, onEnemy: firing.onEnemy, onGround: firing.onGround, onStone: firing.onStone, onBounce: firing.onBounce, onExpire: firing.onExpire });
    // What the shots left: the grenades' trails, one splatter call a shell.
    firing.trails(dt);
    firing.flush();
    // The enemies' charges that are due.
    detonations(dt);
    eatCorpses(local);
    rules.after(local);
    fx.update(dt);
    ordnance.update(dt, projectiles.live);
    smoke.update(dt);
    gore.update(dt, school.bleeding(enemies.list));
    // Co-op: the handovers, the groups, the stream of what this page runs, the batch out.
    owners?.after(dt);
  }

  // The picture of this frame: the shots in flight, the weapons, the sparks, the capsules.
  function frame(dt) {
    // (In a room the world goes on behind the pause card: owners.js.)
    const shown = !game.now.paused || trigger.test || !!owners?.running;
    hud.update(dt, shown ? local.arsenal : null);
    hud.bars(enemies.list, camera, game.now.time);
    fx.begin();
    models.update(players);
    // The shots in flight, the grenades' bodies, the weapons' own lights.
    firing.draw(local);
    nightSigns();
    projectiles.draw();
    // The enemies' rounds; a spent one, sinking, is only a faint glint until it gets a look
    // of its own (then the look draws them all: fx.drawsRounds).
    if (!fx.drawsRounds)
      for (const p of hostile.live) {
        if (p.rested) continue;
        const k = p.spent ? 0.06 : 1;
        fx.add(p.position.x, p.position.y, p.position.z, p.spent ? p.size * 0.4 : p.size, p.tint[0] * k, p.tint[1] * k, p.tint[2] * k, p.spent ? 1 : p.stretch, p.velocity.x, p.velocity.y, p.velocity.z);
      }
    // The rounds' tracers and bodies, the cases, the ordnance and the bombs.
    ordnance.draw(projectiles.live, hostile.live, enemies.bombs);
    fx.end();
    // The larvae and the capsules (held still in the pause), and the weapons inside the
    // capsules once the weapon models dock there (capsules.anchor).
    larvae.draw(enemies.list, shown ? dt : 0);
    // The enemies' own weapons, strapped on the same way (after the larvae: theirs ride on the
    // larvae's matrices of this frame).
    models.enemies?.(enemies.list, larvae);
    // The school's guns on its fish (and on the fallen, floating up).
    school.frame();
    capsules.draw(pickups.items, game.now.time);
    models.capsules?.(pickups.items, capsules);
    smoke.frame();
    sfx.update?.();
    gore.frame();
  }

  // Seeing the enemies at night without lighting the river up: their eyes shine as many
  // hunting fish's do (a mirror behind the retina throws back what little light there is),
  // two small green-gold points turned toward the salmon; and a gunner drawing a bead shows
  // a thin red laser line through the water (by day as well, faintly: the tell before the
  // shot). Only near the camera, and not for the birds over the water.
  const EYE = [1.1, 1.3, 0.45];
  const EYES_AT = [0.3, 0.04, 0.055];
  const LASER = [3.2, 0.25, 0.15];
  const LASER_CORE = [4, 1.2, 1];
  const eyeAt = new THREE.Vector3();
  const across = new THREE.Vector3();
  const head = new THREE.Vector3();
  const aimAt = new THREE.Vector3();
  const muzzleAt = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  function nightSigns() {
    const night = 1 - (game.daylight?.state?.daylight ?? 1);
    enemies.night?.(night);
    for (const e of enemies.list) {
      if (e.dead || e.neutral || e.passive || e.spec.flies) continue;
      const d = e.position.distanceTo(camera.position);
      if (d > 30) continue;
      if (night > 0.05 && !e.spec.wades && !e.spec.render) {
        across.crossVectors(e.heading, UP);
        if (across.lengthSq() < 1e-6) across.set(0, 0, 1);
        across.normalize();
        // (The eyes go with the head: up, when it rears for a blow, as the otter does.)
        head.copy(e.heading);
        if (e.rear) head.applyAxisAngle(across, e.rear);
        // (Brighter the more it faces the eye: a mirror throws the light back the way it came.)
        const facing = Math.max(0, -head.dot(eyeAt.subVectors(e.position, camera.position).normalize()));
        const k = night * (0.35 + 0.65 * facing) * (1 - d / 30);
        const size = Math.max(0.012 * e.size, 0.004 * d);
        // (Where its eyes are, in lengths ahead of its middle, up and to either side: a kind
        // whose head is not a fish's says so itself, `eyes` in kinds.js.)
        const [ahead, up, aside] = e.spec.eyes ?? EYES_AT;
        for (const side of [-1, 1]) {
          eyeAt.copy(e.heading).multiplyScalar(ahead * e.size).addScaledVector(UP, up * e.size).addScaledVector(across, side * aside * e.size);
          if (e.rear) eyeAt.applyAxisAngle(across, e.rear);
          eyeAt.add(e.position);
          fx.add(eyeAt.x, eyeAt.y, eyeAt.z, size, EYE[0] * k, EYE[1] * k, EYE[2] * k, 1);
        }
      }
      if (e.mode === "aim" && e.target?.fish) {
        if (!models.enemyMuzzle?.(e, muzzleAt)) enemies.snout(e, muzzleAt);
        // (At a mate: where it is drawn.)
        aimAt.copy((e.target.drawn ?? e.target.fish).position);
        firing.line(muzzleAt, aimAt, 0.006 + 0.004 * e.size, LASER, LASER_CORE, 0.25 + 0.55 * night);
      }
    }
  }

  return {
    players,
    get targets() {
      return targets;
    },
    local,
    enemies,
    projectiles,
    hostile,
    ordnance,
    smoke,
    firing,
    school,
    fx,
    // (For the look's tests: the splatter and the marks it leaves.)
    gore,
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
    // Co-op (owners.js): joined once in a room; what the owners call back into.
    join(o, list) {
      owners = o;
      targets = list;
      local.tally = [0, 0];
    },
    hurt: (player, e, outcome, shot) => hurt(player, e, outcome, shot),
    enemyShoots,
    enemyAims,
    enemySwings,
    sunkShown,
    reward,
    charges,
    gore,
    hud,
    sfx,
    fx,
    difficulty,
    canFire,
    trigger,
  };
}
