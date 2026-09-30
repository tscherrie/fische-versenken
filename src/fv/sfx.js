// The sounds of combat, made in code like every other sound of the game and played into its
// groups (sound.buses()), so mute, the pause and the ear crossing the surface apply to them
// too. Weapons fire many times a second, so each kind of sound has a shortest interval and
// there is a cap on how many voices play at once.
//
// The guns are serious and far too big for the fish: a body in the water group (under water
// clear, from above a dull thump) and a dry transient in the ui group above it, so a shot
// keeps its crack of air whatever the ear is in. Held weapons (the flamethrower) are one
// looping voice while held, not one sound per round.
//
// A voice counts against the cap only while it sounds (from its start to its end, however
// far ahead it was scheduled), and the last RESERVE voices are kept for what must not go
// silent: blasts and kills.
//
// The player's own weapons (the laser and its beam, the minigun, the chainsaw, the arc, the
// nodachi, the cannon, the torpedoes, rockets, mines, the harpoon, the anti-tank rifle, a
// capsule taken) are in src/fv/sfx-spieler.js, made from the helpers here. The enemies'
// weapons are heard where the enemies are, with these same makings, in sfx-enemies.js
// (enemyShot, enemyAim, enemyStrike, enemyEntry, enemyBlast).

import { createPlayerSounds } from "./sfx-spieler.js";
import { createEnemySfx } from "./sfx-enemies.js";

const CAP = 26;
const RESERVE = 10;

export function createSfx(sound) {
  const last = new Map();
  // Every scheduled voice's start and end (context seconds), the ended ones pruned as they
  // go; and the voices of running loops.
  const starts = [];
  const ends = [];
  let looping = 0;
  let white = null,
    brown = null;
  // (One curve for each drive: a boom driven harder clips harder.)
  const curves = new Map();

  // How many voices sound at `now`.
  function sounding(now) {
    let n = looping;
    for (let i = ends.length - 1; i >= 0; i--) {
      if (ends[i] <= now) {
        const j = ends.length - 1;
        ends[i] = ends[j];
        starts[i] = starts[j];
        ends.pop();
        starts.pop();
        continue;
      }
      if (starts[i] <= now + 0.02) n++;
    }
    return n;
  }
  // The groups and the context, if this kind may sound now (its interval, the cap). `cost`:
  // how many voices it has sounding at once at most; `vital`: it may use the reserve.
  function ready(kind, interval, cost = 1, vital = false) {
    const buses = sound.buses?.();
    if (!buses) return null;
    const now = buses.context.currentTime;
    if (now - (last.get(kind) ?? -1) < interval || sounding(now) + cost > CAP - (vital ? 0 : RESERVE)) return null;
    last.set(kind, now);
    return buses;
  }
  function whiteBuffer(c) {
    if (white && white.sampleRate === c.sampleRate) return white;
    white = c.createBuffer(1, Math.round(c.sampleRate * 1), c.sampleRate);
    const data = white.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return white;
  }
  // Brown noise (the roar of a jet of fire), two seconds, looped without a seam.
  function brownBuffer(c) {
    if (brown && brown.sampleRate === c.sampleRate) return brown;
    const n = Math.round(c.sampleRate * 2);
    const fade = Math.round(n * 0.1);
    // (The walk made a tenth longer than the loop, and the loop taken from after that first
    // tenth: its last tenth fades into the walk just before its start, so its end runs on
    // into its start as the walk itself would, without a click.)
    const walk = new Float32Array(n + fade);
    let v = 0;
    for (let i = 0; i < n + fade; i++) {
      v = (v + 0.02 * (Math.random() * 2 - 1)) * 0.998;
      walk[i] = v;
    }
    brown = c.createBuffer(1, n, c.sampleRate);
    const data = brown.getChannelData(0);
    for (let i = 0; i < n; i++) data[i] = walk[fade + i];
    for (let i = 0; i < fade; i++) {
      const t = i / fade;
      data[n - fade + i] = walk[n + i] * (1 - t) + walk[i] * t;
    }
    let peak = 0;
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(data[i]));
    for (let i = 0; i < n; i++) data[i] /= peak || 1;
    return brown;
  }
  // A soft clip, for booms driven hard.
  function saturate(c, drive = 3) {
    let curve = curves.get(drive);
    if (!curve) {
      curve = new Float32Array(1024);
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        curve[i] = Math.tanh(x * drive) / Math.tanh(drive);
      }
      curves.set(drive, curve);
    }
    const shaper = c.createWaveShaper();
    shaper.curve = curve;
    return shaper;
  }
  function voice(node, seconds, at) {
    const t = at ?? node.context.currentTime;
    starts.push(t);
    ends.push(t + seconds + 0.05);
    node.stop(t + seconds + 0.05);
  }
  // A gain that rises fast and dies away: the shape of every short sound here.
  function envelope(c, peak, attack, decay, at = c.currentTime) {
    const gain = c.createGain();
    // (Silent until it begins: before its first event a gain holds its own value.)
    gain.gain.value = 0.0001;
    gain.gain.setValueAtTime(0.0001, at);
    gain.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), at + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
    return gain;
  }
  function filter(c, type, frequency, Q = 0.7) {
    const f = c.createBiquadFilter();
    f.type = type;
    f.frequency.value = frequency;
    f.Q.value = Q;
    return f;
  }
  // A burst of noise through a filter: `at` seconds from now.
  function noise(c, out, { type = "bandpass", frequency = 1000, Q = 1, to = null, peak = 0.2, attack = 0.002, decay = 0.1, at = 0 } = {}) {
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = whiteBuffer(c);
    // (Looped: a noise longer than what is left of the buffer after its random start goes on.)
    src.loop = true;
    const f = filter(c, type, frequency, Q);
    if (to) {
      f.frequency.setValueAtTime(frequency, t);
      f.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    }
    src.connect(f).connect(envelope(c, peak, attack, decay, t)).connect(out);
    src.start(t, Math.random() * 0.5);
    voice(src, attack + decay, t);
  }
  // A tone sweeping from `from` to `to` Hz.
  function tone(c, out, { type = "sine", from = 100, to = null, peak = 0.3, attack = 0.004, decay = 0.2, sweep = null, at = 0, drive = 0 } = {}) {
    const t = c.currentTime + at;
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + (sweep ?? attack + decay));
    let node = osc;
    if (drive) node = node.connect(saturate(c, drive));
    node.connect(envelope(c, peak, attack, decay, t)).connect(out);
    osc.start(t);
    voice(osc, attack + decay, t);
  }
  // A small metallic click (mechanisms): a tick of noise high up and a short ring.
  function click(c, out, { at = 0, frequency = 3200, peak = 0.12, ring = 0 } = {}) {
    noise(c, out, { type: "bandpass", frequency, Q: 3, peak, decay: 0.012, at });
    if (ring) tone(c, out, { from: ring, peak: peak * 0.4, decay: 0.05, at });
  }
  // A dry layer: the ui group runs five times as loud, straight to the master.
  const dry = (buses, level) => {
    const g = buses.context.createGain();
    g.gain.value = level / 5;
    g.connect(buses.ui);
    return g;
  };

  // ---- Loops (held weapons): one per kind, started and kept while held, then released.
  const loops = new Map();
  let lastTouch = 0;
  function stopLoop(kind, release = 0.12) {
    const l = loops.get(kind);
    if (!l) return;
    loops.delete(kind);
    looping -= l.voices ?? 0;
    const t = l.context.currentTime;
    l.gain.gain.cancelScheduledValues(t);
    l.gain.gain.setValueAtTime(Math.max(0.0001, l.gain.gain.value), t);
    l.gain.gain.exponentialRampToValueAtTime(0.0001, t + release);
    for (const s of l.sources) s.stop(t + release + 0.05);
  }

  // A held weapon's voices, counted while it is held (`n` more, or fewer when let go).
  const hold = (n) => (looping += n);
  // The player's weapons (the laser among them) and the enemies', made from the same helpers
  // and counted against the same cap.
  const { tick, ...weapons } = createPlayerSounds({ sound, ready, sounding, noise, tone, click, dry, envelope, filter, voice, CAP, RESERVE, hold });
  const enemies = createEnemySfx({ sound, CAP, RESERVE, sounding, voice, noise, tone, click, filter, saturate, whiteBuffer, hold });

  return {
    ...enemies,
    ...weapons,
    // The laser locks: a relay clack, a steam-vent hiss, a small fan spinning up.
    overheat(id = "piu") {
      const buses = ready("overheat", 0.6, 5);
      if (!buses) return;
      const c = buses.context;
      click(c, buses.water, { frequency: 1800, peak: 0.25, ring: 320 });
      click(c, buses.water, { frequency: 2400, peak: 0.18, at: 0.018 });
      noise(c, buses.water, { type: "highpass", frequency: 2600, peak: 0.12, attack: 0.02, decay: 0.55, at: 0.03 });
      noise(c, buses.water, { type: "bandpass", frequency: 300, to: 1400, Q: 4, peak: 0.035, attack: 0.4, decay: 1.2, at: 0.1 });
    },
    // Cooled down: a tick, it is live again.
    unlocked(id = "piu") {
      const buses = ready("unlocked", 0.3, 2);
      if (!buses) return;
      click(buses.context, buses.water, { frequency: 4200, peak: 0.1, ring: 1900 });
    },

    // ---- Doppelflinte: a deep BOOM far too big for a 4 cm fish -- a noise burst under a
    // 180 Hz lowpass, a 60 Hz body thump driven into clipping, a dry crack in the air layer,
    // and the water's "whump" after it.
    flinte(size = 0.4) {
      const buses = ready("flinte", 0.08, 5);
      if (!buses) return;
      const c = buses.context;
      const big = Math.min(1.4, 0.9 + size * 0.3);
      noise(c, buses.water, { type: "lowpass", frequency: 180 * big, Q: 0.9, peak: 1.1, attack: 0.003, decay: 0.38 });
      tone(c, buses.water, { from: 95, to: 42, peak: 0.95, attack: 0.003, decay: 0.34, sweep: 0.22, drive: 3 });
      noise(c, dry(buses, 0.5), { type: "highpass", frequency: 1400, peak: 1, attack: 0.001, decay: 0.035 });
      noise(c, dry(buses, 0.35), { type: "bandpass", frequency: 700, Q: 0.8, peak: 1, attack: 0.001, decay: 0.09 });
      noise(c, buses.water, { type: "bandpass", frequency: 260, to: 120, Q: 1.2, peak: 0.35, attack: 0.03, decay: 0.6, at: 0.02 });
    },
    // ---- Revolver-Granatwerfer: a hollow "thoonk" (sine 180 -> 90 Hz, a 400 Hz tube
    // resonance, a puff) and the cylinder's ratchet click.
    granate(size = 0.5) {
      const buses = ready("granate", 0.1, 6);
      if (!buses) return;
      const c = buses.context;
      tone(c, buses.water, { from: 180, to: 88, peak: 0.8, attack: 0.003, decay: 0.12, sweep: 0.06, drive: 2 });
      noise(c, buses.water, { type: "bandpass", frequency: 400, Q: 9, peak: 0.6, attack: 0.002, decay: 0.09 });
      noise(c, buses.water, { type: "lowpass", frequency: 900, peak: 0.3, attack: 0.004, decay: 0.08 });
      noise(c, dry(buses, 0.25), { type: "bandpass", frequency: 1100, Q: 1, peak: 1, decay: 0.03 });
      click(c, buses.water, { frequency: 2600, peak: 0.12, at: 0.14, ring: 1300 });
    },
    // A grenade off a stone ("tock") or the gravel (duller).
    bounce(what = "stone") {
      const buses = ready("bounce", 0.05, 2);
      if (!buses) return;
      const c = buses.context;
      if (what === "stone") {
        tone(c, buses.water, { from: 900, to: 700, peak: 0.25, decay: 0.03 });
        noise(c, buses.water, { type: "bandpass", frequency: 1300, Q: 3, peak: 0.2, decay: 0.03 });
      } else {
        noise(c, buses.water, { type: "lowpass", frequency: 700, peak: 0.2, decay: 0.06 });
        tone(c, buses.water, { from: 300, to: 200, peak: 0.15, decay: 0.05 });
      }
    },
    // A blast: a sharp crack, a 40-50 Hz sine driven hard and dying over 0.8 s, the rush of
    // the water, and a patter of gravel after. Quieter with distance (in body lengths).
    explosion(size = 1, distance = 4) {
      const buses = ready("explosion", 0.06, 9, true);
      if (!buses) return;
      const c = buses.context;
      const near = Math.min(1, 6 / (4 + Math.max(0, distance)));
      noise(c, dry(buses, 0.6 * near), { type: "highpass", frequency: 900, peak: 1, attack: 0.001, decay: 0.05 });
      tone(c, buses.water, { from: 58, to: 36, peak: 1.2 * near, attack: 0.004, decay: 0.85, sweep: 0.5, drive: 4 });
      noise(c, buses.water, { type: "lowpass", frequency: 420, peak: 0.9 * near, attack: 0.004, decay: 0.7 });
      noise(c, buses.water, { type: "bandpass", frequency: 700, to: 1800, Q: 1.5, peak: 0.18 * near, attack: 0.08, decay: 0.9, at: 0.05 });
      for (let i = 0; i < 5; i++) click(c, buses.water, { frequency: 1800 + Math.random() * 2400, peak: 0.05 * near, at: 0.25 + Math.random() * 0.5 });
    },
    // A magazine reloads over `seconds`: the shotgun breaks open, two hulls tinkle away, it
    // snaps shut; the grenade launcher's cylinder swings out, six shells go in, it clacks
    // home.
    reload(id, seconds = 1) {
      const buses = ready(`reload-${id}`, 0.3, 3);
      if (!buses) return;
      const c = buses.context;
      if (id === "flinte") {
        click(c, buses.water, { frequency: 1500, peak: 0.28, ring: 420, at: 0.05 });
        tone(c, buses.water, { from: 4200, peak: 0.05, decay: 0.25, at: 0.22 });
        tone(c, buses.water, { from: 3700, peak: 0.04, decay: 0.25, at: 0.34 });
        click(c, buses.water, { frequency: 2400, peak: 0.12, at: seconds * 0.6 });
        click(c, buses.water, { frequency: 1300, peak: 0.32, ring: 520, at: seconds - 0.06 });
      } else if (id === "granate") {
        click(c, buses.water, { frequency: 1200, peak: 0.3, ring: 380, at: 0.05 });
        for (let i = 0; i < 6; i++) click(c, buses.water, { frequency: 2000 + Math.random() * 900, peak: 0.1, ring: 900 + Math.random() * 400, at: 0.35 + (i * (seconds - 0.8)) / 6 });
        click(c, buses.water, { frequency: 1100, peak: 0.34, ring: 450, at: seconds - 0.08 });
      }
    },

    // ---- Katana: the draw (a scrape and a "shiing": noise swept 3 -> 5 kHz and a 2.7 kHz
    // ring), the swing (a low whoosh), the cut (a wet "shlk"), the Konter (a clang that
    // falls in pitch, a moment slowed), the dash cut (a long rising "shhhing"), the click
    // of the sheathing.
    katanaDraw() {
      const buses = ready("katanaDraw", 0.2, 3);
      if (!buses) return;
      const c = buses.context;
      noise(c, buses.water, { type: "bandpass", frequency: 3000, to: 5200, Q: 4, peak: 0.3, attack: 0.02, decay: 0.08 });
      tone(c, buses.water, { from: 2700, to: 2650, peak: 0.1, attack: 0.004, decay: 0.45 });
      tone(c, buses.water, { from: 5400, peak: 0.02, attack: 0.004, decay: 0.3 });
    },
    katanaSwing(side = 1) {
      const buses = ready("katanaSwing", 0.08, 1);
      if (!buses) return;
      const c = buses.context;
      noise(c, buses.water, { type: "bandpass", frequency: side > 0 ? 420 : 500, to: 1500, Q: 1.2, peak: 0.55, attack: 0.05, decay: 0.12 });
    },
    katanaHit(size = 1) {
      const buses = ready("katanaHit", 0.04, 2);
      if (!buses) return;
      const c = buses.context;
      tone(c, buses.water, { from: 140, to: 90, peak: 0.35, decay: 0.07 });
      noise(c, buses.water, { type: "bandpass", frequency: 1600, to: 700, Q: 1.2, peak: 0.3, attack: 0.002, decay: 0.06 });
    },
    konter() {
      const buses = ready("konter", 0.2, 5);
      if (!buses) return;
      const c = buses.context;
      for (const [f, p] of [
        [520, 0.18],
        [1243, 0.12],
        [2110, 0.08],
        [3350, 0.05],
      ])
        tone(c, buses.water, { from: f, to: f * 0.93, peak: p, attack: 0.002, decay: 0.9, sweep: 0.5 });
      noise(c, dry(buses, 0.3), { type: "highpass", frequency: 2500, peak: 1, decay: 0.03 });
    },
    katanaDash() {
      const buses = ready("katanaDash", 0.3, 2);
      if (!buses) return;
      const c = buses.context;
      noise(c, buses.water, { type: "bandpass", frequency: 1800, to: 6000, Q: 2.5, peak: 0.35, attack: 0.25, decay: 0.12 });
      tone(c, buses.water, { from: 2900, to: 3100, peak: 0.05, attack: 0.2, decay: 0.3 });
    },
    sheathe() {
      const buses = ready("sheathe", 0.3, 3);
      if (!buses) return;
      const c = buses.context;
      noise(c, buses.water, { type: "bandpass", frequency: 2600, to: 1800, Q: 3, peak: 0.06, attack: 0.05, decay: 0.12 });
      click(c, buses.water, { frequency: 3600, peak: 0.22, at: 0.17, ring: 2100 });
    },

    // ---- Flammenwerfer: called every step with whether the jet is on. Ignition (a click, a
    // hiss, a "fwump"), then one looping roar (brown noise under a lowpass with an 8 Hz
    // flutter) with the water boiling round it (band-passed noise) and crackles; released,
    // a gas hiss and the valve's click.
    flame(on, heat = 0, size = 1) {
      const buses = sound.buses?.();
      lastTouch = performance.now();
      const running = loops.get("flame");
      if (!on || !buses) {
        if (running) {
          stopLoop("flame", 0.15);
          const b = ready("flameOff", 0.1, 2);
          if (b) {
            noise(b.context, b.water, { type: "highpass", frequency: 3000, peak: 0.08, attack: 0.01, decay: 0.3 });
            click(b.context, b.water, { frequency: 2200, peak: 0.1, at: 0.1 });
          }
        }
        return;
      }
      const c = buses.context;
      if (!running) {
        if (sounding(c.currentTime) + 6 > CAP - RESERVE) return;
        // Ignition.
        click(c, buses.water, { frequency: 3000, peak: 0.12 });
        noise(c, buses.water, { type: "highpass", frequency: 2000, peak: 0.08, decay: 0.12 });
        tone(c, buses.water, { from: 90, to: 50, peak: 0.6, attack: 0.02, decay: 0.3, at: 0.05, drive: 2 });
        const t = c.currentTime;
        const gain = c.createGain();
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(1, t + 0.12);
        gain.connect(buses.water);
        // The roar, fluttering.
        const roar = c.createBufferSource();
        roar.buffer = brownBuffer(c);
        roar.loop = true;
        const roarGain = c.createGain();
        roarGain.gain.value = 0.16;
        const lfo = c.createOscillator();
        lfo.frequency.value = 8;
        const depth = c.createGain();
        depth.gain.value = 0.055;
        lfo.connect(depth).connect(roarGain.gain);
        const low = filter(c, "lowpass", 700 + 300 / Math.max(0.5, size), 0.8);
        roar.connect(low).connect(roarGain).connect(gain);
        // The hiss of the gas at the nozzle.
        const hiss = c.createBufferSource();
        hiss.buffer = whiteBuffer(c);
        hiss.loop = true;
        const hissBand = filter(c, "bandpass", 2400, 0.9);
        const hissGain = c.createGain();
        hissGain.gain.value = 0.03;
        hiss.connect(hissBand).connect(hissGain).connect(gain);
        // The water boiling round the flame.
        const boil = c.createBufferSource();
        boil.buffer = whiteBuffer(c);
        boil.loop = true;
        const boilBand = filter(c, "bandpass", 650, 1.6);
        const boilGain = c.createGain();
        boilGain.gain.value = 0.08;
        const wobble = c.createOscillator();
        wobble.frequency.value = 13;
        const wobbleDepth = c.createGain();
        wobbleDepth.gain.value = 250;
        wobble.connect(wobbleDepth).connect(boilBand.frequency);
        boil.connect(boilBand).connect(boilGain).connect(gain);
        for (const s of [roar, hiss, boil, lfo, wobble]) s.start(t);
        // (Three voices that sound; the two slow oscillators only move them.)
        looping += 3;
        loops.set("flame", { context: c, gain, sources: [roar, hiss, boil, lfo, wobble], voices: 3 });
      }
      // Crackles now and then, and a sputter as the fuel runs low.
      if (Math.random() < 0.22) {
        const b = ready("crackle", 0.03, 1);
        if (b) noise(c, b.water, { type: "bandpass", frequency: 1500 + Math.random() * 3000, Q: 4, peak: 0.1 + Math.random() * 0.12, decay: 0.01 + Math.random() * 0.02 });
      }
      if (heat > 0.85 && Math.random() < 0.1) {
        const b = ready("sputter", 0.08, 1);
        if (b) noise(c, b.water, { type: "lowpass", frequency: 500, peak: 0.3, decay: 0.05 });
      }
    },
    // Out of fuel: the jet dies in a sputter.
    flameEmpty() {
      const buses = ready("flameEmpty", 0.5, 4);
      if (!buses) return;
      const c = buses.context;
      for (let i = 0; i < 4; i++) noise(c, buses.water, { type: "lowpass", frequency: 600, peak: 0.35 - i * 0.07, decay: 0.05, at: i * 0.09 + Math.random() * 0.03 });
    },
    // Each frame: a loop left running with nothing to keep it (the game stopped stepping,
    // the tab hidden) is let go.
    update() {
      enemies.update();
      if (loops.size && performance.now() - lastTouch > 200) for (const kind of [...loops.keys()]) stopLoop(kind, 0.2);
      tick();
    },

    // ---- Hits and the rest.
    // A shot landing on a body: the laser fizzes (the pulse boils the water), a pellet
    // lands with a wet thwack, anything else a short, dull tick.
    hit(weapon = "piu") {
      const buses = ready(`hit-${weapon === "piu" ? "laser" : weapon}`, weapon === "flinte" ? 0.02 : 0.03, 2);
      if (!buses) return;
      const c = buses.context;
      if (weapon === "piu") {
        noise(c, buses.water, { type: "highpass", frequency: 3800, peak: 0.12, attack: 0.002, decay: 0.08 });
        noise(c, buses.water, { type: "bandpass", frequency: 1100, Q: 2.5, peak: 0.12, decay: 0.04 });
      } else if (weapon === "flinte") {
        noise(c, buses.water, { type: "bandpass", frequency: 600 + Math.random() * 300, Q: 1.5, peak: 0.25, decay: 0.05 });
        tone(c, buses.water, { from: 160, to: 90, peak: 0.12, decay: 0.05 });
      } else {
        noise(c, buses.water, { type: "bandpass", frequency: 900 + Math.random() * 400, Q: 2.5, peak: 0.22, decay: 0.05 });
      }
    },
    // A shot into the bed or a stone: a gritty puff.
    ground() {
      const buses = ready("ground", 0.06);
      if (!buses) return;
      noise(buses.context, buses.water, { type: "lowpass", frequency: 1400, peak: 0.08, attack: 0.003, decay: 0.09 });
    },
    // Sunk: a deep thump falling away, and a rush of bubbles.
    sunk(size = 1) {
      const buses = ready("sunk", 0.08, 2, true);
      if (!buses) return;
      const c = buses.context;
      const base = 150 / Math.sqrt(Math.max(0.5, size));
      tone(c, buses.water, { from: base, to: base * 0.3, peak: 0.5, attack: 0.01, decay: 0.45, sweep: 0.45 });
      noise(c, buses.water, { type: "bandpass", frequency: 500, to: 1800, Q: 4, peak: 0.12, attack: 0.05, decay: 0.4 });
    },
    get playing() {
      const buses = sound.buses?.();
      return buses ? sounding(buses.context.currentTime) : 0;
    },
  };
}
