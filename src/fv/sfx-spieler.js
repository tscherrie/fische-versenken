// The sounds of the player's weapons, called by src/fv/weapons.js (each only when it is
// here) and made as the rest of the combat sound is: in code, into the game's groups, under
// the same cap on voices, with the helpers src/fv/sfx.js hands over (`kit`).
//
// Serious guns far too big for the fish, heard as if under water: a heavy body in the water
// group (from above only its dull low end) and a dry crack in the ui group on top, so a
// shot keeps its bite whatever the ear is in. What fires many times a second is not built
// from oscillators and filters shot by shot: its textures (the laser's boiling hiss, the
// arc's crackle, the minigun's rounds) are made ahead as samples, a few takes of each, and
// played back a little faster or slower and louder or softer every time, so that no two
// shots are the same. Held weapons (the beam, the minigun's motor and its stream of rounds,
// the chainsaw's engine) are one loop each while held, started and let go without a click,
// and let go on their own when nothing keeps them any more (the game stopped stepping).

// Where a fish is between the alevin (0) and the spawner (1), by the log of its length (as
// weapons.js grows its weapons).
const growth = (L) => Math.min(1, Math.max(0, Math.log(Math.max(0.05, L) / 0.22) / Math.log(9 / 0.22)));
const clamp01 = (v) => Math.min(1, Math.max(0, v || 0));
// 1 give or take `amount` (a shot's own pitch and level).
const vary = (amount) => 1 + (Math.random() * 2 - 1) * amount;
const pick = (list) => list[Math.floor(Math.random() * list.length)];
const white = () => Math.random() * 2 - 1;

// ---- Made ahead: plain samples worked out here, turned into buffers once per sample rate.

// A biquad (the cookbook's), run over `x` in place.
function run(x, type, f, Q, rate) {
  const w = (2 * Math.PI * Math.min(f, rate * 0.45)) / rate;
  const cos = Math.cos(w),
    alpha = Math.sin(w) / (2 * Q);
  let b0, b1, b2;
  if (type === "lowpass") (b0 = (1 - cos) / 2), (b1 = 1 - cos), (b2 = (1 - cos) / 2);
  else if (type === "highpass") (b0 = (1 + cos) / 2), (b1 = -(1 + cos)), (b2 = (1 + cos) / 2);
  else (b0 = alpha), (b1 = 0), (b2 = -alpha);
  const a0 = 1 + alpha,
    a1 = (-2 * cos) / a0,
    a2 = (1 - alpha) / a0;
  (b0 /= a0), (b1 /= a0), (b2 /= a0);
  let x1 = 0,
    x2 = 0,
    y1 = 0,
    y2 = 0;
  for (let i = 0; i < x.length; i++) {
    const v = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = x[i];
    y2 = y1;
    y1 = v;
    x[i] = v;
  }
  return x;
}
const noiseOf = (n) => {
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = white();
  return x;
};
function normalize(x, to = 1) {
  let peak = 0;
  for (let i = 0; i < x.length; i++) peak = Math.max(peak, Math.abs(x[i]));
  if (peak > 0) for (let i = 0; i < x.length; i++) x[i] *= to / peak;
  return x;
}
// (Bursts are worked out in one scratch array, not a new one each: there are thousands.)
let scratch = new Float32Array(4096);
// A short burst of noise through a band (a tick, a pop, a snap), added into `x` at sample
// `at`; round the end to the start if `wrap` (a loop).
function burst(x, at, rate, { ms = 1, amp = 1, type = "highpass", f = 2000, Q = 0.8, ring = 4, wrap = false }) {
  const on = Math.max(2, Math.round((ms * rate) / 1000));
  if (scratch.length < on * ring) scratch = new Float32Array(on * ring);
  const b = scratch.subarray(0, on * ring);
  for (let i = 0; i < on; i++) b[i] = white() * (1 - i / on);
  b.fill(0, on);
  run(b, type, f, Q, rate);
  for (let i = 0; i < b.length; i++) {
    let j = at + i;
    if (j >= x.length) {
      if (!wrap) break;
      j %= x.length;
    }
    x[j] += amp * b[i];
  }
}
// Times of a random (Poisson) patter, `density(t)` a second, over `seconds`.
function patter(seconds, density) {
  const out = [];
  let t = 0;
  for (;;) {
    t += -Math.log(1 - Math.random()) / Math.max(1, density(t));
    if (t >= seconds) return out;
    out.push(t);
  }
}

const RECIPES = {
  // The laser's "tchk": a relay's contacts (two ticks a few thousandths apart) and the knock
  // of its body.
  tchk: {
    takes: 8,
    seconds: 0.04,
    make(n, rate) {
      const x = new Float32Array(n);
      burst(x, 0, rate, { ms: 0.8, type: "bandpass", f: 2700 * vary(0.1), Q: 1.4, ring: 6 });
      burst(x, Math.round((0.004 + 0.003 * Math.random()) * rate), rate, { ms: 0.6, amp: 0.6 + 0.3 * Math.random(), type: "bandpass", f: 3700 * vary(0.1), Q: 2, ring: 6 });
      const f = 950 * vary(0.12);
      for (let i = 0; i < n; i++) x[i] += 0.3 * Math.sin((2 * Math.PI * f * i) / rate) * Math.exp(-i / (0.004 * rate));
      return normalize(x);
    },
  },
  // Its "tsss": the water boiling along the bolt -- a hiss swelling up and falling off, with
  // the tiny ticks of steam bubbles collapsing in it.
  tsss: {
    takes: 8,
    seconds: 0.26,
    make(n, rate) {
      const x = noiseOf(n);
      run(x, "bandpass", 3400, 0.9, rate);
      run(x, "bandpass", 3400, 0.9, rate);
      normalize(x);
      const swell = run(run(noiseOf(n), "lowpass", 70, 0.7, rate), "lowpass", 70, 0.7, rate);
      normalize(swell);
      const pops = new Float32Array(n);
      for (const t of patter(n / rate, () => 240)) burst(pops, Math.round(t * rate), rate, { ms: 0.3 + 0.7 * Math.random(), amp: 0.3 + Math.random(), f: 2600 });
      normalize(pops);
      for (let i = 0; i < n; i++) {
        const s = i / rate;
        const env = (s < 0.012 ? s / 0.012 : 1) * Math.exp(-Math.max(0, s - 0.012) / 0.06) * Math.min(1, (n - i) / (0.005 * rate));
        x[i] = env * (x[i] * Math.max(0.15, 1 + 0.7 * swell[i]) + 0.45 * pops[i]);
      }
      return normalize(x);
    },
  },
  // A hot laser's harsher boil: a dense, sharp crackle over a fizz.
  sizzle: {
    takes: 6,
    seconds: 0.22,
    make(n, rate) {
      const x = run(noiseOf(n), "bandpass", 5200, 1.2, rate);
      normalize(x, 0.5);
      for (const t of patter(n / rate, (t) => 900 * Math.exp(-t / 0.12))) burst(x, Math.round(t * rate), rate, { ms: 0.15 + 0.35 * Math.random(), amp: 0.4 + Math.random(), f: 4200 });
      for (let i = 0; i < n; i++) {
        const s = i / rate;
        x[i] *= (s < 0.006 ? s / 0.006 : 1) * Math.exp(-Math.max(0, s - 0.006) / 0.05) * Math.min(1, (n - i) / (0.004 * rate));
      }
      return normalize(x);
    },
  },
  // The steam bubbles ticking in the water the beam boils, as a loop (going round without a
  // seam: a tick near the end runs on into the start).
  pops: {
    takes: 1,
    seconds: 1.37,
    make(n, rate) {
      const x = new Float32Array(n);
      for (const t of patter(n / rate, () => 150)) burst(x, Math.round(t * rate), rate, { ms: 0.3 + 0.8 * Math.random(), amp: 0.3 + Math.random(), f: 2400, wrap: true });
      return normalize(x);
    },
  },
  // The arc's snaps: the first crack, then one more for each fish it jumps to, ten to
  // eighteen thousandths apart and weaker at each (`take`: 5 of each count of jumps, 0-5).
  snaps: {
    takes: 30,
    seconds: 0.14,
    make(n, rate, take) {
      const jumps = Math.floor(take / 5);
      const x = new Float32Array(n);
      burst(x, 0, rate, { ms: 1.4, f: 900, ring: 3 });
      burst(x, 0, rate, { ms: 0.4, amp: 0.6, type: "bandpass", f: 2600 * vary(0.15), Q: 3, ring: 8 });
      let t = 0,
        amp = 0.8;
      for (let j = 0; j < jumps; j++) {
        t += 0.01 + 0.008 * Math.random();
        burst(x, Math.round(t * rate), rate, { ms: 0.5 + 0.6 * Math.random(), amp, f: 1200 + 800 * Math.random(), ring: 3 });
        burst(x, Math.round(t * rate), rate, { ms: 0.3, amp: amp * 0.5, type: "bandpass", f: 2200 + 1400 * Math.random(), Q: 3, ring: 8 });
        amp *= 0.82;
      }
      return normalize(x);
    },
  },
  // The arc's tail: a crackle thinning out, and the electric buzz of the discharge under it
  // (a rough tone whose every period is a little different).
  crackle: {
    takes: 6,
    seconds: 0.45,
    make(n, rate) {
      const x = new Float32Array(n);
      for (const t of patter(n / rate, (t) => 50 + 900 * Math.exp(-t / 0.08))) burst(x, Math.round(t * rate), rate, { ms: 0.2 + 1.0 * Math.random(), amp: (Math.random() < 0.5 ? -1 : 1) * (0.3 + 0.7 * Math.random()) * Math.exp(-t / 0.14), f: 800 });
      let phase = 0,
        f = 120 * vary(0.15);
      for (let i = 0; i < n; i++) {
        phase += f / rate;
        if (phase >= 1) (phase -= 1), (f = 120 * vary(0.12));
        x[i] += 0.35 * (2 * phase - 1) * Math.exp(-i / (0.05 * rate));
      }
      run(x, "lowpass", 6500, 0.7, rate);
      for (let i = 0; i < n; i++) x[i] *= Math.min(1, (n - i) / (0.005 * rate));
      return normalize(x);
    },
  },
  // Twelve of the minigun's rounds (0.4 s at its 30 a second): each a thump dropping in
  // pitch, a chuff of the water and a tick; the next dozen follows on without a seam (a
  // round's tail runs on round the end into the start). `body` is what the water carries,
  // `crack` the dry snap of each for the air layer, from the same takes of timing.
  rounds: {
    takes: 6,
    seconds: 0.4,
    make(n, rate) {
      const body = new Float32Array(n),
        crack = new Float32Array(n);
      for (let k = 0; k < 12; k++) {
        const at = Math.round((k / 30 + (k ? (Math.random() * 2 - 1) * 0.0012 : 0)) * rate);
        const a = 0.75 + 0.35 * Math.random();
        const f = 92 * vary(0.1);
        let phase = 0;
        for (let i = 0; i < 0.06 * rate; i++) {
          const s = i / rate;
          phase += (f * (1 + 0.7 * Math.exp(-s / 0.006))) / rate;
          body[(at + i) % n] += a * Math.sin(2 * Math.PI * phase) * Math.exp(-s / 0.011);
        }
        burst(body, at, rate, { ms: 14, amp: 0.5 * a, type: "bandpass", f: 650 * vary(0.2), Q: 0.9, ring: 2, wrap: true });
        burst(body, at, rate, { ms: 1, amp: 0.35 * a, f: 1500, wrap: true });
        burst(crack, at, rate, { ms: 3.5, amp: a, f: 2000, ring: 2, wrap: true });
      }
      return [normalize(body), normalize(crack)];
    },
  },
};
// Which of the samples each weapon plays (made ahead when it is picked up).
const NEEDS = { piu: ["tchk", "tsss", "sizzle", "pops"], strahl: ["pops"], blitz: ["snaps", "crackle"], minigun: ["rounds"] };

export function createPlayerSounds(kit) {
  const { sound, ready, sounding, noise, tone, click, dry, envelope, filter, voice, CAP, RESERVE } = kit;
  // Each recipe's takes as buffers (each take a buffer per layer), for the rate they were
  // made at.
  const banks = new Map();
  // One more take of a recipe made; whether it has all of them now.
  function more(c, name) {
    let b = banks.get(name);
    if (!b || b.rate !== c.sampleRate) banks.set(name, (b = { rate: c.sampleRate, buffers: [] }));
    const r = RECIPES[name];
    if (b.buffers.length >= r.takes) return true;
    const n = Math.round(r.seconds * c.sampleRate);
    const made = r.make(n, c.sampleRate, b.buffers.length);
    b.buffers.push(
      (Array.isArray(made) ? made : [made]).map((data) => {
        const buffer = c.createBuffer(1, n, c.sampleRate);
        buffer.getChannelData(0).set(data);
        return buffer;
      }),
    );
    return b.buffers.length >= r.takes;
  }
  // All the takes of a recipe (what is not made yet made now).
  function bank(c, name) {
    while (!more(c, name));
    return banks.get(name).buffers;
  }
  // (Made a take a frame while nothing asks for them yet -- a few thousandths of a second
  // each: those of the laser the game starts with, and those of a weapon when it is picked
  // up.)
  const toMake = new Set(NEEDS.piu);
  // A noise three seconds long for the loops (the ear hears a loop of one second come
  // round in a steady hiss).
  let long = null;
  function longNoise(c) {
    if (long && long.sampleRate === c.sampleRate) return long;
    long = c.createBuffer(1, Math.round(c.sampleRate * 3.1), c.sampleRate);
    long.getChannelData(0).set(noiseOf(long.length));
    return long;
  }
  // A take played once: `at` seconds from now, a little faster or slower (`rate`), at `peak`,
  // cut off with a short fade `cut` seconds in if given; into `outs` (a node, or several).
  function play(c, buffer, outs, { at = 0, rate = 1, peak = 1, cut = 0 } = {}) {
    const t = c.currentTime + at;
    const src = c.createBufferSource();
    src.buffer = buffer;
    src.playbackRate.value = rate;
    const gain = c.createGain();
    gain.gain.value = peak;
    if (cut) {
      gain.gain.setValueAtTime(peak, t + cut * 0.5);
      gain.gain.exponentialRampToValueAtTime(0.0005, t + cut);
    }
    src.connect(gain);
    for (const out of [].concat(outs)) gain.connect(out);
    src.start(t);
    voice(src, cut || buffer.duration / rate, t);
  }
  // A looping source of noise at `rate` (seconds at a time: the long noise).
  function hiss(c, rate = 1) {
    const src = c.createBufferSource();
    src.buffer = longNoise(c);
    src.loop = true;
    src.playbackRate.value = rate;
    return src;
  }
  // A slow random wander (swinging about a unit either way, about `hz` at its fastest), for what should
  // never hold still or come round the same: the long noise played slowly (`rate`) under a
  // lowpass.
  function wander(c, hz, rate) {
    const src = hiss(c, rate);
    const f = filter(c, "lowpass", hz, 0.7);
    const g = c.createGain();
    // (What is left of the noise under the lowpass -- its share of the band the slowed noise
    // spans -- brought up to a root mean square of about a half.)
    g.gain.value = 0.5 / Math.sqrt(((1 / 3) * 1.1 * hz) / ((rate * c.sampleRate) / 2));
    src.connect(f).connect(g);
    return { src, out: g };
  }

  // ---- Loops: one per kind while held, touched every step, let go when not touched.
  const held = new Map();
  function begin(kind, c, voices, into) {
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.connect(into);
    const l = { kind, context: c, gain, sources: [], voices, touched: c.currentTime };
    held.set(kind, l);
    kit.holdVoices(voices);
    return l;
  }
  function start(l, ...sources) {
    const t = l.context.currentTime;
    for (const s of sources) {
      s.start(t);
      l.sources.push(s);
    }
  }
  // Let go: faded out over `seconds` (from wherever it is: no step), then stopped.
  function release(kind, seconds = 0.12) {
    const l = held.get(kind);
    if (!l) return;
    held.delete(kind);
    kit.holdVoices(-l.voices);
    const t = l.context.currentTime;
    for (const g of [l.gain, ...(l.also ?? [])]) {
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(Math.max(0.0001, g.gain.value), t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
    }
    for (const s of l.sources)
      try {
        s.stop(t + seconds + 0.05);
      } catch {}
  }
  // Brought to `value` smoothly: two thirds of the way in `tc` seconds, nearly all of it in
  // four times that.
  const glide = (param, value, t, tc = 0.03) => param.setTargetAtTime(value, t, tc);

  // ---- The beam: a low electric hum, deeper on a bigger fish, with the water boiling
  // round it; heat raises the hum a little and makes the boil harsher.
  function beam(on, heat, L) {
    const buses = sound.buses?.();
    const running = held.get("beam");
    if (!on || !buses) {
      if (running) release("beam", 0.07);
      return;
    }
    const c = buses.context;
    const t = c.currentTime;
    const g = growth(L);
    const h = clamp01(heat);
    const f = (78 - 30 * g) * (1 + 0.08 * h);
    let l = running;
    if (!l) {
      if (sounding(t) + 2 > CAP - RESERVE) return;
      l = begin("beam", c, 2, buses.water);
      glide(l.gain.gain, 0.2, t, 0.012);
      // The hum: a buzz (a sawtooth) under a lowpass that flickers at random, and its
      // fundamental again as a sine for weight.
      const buzz = c.createOscillator();
      buzz.type = "sawtooth";
      buzz.frequency.value = f;
      const low = filter(c, "lowpass", 420, 2.2);
      const flicker = wander(c, 9, 0.21);
      const flickerDepth = c.createGain();
      flickerDepth.gain.value = 90;
      flicker.out.connect(flickerDepth).connect(low.frequency);
      const buzzGain = c.createGain();
      buzzGain.gain.value = 0.2 + 0.08 * g;
      buzz.connect(low).connect(buzzGain).connect(l.gain);
      const sub = c.createOscillator();
      sub.frequency.value = f;
      const subGain = c.createGain();
      subGain.gain.value = 0.3 + 0.2 * g;
      sub.connect(subGain).connect(l.gain);
      // The boil, brighter and louder as it heats: a hiss swelling and falling at random,
      // and steam bubbles ticking in it (their loop and the hiss's of different lengths, so
      // the two never come round together).
      const boil = hiss(c, 0.97 - 0.2 * g);
      const boilBand = filter(c, "bandpass", 3000 * (1 - 0.2 * g), 0.7);
      const swell = c.createGain();
      const surge = wander(c, 30, 0.23);
      const surgeDepth = c.createGain();
      surgeDepth.gain.value = 0.8;
      surge.out.connect(surgeDepth).connect(swell.gain);
      boil.connect(boilBand).connect(swell);
      const pops = c.createBufferSource();
      pops.buffer = bank(c, "pops")[0][0];
      pops.loop = true;
      pops.playbackRate.value = 1 - 0.25 * g;
      const popGain = c.createGain();
      popGain.gain.value = 0.5;
      pops.connect(popGain);
      const shelf = c.createBiquadFilter();
      shelf.type = "highshelf";
      shelf.frequency.value = 3500;
      const boilGain = c.createGain();
      swell.connect(shelf);
      popGain.connect(shelf);
      shelf.connect(boilGain).connect(l.gain);
      start(l, buzz, sub, boil, flicker.src, surge.src, pops);
      Object.assign(l, { buzz, sub, low, shelf, boilGain });
      // (Its first setting at once, not glided up from nothing.)
      l.fresh = true;
    }
    l.touched = t;
    const tc = l.fresh ? 0.001 : 0.08;
    l.fresh = false;
    glide(l.buzz.frequency, f, t, tc);
    glide(l.sub.frequency, f, t, tc);
    glide(l.low.frequency, 380 + 260 * h, t, tc);
    glide(l.shelf.gain, 8 * h, t, tc);
    glide(l.boilGain.gain, 0.3 + 0.35 * h, t, tc);
  }

  // ---- The minigun's motor: an electric whine and the whirr of the barrels, both rising
  // with the spin; hot barrels hiss in the water. Its rounds: a stream of them, a dozen at a
  // time made ahead, one dozen after another while it fires.
  function motor(id, spin, heat, L, firing) {
    const buses = sound.buses?.();
    const kind = `motor-${id}`;
    const stream = `rounds-${id}`;
    let l = held.get(kind);
    if (!buses || (spin <= 0.001 && !firing)) {
      if (l) release(kind, 0.1);
      if (held.has(stream)) release(stream, 0.03);
      return;
    }
    const c = buses.context;
    const t = c.currentTime;
    const s = clamp01(spin);
    const h = clamp01(heat);
    if (!l) {
      if (sounding(t) + 2 > CAP - RESERVE) return;
      l = begin(kind, c, 2, buses.water);
      const whine = c.createOscillator();
      whine.type = "triangle";
      const gear = c.createOscillator();
      const gearGain = c.createGain();
      gearGain.gain.value = 0.05;
      const whineGain = c.createGain();
      whineGain.gain.value = 0.16;
      const whineLow = filter(c, "lowpass", 1400, 0.7);
      whine.connect(whineLow).connect(whineGain).connect(l.gain);
      gear.connect(gearGain).connect(whineLow);
      // The barrels going round: a band of churned water pulsing as each barrel passes.
      const churn = hiss(c, 0.93);
      const churnBand = filter(c, "bandpass", 300, 2.2);
      const churnGain = c.createGain();
      churnGain.gain.value = 0.5;
      const pass = c.createOscillator();
      const passDepth = c.createGain();
      passDepth.gain.value = 0.35;
      pass.connect(passDepth).connect(churnGain.gain);
      churn.connect(churnBand).connect(churnGain).connect(l.gain);
      // Steam off hot barrels.
      const steamBand = filter(c, "highpass", 2600, 0.7);
      const steamGain = c.createGain();
      steamGain.gain.value = 0;
      churn.connect(steamBand).connect(steamGain).connect(l.gain);
      start(l, whine, gear, churn, pass);
      Object.assign(l, { whine, gear, churnBand, pass, steamGain, fresh: true });
    }
    l.touched = t;
    const tc = l.fresh ? 0.001 : 0.04;
    l.fresh = false;
    // (The whine a little deeper on a bigger fish; its gear a fourth harmonic, never
    // beating against it.)
    const f = (40 + 150 * Math.pow(s, 0.9)) * (1.1 - 0.2 * growth(L));
    glide(l.whine.frequency, f, t, tc);
    glide(l.gear.frequency, 4 * f, t, tc);
    glide(l.churnBand.frequency, 220 + 700 * s, t, tc);
    glide(l.pass.frequency, Math.max(0.5, 30 * s), t, tc);
    glide(l.gain.gain, 0.0001 + 0.35 * Math.pow(s, 0.8), t, 0.04);
    glide(l.steamGain.gain, 0.05 * h * h, t, 0.2);
    // The rounds.
    let r = held.get(stream);
    if (!firing) {
      if (r) release(stream, 0.03);
      return;
    }
    if (!r) {
      if (sounding(t) + 2 > CAP - RESERVE) return;
      r = begin(stream, c, 2, buses.water);
      r.gain.gain.setValueAtTime(0.0001, t);
      r.gain.gain.exponentialRampToValueAtTime(0.32, t + 0.004);
      r.air = dry(buses, 1);
      r.air.gain.setValueAtTime(0.0001, t);
      r.air.gain.exponentialRampToValueAtTime(0.07 / 5, t + 0.004);
      r.also = [r.air];
      r.next = t + 0.004;
    }
    r.touched = t;
    feed(r, c);
  }
  // Keeps a stream of rounds going: the next dozen scheduled before the last runs out.
  function feed(r, c) {
    const now = c.currentTime;
    if (r.next < now) r.next = now + 0.004;
    r.sources = r.sources.filter((s) => s.ends > now);
    while (r.next < now + 0.12) {
      const [body, crack] = pick(bank(c, "rounds"));
      const rate = vary(0.03);
      for (const [buffer, out] of [
        [body, r.gain],
        [crack, r.air],
      ]) {
        const src = c.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = rate;
        src.connect(out);
        src.start(r.next);
        src.ends = r.next + buffer.duration / rate;
        r.sources.push(src);
      }
      r.next += body.duration / rate;
    }
  }

  // ---- The chainsaw: a two-stroke engine ticking over while it is carried, revving with
  // the trigger, and bogging down and grinding when the chain bites.
  function saw(id, spin, heat, L) {
    const buses = sound.buses?.();
    const kind = `saw-${id}`;
    let l = held.get(kind);
    if (!buses) {
      if (l) release(kind, 0.15);
      return;
    }
    const c = buses.context;
    const t = c.currentTime;
    const s = clamp01(spin);
    if (!l) {
      if (sounding(t) + 3 > CAP - RESERVE) return;
      l = begin(kind, c, 3, buses.water);
      l.born = t;
      l.idleSince = t;
      // The firing: a sawtooth sharpened into a pop a revolution, through the exhaust's
      // resonance and a muffle that opens with the revs.
      const engine = c.createOscillator();
      engine.type = "sawtooth";
      const pop = c.createWaveShaper();
      const curve = new Float32Array(512);
      for (let i = 0; i < 512; i++) curve[i] = Math.pow(i / 511, 7) * 2 - 0.25;
      pop.curve = curve;
      const pipe = c.createBiquadFilter();
      pipe.type = "peaking";
      pipe.frequency.value = 260;
      pipe.Q.value = 1.4;
      pipe.gain.value = 9;
      const muffle = filter(c, "lowpass", 900, 0.8);
      const firing = c.createGain();
      firing.gain.value = 0.5;
      engine.connect(pop).connect(pipe).connect(muffle).connect(firing).connect(l.gain);
      // No two strokes alike: the level and the pace wander at random (deep at idle, where
      // an engine stumbles, less at full revs).
      const stumble = wander(c, 40, 0.37);
      const stumbleDepth = c.createGain();
      stumble.out.connect(stumbleDepth).connect(firing.gain);
      const pace = wander(c, 6, 0.29);
      const paceDepth = c.createGain();
      pace.out.connect(paceDepth).connect(engine.frequency);
      // The exhaust's rasp: noise let through at each pop.
      const air = hiss(c, 1.07);
      const raspBand = filter(c, "bandpass", 1500, 0.8);
      const rasp = c.createGain();
      rasp.gain.value = 0;
      const raspDepth = c.createGain();
      pop.connect(raspDepth).connect(rasp.gain);
      air.connect(raspBand).connect(rasp).connect(l.gain);
      // The chain racing round the bar.
      const chainBand = filter(c, "bandpass", 2900, 1.6);
      const chain = c.createGain();
      chain.gain.value = 0;
      air.connect(chainBand).connect(chain).connect(l.gain);
      // The bite: the teeth grinding (a rough tone at the rate they pass) and the grit of
      // what they tear, each tooth heard in it.
      const teeth = c.createOscillator();
      teeth.type = "sawtooth";
      const teethBand = filter(c, "bandpass", 750, 2.5);
      const grind = c.createGain();
      grind.gain.value = 0;
      teeth.connect(teethBand).connect(grind).connect(l.gain);
      const gritBand = filter(c, "bandpass", 1200, 1);
      const grit = c.createGain();
      grit.gain.value = 0;
      air.connect(gritBand).connect(grit).connect(l.gain);
      const gritDepth = c.createGain();
      gritDepth.gain.value = 0;
      pop.connect(gritDepth).connect(grit.gain);
      start(l, engine, air, teeth, stumble.src, pace.src);
      Object.assign(l, { engine, muffle, firing, stumbleDepth, paceDepth, raspDepth, chain, teeth, grind, grit, gritDepth, bitten: -1, fresh: true });
    }
    l.touched = t;
    if (s > 0.02) l.idleSince = t;
    const biting = t - l.bitten < 0.1;
    const tc = l.fresh ? 0.001 : 0.06;
    l.fresh = false;
    // Revolutions a second: 38 idling, 120 flat out; a fifth less while it bites. A bigger
    // fish's saw is a bigger engine: a little slower.
    const g = growth(L);
    const rev = (38 + 82 * Math.pow(s, 1.2)) * (biting ? 0.8 : 1) * (1.08 - 0.12 * g);
    glide(l.engine.frequency, rev, t, tc);
    glide(l.paceDepth.gain, rev * (0.06 - 0.04 * s), t, tc);
    glide(l.stumbleDepth.gain, 0.5 - 0.35 * s, t, tc);
    glide(l.muffle.frequency, 700 + 1900 * s, t, tc);
    glide(l.raspDepth.gain, 0.02 + 0.1 * s, t, tc);
    glide(l.chain.gain, 0.09 * s * s, t, tc);
    glide(l.teeth.frequency, rev * 2.3, t, tc);
    glide(l.grind.gain, biting ? 0.3 : 0, t, 0.03);
    glide(l.gritDepth.gain, biting ? 0.6 : 0, t, 0.03);
    // Loud as it revs; at idle about as loud as the river, and after a few seconds of it
    // quieter (the ear gets used to an engine ticking over).
    const idle = 0.5 * (t - l.idleSince > 5 ? 0.55 : 1);
    // (Its first setting eased in, as an engine is heard catching.)
    glide(l.gain.gain, 0.37 * (idle + (1 - idle) * Math.pow(s, 0.7) + (biting ? 0.25 : 0)), t, t - l.born < 0.05 ? 0.06 : t - l.idleSince > 5 ? 1.2 : 0.06);
  }

  // Loops left with nothing keeping them are let go (a step missed now and then is not
  // enough: three tenths of a second).
  function tick() {
    const buses = sound.buses?.();
    if (!buses) {
      for (const kind of [...held.keys()]) release(kind, 0.1);
      return;
    }
    const now = buses.context.currentTime;
    for (const [kind, l] of held) {
      if (now - l.touched > 0.3) release(kind, 0.2);
      else if (kind.startsWith("rounds-")) feed(l, buses.context);
    }
    // One take a frame made ahead.
    const name = toMake.values().next().value;
    if (name && more(buses.context, name)) toMake.delete(name);
  }

  return {
    tick,
    // ---- Kompaktlaser: "tchk-tsss". A relay snaps (a dry tick on top) with a thud of the
    // water under it, then the water boils along the bolt in a short hiss. A bigger fish's
    // laser is deeper and heavier; a hot one hisses harsher.
    piu(L = 0.3, heat = 0) {
      const buses = ready("piu", 0.045, 4);
      if (!buses) return;
      const c = buses.context;
      const g = growth(L);
      const h = clamp01(heat);
      const deep = (1.08 - 0.3 * g) * vary(0.04);
      play(c, pick(bank(c, "tchk"))[0], [buses.water, dry(buses, 0.1 + 0.06 * g)], { rate: deep, peak: 0.16 + 0.1 * g });
      const f = (150 - 85 * g) * vary(0.06);
      tone(c, buses.water, { from: f * 1.3, to: f * 0.6, peak: 0.45 + 0.45 * g, attack: 0.002, decay: 0.07 + 0.08 * g, sweep: 0.05, drive: 2 });
      // (Hotter, the hiss is higher and louder, and a sharp crackle comes up over it.)
      play(c, pick(bank(c, "tsss"))[0], buses.water, { at: 0.01, rate: (1.05 - 0.35 * g) * (1 + 0.15 * h) * vary(0.05), peak: (0.18 + 0.08 * g) * (1 + 0.4 * h) * vary(0.1) });
      if (h > 0.2) play(c, pick(bank(c, "sizzle"))[0], buses.water, { at: 0.012, rate: (1 - 0.2 * g) * vary(0.06), peak: 0.55 * Math.pow((h - 0.2) / 0.8, 1.3) });
    },
    // A weapon held: `spin` its winding up (0..1; for the beam whether it is on), `firing`
    // whether it is at speed with the trigger held. The beam, the chainsaw, and the
    // minigun's motor for anything else that spins.
    hold(id, spin = 0, heat = 0, L = 1, firing = false) {
      if (id === "beam") beam(!!spin, heat, L);
      else if (id === "saege") saw(id, spin, heat, L);
      else motor(id, spin, heat, L, firing);
    },
    // The chainsaw's chain is in something this step (called each step it is).
    bite(id = "saege") {
      const l = held.get(`saw-${id}`);
      if (l) l.bitten = l.context.currentTime;
    },
    // ---- Lichtbogenwerfer: a sharp electric crack, a snap for each fish the arc jumps
    // to, and a crackling tail with the discharge's buzz under it -- longer, louder and
    // deeper the more it strikes.
    arc(L = 1, struck = 1) {
      const buses = ready("arc", 0.06, 4);
      if (!buses) return;
      const c = buses.context;
      const n = Math.max(0, Math.min(6, struck | 0));
      const big = n / 6;
      const jumps = Math.min(5, Math.max(0, n - 1));
      const snaps = bank(c, "snaps")[jumps * 5 + Math.floor(Math.random() * 5)][0];
      play(c, snaps, [buses.water, dry(buses, 0.22 + 0.12 * big)], { rate: vary(0.05), peak: 0.4 + 0.2 * big });
      play(c, pick(bank(c, "crackle"))[0], buses.water, { at: 0.004, rate: vary(0.06), peak: (0.25 + 0.15 * big) * vary(0.1), cut: 0.1 + 0.05 * n });
      const f = (110 - 25 * big) * vary(0.08);
      tone(c, buses.water, { from: f, to: f * 0.5, peak: 0.18 + 0.2 * big, attack: 0.002, decay: 0.06 + 0.03 * n, sweep: 0.05, drive: 2 });
    },
    // ---- Nodachi: a long blade swept once round the fish, a deep heavy whoosh that swells
    // and falls with the turn (the blade coming past), the water it shoves aside booming
    // under it -- a bigger, slower sound than the katana's.
    whirl(L = 9) {
      const buses = ready("whirl", 0.2, 3);
      if (!buses) return;
      const c = buses.context;
      const t = c.currentTime;
      const k = vary(0.08);
      const src = c.createBufferSource();
      src.buffer = longNoise(c);
      const band = filter(c, "bandpass", 180 * k, 1.3);
      band.frequency.setValueAtTime(180 * k, t);
      band.frequency.exponentialRampToValueAtTime(720 * k, t + 0.2);
      band.frequency.exponentialRampToValueAtTime(260 * k, t + 0.45);
      const gain = c.createGain();
      gain.gain.value = 0.0001;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.8, t + 0.19);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
      src.connect(band).connect(gain).connect(buses.water);
      src.start(t, Math.random() * 2);
      voice(src, 0.5, t);
      tone(c, buses.water, { from: 48 * k, to: 70 * k, peak: 0.15, attack: 0.18, decay: 0.3, sweep: 0.2, drive: 1.5 });
      noise(c, buses.water, { type: "lowpass", frequency: 260, peak: 0.15, attack: 0.15, decay: 0.3 });
    },
    // ---- Schiffskanone: a huge deep boom. The blast of the muzzle (dry), a pressure wave
    // far below the rest (a 40 Hz sine driven hard, long), the water shoved out of the way
    // and back again (a second, duller wave off the bed), and the cavity it tore collapsing
    // in a rush of bubbles. Heavier than the grenade launcher, about as big as a blast.
    cannon(L = 5) {
      const buses = ready("cannon", 0.3, 7, true);
      if (!buses) return;
      const c = buses.context;
      const k = vary(0.05);
      noise(c, dry(buses, 0.55), { type: "highpass", frequency: 700, peak: 1, attack: 0.001, decay: 0.07 });
      noise(c, dry(buses, 0.35), { type: "bandpass", frequency: 420, Q: 0.7, peak: 1, attack: 0.002, decay: 0.16 });
      tone(c, buses.water, { from: 62 * k, to: 30 * k, peak: 1.0, attack: 0.004, decay: 1.2, sweep: 0.6, drive: 4 });
      noise(c, buses.water, { type: "lowpass", frequency: 300, peak: 0.8, attack: 0.004, decay: 0.8 });
      tone(c, buses.water, { from: 120 * k, to: 55 * k, peak: 0.5, attack: 0.002, decay: 0.25, sweep: 0.12, drive: 3 });
      noise(c, buses.water, { type: "lowpass", frequency: 160, peak: 0.45, attack: 0.05, decay: 0.7, at: 0.16 });
      noise(c, buses.water, { type: "bandpass", frequency: 420, to: 1500, Q: 2, peak: 0.16, attack: 0.1, decay: 0.8, at: 0.3 });
    },
    // ---- Bauchtorpedos: the tube's thunk (gas driving the torpedo out: a hollow knock, a
    // gush, the door's clack on top), then its propeller whining up as the motor catches
    // and falling away as it goes.
    torpedo(L = 2) {
      const buses = ready("torpedo", 0.2, 7);
      if (!buses) return;
      const c = buses.context;
      const t = c.currentTime;
      const k = vary(0.05);
      tone(c, buses.water, { from: 130 * k, to: 62 * k, peak: 0.8, attack: 0.003, decay: 0.18, sweep: 0.08, drive: 2 });
      noise(c, buses.water, { type: "bandpass", frequency: 240 * k, Q: 5, peak: 0.55, attack: 0.003, decay: 0.14 });
      noise(c, buses.water, { type: "lowpass", frequency: 900, peak: 0.35, attack: 0.01, decay: 0.3 });
      noise(c, dry(buses, 0.18), { type: "bandpass", frequency: 1600, Q: 1.2, peak: 1, attack: 0.001, decay: 0.03 });
      // The propeller: its whine through a lowpass, pulsing as the blades turn.
      const whine = c.createOscillator();
      whine.type = "triangle";
      const at = t + 0.22;
      whine.frequency.setValueAtTime(260 * k, at);
      whine.frequency.exponentialRampToValueAtTime(620 * k, at + 0.45);
      whine.frequency.exponentialRampToValueAtTime(470 * k, at + 1.6);
      const blades = c.createOscillator();
      blades.frequency.setValueAtTime(20, at);
      blades.frequency.exponentialRampToValueAtTime(46, at + 0.45);
      const bladeDepth = c.createGain();
      bladeDepth.gain.value = 0.4;
      const pulse = c.createGain();
      pulse.gain.value = 0.6;
      blades.connect(bladeDepth).connect(pulse.gain);
      const low = filter(c, "lowpass", 1600, 0.7);
      const env = c.createGain();
      env.gain.value = 0.0001;
      env.gain.setValueAtTime(0.0001, at);
      env.gain.exponentialRampToValueAtTime(0.09, at + 0.3);
      env.gain.setTargetAtTime(0.0001, at + 0.45, 0.35);
      whine.connect(low).connect(pulse).connect(env).connect(buses.water);
      whine.start(at);
      blades.start(at);
      voice(whine, 1.75, at);
      blades.stop(at + 1.8);
      // And the water it churns, fading with it.
      noise(c, buses.water, { type: "bandpass", frequency: 1100, to: 800, Q: 1.5, peak: 0.07, attack: 0.3, decay: 1.2, at: 0.25 });
    },
    // ---- Zwillings-Raketenwerfer: each rocket's motor catching -- a crack, a roaring
    // hiss that falls off as it leaves, the water boiling behind it.
    rocket(L = 2.5) {
      const buses = ready("rocket", 0.07, 5);
      if (!buses) return;
      const c = buses.context;
      const k = vary(0.08);
      noise(c, dry(buses, 0.22), { type: "highpass", frequency: 1500, peak: 1, attack: 0.001, decay: 0.025 });
      noise(c, buses.water, { type: "bandpass", frequency: 2600 * k, to: 1100 * k, Q: 0.9, peak: 0.42, attack: 0.006, decay: 0.32 });
      noise(c, buses.water, { type: "lowpass", frequency: 700 * k, to: 300, peak: 1.05, attack: 0.008, decay: 0.38 });
      tone(c, buses.water, { from: 95 * k, to: 50 * k, peak: 0.6, attack: 0.004, decay: 0.16, sweep: 0.1, drive: 2 });
      noise(c, buses.water, { type: "bandpass", frequency: 600, to: 1500, Q: 2.5, peak: 0.13, attack: 0.08, decay: 0.45, at: 0.1 });
    },
    // ---- Seeminen: the rack lets a mine go -- a heavy iron clunk ringing briefly, the
    // weight dropping away, and the latch snapping back.
    mine(L = 2.5) {
      const buses = ready("mine", 0.2, 6);
      if (!buses) return;
      const c = buses.context;
      const k = vary(0.06);
      noise(c, buses.water, { type: "bandpass", frequency: 1700 * k, Q: 1.5, peak: 0.35, attack: 0.001, decay: 0.012 });
      for (const [f, p] of [
        [310, 0.2],
        [737, 0.1],
        [1391, 0.05],
      ])
        tone(c, buses.water, { from: f * k, to: f * k * 0.98, peak: p, attack: 0.002, decay: 0.16 });
      tone(c, buses.water, { from: 95 * k, to: 55 * k, peak: 0.5, attack: 0.003, decay: 0.12, sweep: 0.08, drive: 2 });
      noise(c, dry(buses, 0.12), { type: "bandpass", frequency: 1400, Q: 1, peak: 1, decay: 0.02 });
      click(c, buses.water, { frequency: 2700 * k, peak: 0.2, at: 0.07 + Math.random() * 0.03, ring: 1650 * k });
    },
    // ---- Granatharpune: a pneumatic thump (the gas behind the piston: a deep knock and a
    // hiss), then the line zipping off its reel after the harpoon, slowing as it does.
    harpoon(L = 6) {
      const buses = ready("harpoon", 0.2, 7);
      if (!buses) return;
      const c = buses.context;
      const t = c.currentTime;
      const k = vary(0.05);
      tone(c, buses.water, { from: 105 * k, to: 52 * k, peak: 0.85, attack: 0.003, decay: 0.18, sweep: 0.1, drive: 2.5 });
      noise(c, buses.water, { type: "lowpass", frequency: 650, peak: 0.6, attack: 0.003, decay: 0.14 });
      noise(c, buses.water, { type: "bandpass", frequency: 1900, Q: 1, peak: 0.16, attack: 0.004, decay: 0.16 });
      noise(c, dry(buses, 0.3), { type: "bandpass", frequency: 1100, Q: 0.9, peak: 1, attack: 0.001, decay: 0.035 });
      // The line: noise in a narrow band sweeping up as it pays out and down as it slows,
      // buzzing with the reel's pawl.
      const src = c.createBufferSource();
      src.buffer = longNoise(c);
      const band = filter(c, "bandpass", 900, 5);
      const at = t + 0.03;
      band.frequency.setValueAtTime(900 * k, at);
      band.frequency.exponentialRampToValueAtTime(2300 * k, at + 0.12);
      band.frequency.exponentialRampToValueAtTime(1300 * k, at + 0.55);
      const pawl = c.createOscillator();
      pawl.type = "square";
      pawl.frequency.setValueAtTime(95, at);
      pawl.frequency.exponentialRampToValueAtTime(40, at + 0.55);
      const pawlDepth = c.createGain();
      pawlDepth.gain.value = 0.45;
      const buzz = c.createGain();
      buzz.gain.value = 0.55;
      pawl.connect(pawlDepth).connect(buzz.gain);
      src.connect(band).connect(buzz).connect(envelope(c, 1.1, 0.05, 0.5, at)).connect(buses.water);
      src.start(at, Math.random() * 2);
      pawl.start(at);
      voice(src, 0.55, at);
      pawl.stop(at + 0.6);
    },
    // ---- Panzerbüchse .50: one heavy crack -- the sharpest dry crack of them all, a
    // body far below it, the channel of bubbles it tears through the water, and the bolt
    // working after.
    rifle(L = 4) {
      const buses = ready("rifle", 0.15, 8);
      if (!buses) return;
      const c = buses.context;
      const k = vary(0.04);
      noise(c, dry(buses, 0.7), { type: "highpass", frequency: 1800, peak: 1, attack: 0.0005, decay: 0.03 });
      noise(c, dry(buses, 0.35), { type: "bandpass", frequency: 850, Q: 0.8, peak: 1, attack: 0.001, decay: 0.07 });
      tone(c, buses.water, { from: 80 * k, to: 36 * k, peak: 1.0, attack: 0.003, decay: 0.45, sweep: 0.25, drive: 3.5 });
      noise(c, buses.water, { type: "lowpass", frequency: 220 * k, Q: 0.9, peak: 1.0, attack: 0.003, decay: 0.45 });
      noise(c, buses.water, { type: "bandpass", frequency: 300, to: 120, Q: 1.2, peak: 0.35, attack: 0.03, decay: 0.55, at: 0.02 });
      noise(c, buses.water, { type: "bandpass", frequency: 2600, to: 900, Q: 1.8, peak: 0.12, attack: 0.005, decay: 0.35, at: 0.01 });
      click(c, buses.water, { frequency: 1500, peak: 0.16, ring: 380, at: 0.3 });
      click(c, buses.water, { frequency: 2100, peak: 0.12, at: 0.38 });
    },
    // ---- A weapon capsule taken: the gun strapped on -- a heavy metal clack as it seats,
    // the lock snapping home, a thud of its weight. Deeper for the heavy guns.
    pickup(id) {
      for (const name of NEEDS[id] ?? []) toMake.add(name);
      const buses = ready("pickup", 0.3, 8);
      if (!buses) return;
      const c = buses.context;
      const heavy = ["kanone", "minigun", "panzerbuechse", "torpedo", "minen", "raketen", "saege", "harpune", "nodachi"].includes(id);
      const k = (heavy ? 0.8 : 1) * vary(0.04);
      noise(c, buses.water, { type: "bandpass", frequency: 1400 * k, Q: 1.3, peak: 0.9, attack: 0.001, decay: 0.014 });
      tone(c, buses.water, { from: 520 * k, to: 505 * k, peak: 0.28, attack: 0.002, decay: 0.12 });
      tone(c, buses.water, { from: 1187 * k, peak: 0.1, attack: 0.002, decay: 0.08 });
      tone(c, buses.water, { from: 120 * k, to: 70 * k, peak: 0.9, attack: 0.003, decay: 0.09, sweep: 0.06, drive: 2 });
      noise(c, dry(buses, 0.3), { type: "bandpass", frequency: 1800 * k, Q: 1, peak: 1, decay: 0.018 });
      click(c, buses.water, { frequency: 2900 * k, peak: 0.55, at: 0.085, ring: 1750 * k });
      noise(c, dry(buses, 0.18), { type: "highpass", frequency: 2500, peak: 1, decay: 0.01, at: 0.085 });
    },
  };
}
