// The sound check's scenes for the enemies' weapons (src/fv/sfx-enemies.js), with the
// salmon's own weapons they are measured against (en_ref_*: timed as these scenes are, from
// the first second on), and their table and checks for tools/sound-check.mjs. Each scene gets
// the combat sounds as a third argument to its events (sound, t, sfx) and plays with the
// river's beds stopped (`alone`), so a weapon's loudness is its own; a few play over the bed
// as one-shots (`shot`) to see how far they stand out. Every scene watches how many of the
// combat sounds' voices sound, frame by frame (the sound check's `voices` and `voicesEnd`),
// so the checks can see a voice left behind or the cap overrun.

// Near: an enemy this far from the ear (units); far off: this far.
const NEAR = 4;
const FARTHER = 30;
const watch = (s, fx) => ({ voices: fx?.playing ?? 0 });
// A scene of the enemies' weapons: the beds stopped, `events` [t, (sound, t, sfx)], and what
// it measures of its own beside the voices.
// (`tilt`: how bright it is as it begins, its 1.5-6 kHz against its 40-400 Hz in dB in the
// 50 ms from each of its first four events, the middle value of them. The spectrum's
// centroid over the whole scene would be the river's small sounds' as much as its own for a
// quiet one: with the beds stopped, the bubbles and ticks the river schedules now and then
// still come, and one may fall into any window.)
function scene(name, events, { seconds = 8, params = {}, measure = null } = {}) {
  const starts = [...new Set(events.map(([t]) => t))].sort((a, b) => a - b).slice(0, 4);
  const tilt = (m) => {
    const list = starts.map((t) => m.band(t, t + 0.05, 1500, 6000) - m.band(t, t + 0.05, 40, 400)).sort((a, b) => a - b);
    return list[Math.floor(list.length / 2)];
  };
  return { name, kind: "weapon", alone: true, seconds, params, events, watch, measure: (m) => ({ tilt: tilt(m), ...(measure ? measure(m) : {}) }) };
}
// The same sound four times on its own (1, 2.5, 4, 5.5 s): a different one every time.
const four = (name, fire, options) => scene(name, [1, 2.5, 4, 5.5].map((t) => [t, fire]), options);
// A burst of `n` rounds `interval` apart from `at` (as the game's step sets them off: the
// scene's frames are a thirtieth of a second, so the rounds fall on those).
const burst = (fire, at, n, interval) => Array.from({ length: n }, (_, i) => [at + i * interval, fire]);
const shotOf = (id, d = NEAR) => (s, t, fx) => fx.enemyShot(id, d);

// The guns as the enemies fire them (kinds.js): single shots near, and the bursts at their
// real rate, and the far ones.
const GUNS = {
  sawnoff: { burst: 1, interval: 0.1 },
  pumpgun: { burst: 1, interval: 0.1 },
  pistol: { burst: 2, interval: 0.18 },
  revolver: { burst: 6, interval: 0.28 },
  smg: { burst: 6, interval: 0.085 },
  rifle: { burst: 3, interval: 0.1 },
  nailgun: { burst: 3, interval: 0.16 },
  crossbow: { burst: 1, interval: 0.1 },
  stars: { burst: 1, interval: 0.1 },
  knives: { burst: 1, interval: 0.1 },
  speargun: { burst: 1, interval: 0.1 },
  elephantgun: { burst: 1, interval: 0.1 },
};
// How loud each should be against the salmon's shotgun (loudest 400 ms, dB): the heavy guns
// about as loud, a pistol less, the thrown blades well under it; the charges about as loud
// as the salmon's own blast.
export const BAND = {
  sawnoff: [-6, 1],
  pumpgun: [-6, 1],
  elephantgun: [-5, 2],
  minigun: [-6, 1],
  revolver: [-8, 0],
  rifle: [-8, 0],
  pistol: [-10, -2],
  smg: [-10, -2],
  nailgun: [-12, -3],
  crossbow: [-12, -3],
  speargun: [-12, -2],
  stars: [-18, -7],
  knives: [-18, -7],
};

const minigunBurst = (at, seconds, d = NEAR) => [[at, (s, t, fx) => fx.enemyAim("minigun", d, 0.8)], ...burst(shotOf("minigun", d), at + 0.8, Math.round(seconds / 0.05), 0.05)];

export const ENEMY_SCENES = [
  // ---- The salmon's own, the yardstick.
  four("en_ref_flinte", (s, t, fx) => fx.flinte(0.4)),
  four("en_ref_granate", (s, t, fx) => fx.granate(0.5)),
  scene("en_ref_explosion", [1, 4].map((t) => [t, (s, t2, fx) => fx.explosion(1, 2)])),
  scene("en_ref_explosion_far", [1, 4].map((t) => [t, (s, t2, fx) => fx.explosion(1, 20)])),
  // (Held from 1 to 5 s: the game calls it every step.)
  scene("en_ref_flame", Array.from({ length: 150 }, (_, i) => [1 + i / 30, (s, t, fx) => fx.flame(t < 5, 0.3, 1)]), { measure: (m) => ({ held: m.loud(2, 4.8) }) }),

  // ---- Every gun near, a shot at a time.
  ...Object.keys(GUNS).map((id) => four(`en_${id}`, shotOf(id))),
  // ... and far off: quieter and duller.
  ...["sawnoff", "rifle", "smg", "elephantgun", "speargun", "pistol"].map((id) => four(`en_${id}_far`, shotOf(id, FARTHER))),
  // ... and in their bursts, three times over.
  ...Object.entries(GUNS)
    .filter(([, g]) => g.burst > 1)
    .map(([id, g]) => scene(`en_${id}_burst`, [1, 3, 5].flatMap((at) => burst(shotOf(id), at, g.burst, g.interval)), { measure: (m) => ({ span: m.loud(1, 7) }) })),
  // The pump worked after the shot: two clacks (onsets at 1-3 kHz) after each boom.
  scene("en_pumpgun_pump", [[1, shotOf("pumpgun")]], { measure: (m) => ({ clacks: m.onsets(1.25, 1.58, 1000, 3000, 8, 0.06) }) }),
  // The king's minigun: its barrels spun up over the aim, a burst of 26, and again; and a
  // long one, five seconds without a break, to hear the loop.
  scene("en_minigun", [...minigunBurst(1, 1.3), ...minigunBurst(4.2, 1.3)], { seconds: 10, measure: (m) => ({ spinup: m.band(1.3, 1.75, 60, 400) - m.band(0.5, 0.9, 60, 400), after: m.band(9.2, 10, 20, 90) }) }),
  scene("en_minigun_long", minigunBurst(1, 5), { seconds: 10, measure: (m) => ({ span: m.loud(2.5, 6.5), swing: m.swing(2.5, 6.5, 0.1), repeats: m.repeats(2.5, 6.5, 300, 1500, 0.4, 1.6, 0.01), after: m.band(9.2, 10, 20, 90) }) }),
  // An aim that never fires (the king sunk as it spun up): the barrels run down, nothing is
  // left turning.
  scene("en_minigun_aim_only", [[1, (s, t, fx) => fx.enemyAim("minigun", NEAR, 0.8)]], { measure: (m) => ({ spin: m.loud(1.4, 2), after: m.band(5, 8, 20, 90) }) }),
  // A shoal of mackerels: eight, each with its three-round burst, at their own times and
  // distances, over four seconds; and ten minnows' razors darting in.
  scene(
    "en_rifle_shoal",
    Array.from({ length: 8 }, (_, i) => burst(shotOf("rifle", 5 + (i * 7) % 11), 1 + ((i * 0.53) % 4), 3, 0.1)).flat(),
    { measure: (m) => ({ loudest: m.loudest(1, 5.5, 0.4) }) },
  ),
  scene(
    "en_pistol_pack",
    Array.from({ length: 4 }, (_, i) => [0, 1.2, 2.4, 3.6].map((at) => burst(shotOf("pistol", 4 + 2 * i), 1 + at + i * 0.21, 2, 0.18)).flat()).flat(),
    { measure: (m) => ({ loudest: m.loudest(1, 6, 0.4) }) },
  ),
  // The ear above the water: a gun under it only a dull thump; the harpoon gun over it
  // clear; the harpoon gun as the salmon under the water hears it (en_speargun).
  four("en_rifle_above", shotOf("rifle"), { params: { submerged: 0 } }),
  four("en_speargun_above", shotOf("speargun", 12), { params: { submerged: 0 } }),
  four("en_speargun_12", shotOf("speargun", 12)),

  // ---- The wind-ups: the elephant gun's hammer and the shot 1.3 s later; the harpoon gun's
  // safety, the shot 1.1 s later and the harpoon going in; the gannet's bombs whistling down
  // (0.8 s), going in (two), and going off.
  scene("en_aim_elephantgun", [[1, (s, t, fx) => fx.enemyAim("elephantgun", 8, 1.3)], [2.3, shotOf("elephantgun", 8)]]),
  scene("en_aim_speargun", [[1, (s, t, fx) => fx.enemyAim("speargun", 16, 1.1)], [2.1, shotOf("speargun", 16)], [2.8, (s, t, fx) => fx.enemyEntry("speargun", 6)]]),
  scene(
    "en_bombs",
    [1, 4.5].flatMap((at) => [
      [at, (s, t, fx) => fx.enemyAim("bombs", 14, 0.8)],
      [at + 0.8, (s, t, fx) => (fx.enemyEntry("bombs", 9), fx.enemyEntry("bombs", 9.5))],
      [at + 1.3, (s, t, fx) => (fx.enemyBlast("bombs", 7, 2), fx.enemyBlast("bombs", 7.5, 2))],
    ]),
    { measure: (m) => ({ whistle: m.band(1.4, 1.8, 500, 1600) - m.band(0.4, 0.9, 500, 1600), blast: m.loudest(2.2, 3, 0.4) }) },
  ),
  // (Going off as far off as the other far scenes: at 26 units the nearness alone gave only
  // a little more than the 8 dB the check asks, and a boom's own give and take decided it.)
  scene("en_bombs_far", [[1, (s, t, fx) => fx.enemyAim("bombs", FARTHER + 4, 0.8)], [1.8, (s, t, fx) => fx.enemyEntry("bombs", FARTHER + 2)], [2.3, (s, t, fx) => fx.enemyBlast("bombs", FARTHER, 2)]], { measure: (m) => ({ blast: m.loudest(2.2, 3, 0.4) }) }),

  // ---- The sea mines: one near, one far off, and a field going up one after another.
  scene("en_seamine", [1, 4.5].map((t) => [t, (s, t2, fx) => fx.enemyBlast("seamine", 6, 1.75)])),
  scene("en_seamine_far", [1, 4.5].map((t) => [t, (s, t2, fx) => fx.enemyBlast("seamine", FARTHER, 1.75)])),
  scene(
    "en_seamine_chain",
    Array.from({ length: 7 }, (_, i) => [1 + i * 0.17, (s, t, fx) => fx.enemyBlast("seamine", 6 + i * 1.5, 1.75)]),
    { measure: (m) => ({ booms: m.onsets(1, 2.6, 30, 120, 3, 0.1), loudest: m.loudest(1, 3, 0.4) }) },
  ),

  // ---- The blades: swung as the strike begins, landing a moment later.
  ...["knife", "razor", "pushdagger", "shocker", "switchblade", "machete"].map((id) =>
    scene(
      `en_${id}`,
      [1, 3, 5].flatMap((at) => [
        [at, (s, t, fx) => fx.enemyStrike(id, 3, false)],
        [at + 0.3, (s, t, fx) => fx.enemyStrike(id, 3, true)],
      ]),
      { measure: (m) => ({ blow: m.loudest(1.25, 1.8, 0.4) }) },
    ),
  ),
  // A shoal of ten minnows darting in, three of them landing.
  scene(
    "en_razor_shoal",
    [...Array.from({ length: 16 }, (_, i) => [1 + i * 0.27, (s, t, fx) => fx.enemyStrike("razor", 2 + (i % 5), false)]), ...[1.5, 3.1, 4.4].map((t) => [t, (s, t2, fx) => fx.enemyStrike("razor", 2.5, true)])],
    { measure: (m) => ({ loudest: m.loudest(1, 6, 0.4) }) },
  ),

  // ---- A long fight: bursts for twenty seconds, then quiet -- no voice left behind.
  scene("en_long_fight", [...Array.from({ length: 24 }, (_, i) => burst(shotOf(["smg", "rifle", "pistol", "nailgun"][i % 4], 5 + (i % 7)), 1 + i * 0.8, 3, 0.09)).flat(), ...minigunBurst(8, 1.3), ...minigunBurst(15, 1.3)], { seconds: 24 }),

  // ---- Everything at once for twelve seconds, and the salmon's own shotgun among it: it
  // must be heard every time (a shoal never takes its voices), and nothing clip.
  (() => {
    const own = [];
    const events = [];
    for (let i = 0; i < 8; i++) events.push(...[0, 3, 6].flatMap((at) => burst(shotOf("rifle", 4 + i), 1 + at + i * 0.37, 3, 0.1)));
    for (let i = 0; i < 4; i++) events.push(...[0, 2, 4, 6, 8].flatMap((at) => burst(shotOf("pistol", 3 + i), 1.1 + at + i * 0.23, 2, 0.18)));
    events.push(...minigunBurst(2, 1.3, 9), ...minigunBurst(7, 1.3, 9));
    events.push(...Array.from({ length: 5 }, (_, i) => [5 + i * 0.17, (s, t, fx) => fx.enemyBlast("seamine", 5 + 2 * i, 1.75)]));
    events.push(...Array.from({ length: 30 }, (_, i) => [1 + i * 0.33, (s, t, fx) => fx.enemyStrike(i % 2 ? "razor" : "knife", 2 + (i % 4), i % 3 === 0)]));
    events.push([9, (s, t, fx) => fx.enemyAim("bombs", 12, 0.8)], [9.8, (s, t, fx) => fx.enemyEntry("bombs", 9)], [10.3, (s, t, fx) => (fx.enemyBlast("bombs", 6, 2), fx.enemyBlast("bombs", 6.5, 2))]);
    // (The salmon's shotgun: whether it was let sound, seen as its voices going up; and
    // whether a blast rang then -- a blast may take the reserve, as the salmon's own do, and
    // hold its shotgun back a moment.)
    const ringing = (t) => (t >= 5 && t < 5 + 0.68 + 1.4) || (t >= 10.3 && t < 11.7);
    for (let t = 1.5; t < 12; t += 0.7)
      events.push([
        t,
        (s, t2, fx) => {
          const before = fx.playing;
          fx.flinte(0.4);
          own.push([fx.playing > before, ringing(t2)]);
        },
      ]);
    const heard = (list) => `${list.filter(([ok]) => ok).length}/${list.length}`;
    return scene("en_stress", events, {
      seconds: 15,
      measure: (m) => ({ own: heard(own.filter(([, r]) => !r)), ownBlast: heard(own.filter(([, r]) => r)), ownAll: own.every(([ok, r]) => ok || r) ? 1 : 0, loudest: m.loudest(1, 12, 0.4) }),
    });
  })(),

  // ---- Over the river's bed, as one-shots: how far they stand out (Δ, and on a phone) --
  // the salmon's own shotgun and grenade as the yardstick.
  { name: "ref_bed_flinte", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.flinte(0.4)]] },
  { name: "ref_bed_granate", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.granate(0.5)]] },
  { name: "en_bed_rifle_near", kind: "shot", params: {}, events: [[4, shotOf("rifle", NEAR)]] },
  { name: "en_bed_rifle_burst", kind: "shot", params: {}, events: burst(shotOf("rifle", 10), 4, 3, 0.1) },
  { name: "en_bed_rifle", kind: "shot", params: {}, events: [[4, shotOf("rifle", 10)]] },
  { name: "en_bed_rifle_far", kind: "shot", params: {}, events: [[4, shotOf("rifle", FARTHER)]] },
  { name: "en_bed_pistol", kind: "shot", params: {}, events: [[4, shotOf("pistol", 8)]] },
  { name: "en_bed_elephantgun_far", kind: "shot", params: {}, events: [[4, shotOf("elephantgun", FARTHER)]] },
  { name: "en_bed_knife", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.enemyStrike("knife", 3, true)]] },
  // The wind-ups over the bed, as the salmon would hear them: the pike's hammer 8 units off,
  // the heron's safety 16 units off (over the water), the bombs whistling down 14 off.
  // (Each in its own band, its loudest 10 ms -- or 50 ms for the whistle -- against the bed's
  // loudest before it: a click is too short for the loudness of 50 ms to show it.)
  { name: "en_bed_hammer", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.enemyAim("elephantgun", 8, 1.3)]], measure: (m) => ({ cue: m.bandMax(4, 4.2, 1000, 3000, 0.01) - m.bandMax(2.5, 4, 1000, 3000, 0.01) }) },
  { name: "en_bed_safety", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.enemyAim("speargun", 16, 1.1)]], measure: (m) => ({ cue: m.bandMax(4, 4.15, 500, 2500, 0.01) - m.bandMax(2.5, 4, 500, 2500, 0.01) }) },
  { name: "en_bed_whistle", kind: "shot", params: {}, events: [[4, (s, t, fx) => fx.enemyAim("bombs", 14, 0.8)]], measure: (m) => ({ cue: m.bandMax(4.3, 4.85, 600, 1600, 0.05) - m.bandMax(2.5, 4, 600, 1600, 0.05) }) },
];

// The table of these scenes, for sound-check.mjs.
export function enemyTable(results, pad) {
  const rows = results.filter((r) => r.kind === "weapon" && r.name.startsWith("en_"));
  if (!rows.length) return;
  const flinte = rows.find((r) => r.name === "en_ref_flinte")?.full;
  console.log(`\ncombat, on their own     LUFS(400ms) vs flinte  peak  centroid  voices max/end  nodes  measured`);
  for (const r of rows) {
    console.log(`${r.name.padEnd(23)} ${pad(r.full, 8)} ${pad(flinte === undefined ? "" : (r.full - flinte).toFixed(1), 10)} ${pad(r.peak, 5)} ${pad(r.centroid, 9)} ${pad(`${r.voices}/${r.voicesEnd}`, 15)} ${pad(r.shotNodes, 6)}  ${Object.entries(r.extra ?? {})
      .map(([k, v]) => `${k} ${v}`)
      .join("  ")}`);
  }
}

// The checks, for sound-check.mjs: `get(name)` a scene's result, `check(what, ok)`.
export function enemyChecks(get, check) {
  const flinte = get("en_ref_flinte")?.full;
  // Each gun near as loud as it should be against the salmon's shotgun.
  for (const [id, [lo, hi]] of Object.entries(BAND)) {
    const r = get(`en_${id}`) ?? get(`en_${id}_burst`);
    if (!r || flinte === undefined) continue;
    const d = r.full - flinte;
    check(`en_${id}: ${d.toFixed(1)} dB against the salmon's shotgun (${lo}..${hi})`, d >= lo && d <= hi);
  }
  // The charges about as loud as the salmon's own blast.
  const blast = get("en_ref_explosion")?.full;
  for (const name of ["en_seamine", "en_bombs"]) {
    const r = get(name);
    if (r && blast !== undefined) {
      const loud = name === "en_bombs" ? r.extra.blast : r.full;
      check(`${name}: ${(loud - blast).toFixed(1)} dB against the salmon's blast (-4..+2)`, loud - blast >= -4 && loud - blast <= 2);
    }
  }
  // Far off: at least 8 dB quieter and duller.
  for (const id of ["sawnoff", "rifle", "smg", "elephantgun", "speargun", "pistol"]) {
    const [n, f] = [get(`en_${id}`), get(`en_${id}_far`)];
    if (n && f) check(`en_${id}_far: ${(f.full - n.full).toFixed(1)} dB (≤ -8), duller (its highs against its lows ${f.extra.tilt} dB against ${n.extra.tilt}, ≥ 6 less)`, f.full - n.full <= -8 && f.extra.tilt <= n.extra.tilt - 6);
  }
  for (const [n, f] of [
    ["en_seamine", "en_seamine_far"],
    ["en_bombs", "en_bombs_far"],
  ]) {
    const [a, b] = [get(n), get(f)];
    if (a && b) {
      const [la, lb] = n === "en_bombs" ? [a.extra.blast, b.extra.blast] : [a.full, b.full];
      check(`${f}: ${(lb - la).toFixed(1)} dB (≤ -8)`, lb - la <= -8);
    }
  }
  // The ear over the water: a gun under it is a dull thump, and quieter; the harpoon gun,
  // over the water, the other way round.
  const [under, above] = [get("en_rifle"), get("en_rifle_above")];
  if (under && above) check(`en_rifle_above: duller (highs against lows ${above.extra.tilt} dB against ${under.extra.tilt}, ≥ 10 less) and quieter (${(above.full - under.full).toFixed(1)} dB)`, above.extra.tilt <= under.extra.tilt - 10 && above.full < under.full);
  const [spearUnder, spearAbove] = [get("en_speargun_12"), get("en_speargun_above")];
  if (spearUnder && spearAbove) check(`en_speargun heard from under the water: duller (highs against lows ${spearUnder.extra.tilt} dB against ${spearAbove.extra.tilt} in the air, ≥ 6 less), still heard (${spearUnder.full} LUFS ≥ -40)`, spearUnder.extra.tilt <= spearAbove.extra.tilt - 6 && spearUnder.full >= -40);
  // Voices: the enemies' guns and blades never take more than is left under the reserve and
  // the salmon's own (10); with the charges, never over the cap (26); none left behind.
  for (const r of ENEMY_SCENES.filter((s) => s.kind === "weapon").map((s) => get(s.name)).filter(Boolean)) {
    const vital = /seamine|bombs|stress|ref_/.test(r.name);
    const most = vital ? 26 : 10;
    check(`${r.name}: at most ${most} voices (${r.voices}), none left at the end (${r.voicesEnd}), heard (${r.full} LUFS ≥ -45)`, r.voices <= most && r.voicesEnd === 0 && r.full >= -45);
  }
  // The shoals: many guns are louder than one, but not by much.
  for (const [shoal, one] of [
    ["en_rifle_shoal", "en_rifle_burst"],
    ["en_pistol_pack", "en_pistol_burst"],
  ]) {
    const [a, b] = [get(shoal), get(one)];
    if (a && b) check(`${shoal}: ${(a.extra.loudest - b.full).toFixed(1)} dB over one burst (≤ +5)`, a.extra.loudest - b.full <= 5);
  }
  // The minigun: spun up before its burst, a loop that neither pumps nor comes round, and
  // nothing left turning after.
  const mg = get("en_minigun");
  // (After: in the band of its thump and its motor run down, under 90 Hz, where the river's
  // bubbles do not ring.)
  if (mg) check(`en_minigun: the barrels spin up (+${mg.extra.spinup} dB at 60-400 Hz ≥ 6), silent after (${mg.extra.after} dB under 90 Hz ≤ -90)`, mg.extra.spinup >= 6 && mg.extra.after <= -90);
  const ml = get("en_minigun_long");
  if (ml) check(`en_minigun_long: steady (100 ms loudness swings ${ml.extra.swing} dB ≤ 4), not coming round (${ml.extra.repeats} ≤ 0.6), silent after (${ml.extra.after} ≤ -90)`, ml.extra.swing <= 4 && ml.extra.repeats <= 0.6 && ml.extra.after <= -90);
  const mo = get("en_minigun_aim_only");
  if (mo) check(`en_minigun_aim_only: heard spinning (${mo.extra.spin} LUFS ≥ -40), silent after (${mo.extra.after} ≤ -90)`, mo.extra.spin >= -40 && mo.extra.after <= -90);
  const pump = get("en_pumpgun_pump");
  if (pump) check(`en_pumpgun: the pump's clack-clack after the shot (${pump.extra.clacks} onsets, 2)`, pump.extra.clacks === 2);
  const bombs = get("en_bombs");
  if (bombs) check(`en_bombs: the whistle heard as they fall (+${bombs.extra.whistle} dB at 0.5-1.6 kHz ≥ 10)`, bombs.extra.whistle >= 10);
  const chain = get("en_seamine_chain");
  if (chain) check(`en_seamine_chain: every mine of the field heard going off (${chain.extra.booms} booms of 7 ≥ 6), no louder than one by much (${chain.extra.loudest} vs ${get("en_seamine")?.full})`, chain.extra.booms >= 6 && chain.extra.loudest - (get("en_seamine")?.full ?? chain.extra.loudest) <= 5);
  const stress = get("en_stress");
  if (stress) check(`en_stress: the salmon's shotgun heard every time among the guns and blades (${stress.extra.own}; under a blast ${stress.extra.ownBlast})`, stress.extra.ownAll === 1);
  // Over the bed (its loudest 50 ms, and on a phone): a gun near stands out as the salmon's
  // own do (its shotgun +12 and +6 on a phone, its grenade launcher +8 and +1.5); at 8-10
  // units still over the river's rush; far off it may sink into it.
  for (const [name, lo, phone] of [
    ["en_bed_rifle_near", 6, 2],
    ["en_bed_rifle", 2, -1],
    ["en_bed_rifle_burst", 2, -1],
    ["en_bed_pistol", 2, -1],
    ["en_bed_elephantgun_far", 1, -1],
    ["en_bed_knife", 5, 3],
  ]) {
    const r = get(name);
    if (r) check(`${name}: +${r.dFull} dB over the bed (≥ ${lo}), on a phone +${r.dPhone} (≥ ${phone})`, r.dFull >= lo && r.dPhone >= phone);
  }
  // The wind-ups: subtle, but standing out of the bed in their band (the game's own tick
  // before a strike stands +8).
  for (const [name, lo, hi] of [
    ["en_bed_hammer", 4, 14],
    ["en_bed_safety", 3, 14],
    ["en_bed_whistle", 4, 14],
  ]) {
    const r = get(name);
    if (r) check(`${name}: +${r.extra.cue} dB in its band over the bed (${lo}..${hi})`, r.extra.cue >= lo && r.extra.cue <= hi);
  }
  const far = get("en_bed_rifle_far");
  if (far) check(`en_bed_rifle_far: quiet over the bed (+${far.dFull} dB, ≤ 3)`, far.dFull <= 3);
}
