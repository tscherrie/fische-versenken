// The player's weapons (src/fv/sfx.js, src/fv/sfx-spieler.js) for the sound check
// (tools/sound-check.html): each on its own with the beds stopped, fired as the game fires
// it -- single shots, bursts at the weapon's real rate, held weapons for seconds on end and
// let go -- and the older weapons beside them (the shotgun, the grenade launcher, a blast,
// the flamethrower) to measure their loudness against. The checks are in
// tools/sound-check.mjs, under "the player's weapons".
//
// A held weapon is told every frame, as the game tells it every step; the combat sound
// (the scene's own, which the sound check hands the events third) is updated every frame by
// the sound check, as the game's is (the loops let go of what nothing keeps).

const FRAME = 1 / 30;
// Every frame from `from` to `to`: `call(sfx, t)`.
function frames(from, to, call) {
  const out = [];
  for (let t = from; t < to - 1e-9; t += FRAME) out.push([t, (s, now, sfx) => call(sfx, t)]);
  return out;
}
// At each of `times`: `call(sfx, t)`.
const at = (times, call) => times.map((t) => [t, (s, now, sfx) => call(sfx, t)]);
// Evenly from `from`, `count` of them `every` seconds apart.
const series = (from, count, every) => Array.from({ length: count }, (_, i) => from + i * every);

// The sound fades in over its first three seconds (as after the first click in the game):
// a weapon's scene begins after that, its times (events, `active`, what `measure` asks
// for) counted from then.
const UP = 3;
// What a scene measures, at its own times.
const later = (m) => ({
  loud: (a, b) => m.loud(a + UP, b + UP),
  loudest: (a, b, w) => m.loudest(a + UP, b + UP, w),
  band: (a, b, f0, f1) => m.band(a + UP, b + UP, f0, f1),
  dip: (a, b, w) => m.dip(a + UP, b + UP, w),
  edges: (moments, a, b) => m.edges(moments.map((t) => t + UP), a + UP, b + UP),
  repeats: (a, b, ...rest) => m.repeats(a + UP, b + UP, ...rest),
});
// A weapon's scene: the beds stopped (`alone`), what it plays counted (the combat sound's
// voices, frame by frame). `active`: the stretch whose spectrum is taken.
function weapon(name, events, { seconds = 8, params = {}, active = [1, 7], measure = null } = {}) {
  return {
    name,
    kind: "weapon",
    alone: true,
    seconds: seconds + UP,
    params,
    active: active.map((t) => t + UP),
    events: events.map(([t, call]) => [t + UP, call]),
    watch: (sound, sfx) => ({ voices: sfx.playing }),
    measure: measure && ((m) => measure(later(m))),
  };
}
// Four shots, a second and a half apart.
const four = (name, call, options) => weapon(name, at([1, 2.5, 4, 5.5], call), options);

// A held weapon: the trigger held while `trigger(t)`, told every frame as the game tells it
// (a spin weapon winds up and runs down at its own rates: `up`, `down`), until `until`.
// `bite(t)`: a chainsaw's chain is in something then.
function spun(id, { trigger = (t) => t >= 1 && t < 5, until = 6.4, up = 0.45, down = 0.8, L = 1.6, heat = () => 0, bite = null, fire = true } = {}) {
  let spin = 0;
  let last = 0.3;
  return frames(0.3, until, (s, t) => {
    const dt = t - last;
    last = t;
    const held = trigger(t);
    spin = Math.min(1, Math.max(0, spin + (held ? dt / up : -dt / down)));
    s.hold?.(id, spin, heat(t), L, fire && held && spin >= 1);
    if (bite && held && spin >= 1 && bite(t)) s.bite?.(id);
  });
}

// What a loop is measured by: its loudness held (`from`-`to`), its dips (no silence where
// it should sound), its start at `on` and its end at `off` (no click: the sharpest step
// there against the sharpest in the held sound), and whether its band comes round the same.
function loopMeasure(on, off, from, to, f0 = 150, f1 = 4000) {
  return (m) => ({
    held: m.loud(from, to),
    dip: m.dip(from, to, 0.05),
    edges: m.edges([on, off], from, to),
    repeats: m.repeats(from, to, f0, f1, 0.3, Math.min(4, (to - from) / 2), 0.02),
  });
}

// The hiss after each of four shots (the quarter second after each, 4-10 kHz, their energy
// together): where a hot laser's harsher boil shows, whatever else rises in the scene.
const hissAfter = (m) => ({ hiss: 10 * Math.log10([1, 2.5, 4, 5.5].reduce((sum, t) => sum + Math.pow(10, m.band(t, t + 0.25, 4000, 10000) / 10), 0) / 4) });

export function weaponScenes() {
  // The laser as the game fires it: `pulses` shots 0.11 s apart, then the beam for
  // `beam` seconds, again and again while held.
  function laserHeld(L, pulses, beam, from = 1, to = 6, heat = 0) {
    const events = [];
    let t = from;
    const beams = [];
    while (t < to) {
      for (let i = 0; i < pulses && t < to; i++, t += 0.11) events.push(...at([t], (s) => s.piu(L, heat)));
      beams.push([t, Math.min(to, t + beam)]);
      t += beam + 0.11;
    }
    events.push(...frames(0.3, to + 0.5, (s, time) => s.hold("beam", beams.some(([a, b]) => time >= a && time < b), heat, L)));
    return events;
  }
  return [
    // ---- What the new sounds are measured against.
    four("ref_flinte", (s) => s.flinte(0.4)),
    // (Both barrels, as fast as the gun allows.)
    weapon("ref_flinte_pair", at([1, 1.15, 3, 3.15, 5, 5.15], (s) => s.flinte(0.4))),
    four("ref_granate", (s) => s.granate(0.5)),
    four("ref_explosion", (s) => s.explosion(1, 1)),
    four("ref_explosion_far", (s) => s.explosion(1, 10)),
    weapon("ref_flame", frames(0.3, 6, (s, t) => s.flame(t >= 1 && t < 5, (t - 1) / 5, 1.2)), { measure: loopMeasure(1, 5, 1.5, 4.8, 150, 3000) }),
    four("ref_katana_swing", (s) => s.katanaSwing(1)),

    // ---- The laser: a fry's, a parr's, a spawner's; hot; heard from above the water.
    four("laser_fry", (s) => s.piu(0.35, 0)),
    four("laser_parr", (s) => s.piu(1.2, 0), { measure: hissAfter }),
    four("laser_spawner", (s) => s.piu(9, 0)),
    four("laser_hot", (s) => s.piu(1.2, 0.9), { measure: hissAfter }),
    four("laser_above", (s) => s.piu(1.2, 0), { params: { submerged: 0 } }),
    // Held as the game fires it: a fry's five pulses and short beam, a spawner's one pulse
    // and long beam; and a fry holding it for twenty seconds, getting hot (nothing may pile
    // up: its voices all gone at the end).
    weapon("laser_held_fry", laserHeld(0.35, 5, 0.46, 1, 6)),
    weapon("laser_held_spawner", laserHeld(9, 1, 1.6, 1, 6)),
    weapon("laser_held_20s", laserHeld(0.35, 5, 0.46, 1, 21, 0.5), { seconds: 23, active: [1, 21] }),
    // ---- The beam held on its own (the particle beam: only the beam), cold and heating.
    weapon("beam_parr", frames(0.3, 5.6, (s, t) => s.hold("beam", t >= 1 && t < 5, 0, 1.2)), { measure: loopMeasure(1, 5, 1.5, 4.8, 2000, 6000) }),
    weapon("beam_spawner", frames(0.3, 5.6, (s, t) => s.hold("beam", t >= 1 && t < 5, 0, 9)), { measure: loopMeasure(1, 5, 1.5, 4.8, 2000, 6000) }),
    weapon("beam_heating", frames(0.3, 5.6, (s, t) => s.hold("beam", t >= 1 && t < 5, Math.min(1, (t - 1) / 4), 1.2)), {
      measure: (m) => ({ cold: m.loud(1.3, 2), hot: m.loud(4.2, 4.9), hiss: m.band(4.2, 4.9, 3000, 8000) - m.band(1.3, 2, 3000, 8000), edges: m.edges([1, 5], 1.5, 4.8) }),
    }),

    // ---- The minigun: wound up, firing four seconds, run down; tapped; twenty seconds of
    // it; from above the water.
    weapon("minigun", spun("minigun"), {
      active: [1.5, 5],
      measure: (m) => ({ motor: m.loud(1.1, 1.4), firing: m.loud(1.7, 4.9), dip: m.dip(1.7, 4.9, 0.1), rundown: m.loud(5.1, 5.6), edges: m.edges([1, 5.8], 1.7, 4.9), repeats: m.repeats(1.7, 4.9, 60, 4000, 0.3, 1.5, 0.02) }),
    }),
    // The motor alone, wound up and held there (the trigger let go at the moment it is at
    // speed, then held again: a spin that never quite fires).
    weapon("minigun_motor", spun("minigun", { trigger: (t) => t >= 1 && t < 5, up: 0.45, until: 6.4, fire: false }), {
      measure: (m) => ({ spun: m.loud(2, 4.8), edges: m.edges([1, 5.8], 2, 4.8) }),
    }),
    weapon("minigun_taps", spun("minigun", { trigger: (t) => t >= 1 && t < 6.2 && (t - 1) % 1.3 < 0.8, until: 7.8 }), { measure: (m) => ({ edges: m.edges([6.2], 1.5, 6) }) }),
    weapon("minigun_20s", spun("minigun", { trigger: (t) => t >= 1 && t < 21, until: 22.5, heat: (t) => Math.min(0.95, (t - 1) / 20) }), { seconds: 23, active: [1.5, 21], measure: (m) => ({ early: m.loud(2, 5), late: m.loud(17, 20.8), dip: m.dip(1.7, 20.8, 0.1), after: m.loud(22.2, 22.8) }) }),
    weapon("minigun_above", spun("minigun"), { params: { submerged: 0 }, active: [1.5, 5] }),

    // ---- The chainsaw: carried (ticking over, quieter after five seconds), revved and
    // biting, twenty seconds of it in turns.
    weapon("saw_idle", spun("saege", { trigger: () => false, until: 11.9, up: 0.4, down: 0.8, L: 9 }), { seconds: 12, active: [1, 11], measure: (m) => ({ early: m.loud(1.5, 4.5), late: m.loud(7.5, 11.5), dip: m.dip(1.5, 4.5, 0.1), repeats: m.repeats(1.5, 11.5, 60, 4000, 0.5, 4, 0.02) }) }),
    weapon("saw_cut", spun("saege", { trigger: (t) => t >= 1 && t < 5.5, until: 7.9, up: 0.4, down: 0.8, L: 9, bite: (t) => t >= 2.5 && t < 4.5 }), {
      active: [1, 6],
      measure: (m) => ({ idle: m.loud(0.5, 0.95), rev: m.loud(1.6, 2.4), bite: m.loud(2.7, 4.4), grind: m.band(2.7, 4.4, 500, 1500) - m.band(1.6, 2.4, 500, 1500), after: m.loud(6.5, 7.5), dip: m.dip(1.6, 4.4, 0.1) }),
    }),
    // (Put away at the end: nothing of it may be left.)
    weapon("saw_20s", spun("saege", { trigger: (t) => t >= 1 && t < 21 && (t - 1) % 4 < 2.5, until: 21.6, up: 0.4, down: 0.8, L: 9, bite: (t) => (t - 1) % 4 > 1 }), { seconds: 23, active: [1, 21] }),

    // ---- The arc: striking nothing, one, six; held on a shoal.
    four("arc_none", (s) => s.arc(4, 0)),
    four("arc_one", (s) => s.arc(4, 1)),
    four("arc_six", (s) => s.arc(4, 6)),
    weapon("arc_held", at(series(1, 34, 0.12), (s, t) => s.arc(4, 1 + (Math.round(t * 10) % 6)))),

    // ---- The nodachi: one turn; held, turn after turn.
    four("whirl", (s) => s.whirl(9)),
    weapon("whirl_held", at(series(1, 10, 0.42), (s) => s.whirl(9))),

    // ---- One-shots: each on its own, and as fast as the gun fires them.
    four("cannon", (s) => s.cannon(7)),
    four("cannon_above", (s) => s.cannon(7), { params: { submerged: 0 } }),
    four("torpedo", (s) => s.torpedo(1.6)),
    weapon("torpedo_rack", at([1, 1.35, 1.7, 2.05, 4.5, 4.85], (s) => s.torpedo(2.5))),
    four("rocket", (s) => s.rocket(2.5)),
    weapon("rocket_salvo", at([...series(1, 8, 0.14), ...series(4.5, 8, 0.14)], (s) => s.rocket(2.5))),
    four("mine", (s) => s.mine(2.5)),
    weapon("mine_rack", at(series(1, 3, 0.4), (s) => s.mine(2.5))),
    four("harpoon", (s) => s.harpoon(7)),
    four("rifle", (s) => s.rifle(4)),
    weapon("rifle_magazine", at(series(1, 5, 0.5), (s) => s.rifle(4))),
    weapon("pickup", at([1, 2.5, 4, 5.5], (s, t) => s.pickup(["piu", "kanone", "blitz", "minigun"][Math.round((t - 1) / 1.5)]))),

    // ---- All at once: the minigun and the chainsaw held, the beam cycling, arcs, rockets and
    // the cannon on top (the cap holds, the blasts still get their reserve).
    weapon("all_at_once", [
      ...spun("minigun", { trigger: (t) => t >= 1 && t < 6 }),
      ...spun("saege", { trigger: (t) => t >= 1.5 && t < 5.5, up: 0.4, L: 9, bite: (t) => t > 2.5 }),
      ...laserHeld(1.2, 4, 0.9, 1, 6),
      ...at(series(1.2, 38, 0.12), (s) => s.arc(4, 4)),
      ...at(series(2, 8, 0.14), (s) => s.rocket(2.5)),
      ...at([3, 4.5], (s) => (s.cannon(7), s.explosion(2, 2))),
    ], { seconds: 8, measure: (m) => ({ loudest: m.loudest(1, 7, 0.4) }) }),
  ];
}
