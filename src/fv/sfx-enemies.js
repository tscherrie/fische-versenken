// The enemies' weapons, heard where they are (sfx.js hands in its makings): every ranged
// enemy's gun, the blades of those that strike, the wind-up of the long aims, the charges
// going off. An enemy's gun is made as the salmon's own are -- a heavy body, a crack on top,
// the water's whump after -- but it is heard from where the enemy is: quieter and duller the
// farther it is from the ear (the camera; every `distance` here is in units), and on its own
// side of the surface. A gun under water plays into the water group (clear under water, only
// a dull thump from above); the heron's harpoon gun and the gannet's whistling bombs play into
// the air group (clear in the air, dull through the surface). So an enemy's crack goes into
// its group as well, not into the ui group as the salmon's own does: it is heard sharp only
// on its own side of the surface.
//
// A shoal fires together: the shots of one gun in the same moment are one sound, raised to
// the nearest of them, and a shot inside a gun's shortest interval after the last is not
// heard again. The enemies have a share of the voices of their own, beside the salmon's and
// under the reserve kept for blasts and kills (sfx.js), so a shoal shooting never silences
// the gun in the player's hand, nor the player's weapons the shoal. The charges (the sea
// mine, the bombs) may use the reserve as every blast does, and when even that is full they
// are heard smaller rather than not at all. The old king's minigun is one looping voice
// while its barrels spin, as the flamethrower is: a sound per round twenty times a second
// would be noise and a pile of voices.
//
// Nothing comes out the same twice: pitch, levels and the noise vary with every shot.

// Farther than this (units) an enemy is not heard at all.
const FAR = 60;
// The minigun's level, and how fast its barrels turn at full spin (Hz of the motor's hum).
const MINIGUN = 0.62;
const SPUN = 150;

// How near a sound is: 1 within 4 units of the ear, then falling off gently, as the water
// carries sound far -- half at 10 units, a third at 18, a fifth at 32 -- and nothing beyond
// FAR.
export const nearness = (d) => (d > FAR ? 0 : Math.min(1, 7 / (3 + Math.max(0, d))));
// The top of what still comes through from that far (Hz): open near by, a dull thud far off
// (the water takes the highs first).
export const cutoff = (k) => 400 + 9600 * Math.pow(k, 1.6);
// A little different every time.
const vary = (x, by = 0.06) => x * (1 + by * (Math.random() * 2 - 1));
const any = (a, b) => a + (b - a) * Math.random();

export function createEnemySfx({ sound, room, voice, noise, tone, click, filter, saturate, whiteBuffer, hold }) {
  // The last sound of each kind: when, and its way into the group (to raise it to a nearer
  // shot of the same moment).
  const recent = new Map();
  // The minigun's loop while its barrels turn.
  let spin = null;

  // The way into the group for a sound `k` near: its level, then the lowpass of the
  // distance; and a second way in for its crack, which the distance takes a second time.
  function route(buses, group, k, level) {
    const c = buses.context;
    const out = c.createGain();
    out.gain.value = level * k;
    const top = filter(c, "lowpass", cutoff(k), 0.5);
    out.connect(top).connect(buses[group]);
    const crack = c.createGain();
    crack.gain.value = Math.sqrt(k);
    crack.connect(out);
    return { c, out, top, crack, k, level };
  }
  // A sound of `kind` from `distance`, if it is to be heard now: its way in, or null. Not
  // within `interval` of the last of its kind (one that comes in the same moment raises that
  // one instead, if it is nearer), and only while there is room for its `cost` in voices:
  // in the enemies' share, or -- `vital` -- anywhere under the cap. (`carry` under 1: heard
  // as if that much nearer.)
  function begin(kind, interval, cost, distance, { group = "water", level = 1, vital = false, carry = 1 } = {}) {
    const k = nearness(distance * carry);
    const buses = k > 0 ? sound.buses?.() : null;
    if (!buses) return null;
    const c = buses.context;
    const now = c.currentTime;
    const r = recent.get(kind);
    if (r && r.c === c && now - r.at < interval) {
      if (now - r.at < 0.005 && k > r.k) {
        r.k = k;
        r.out.gain.value = r.level * k;
        r.top.frequency.value = cutoff(k);
        r.crack.gain.value = Math.sqrt(k);
      }
      return null;
    }
    if (!room(now, cost, vital)) return null;
    const way = route(buses, group, k, level);
    way.at = now;
    recent.set(kind, way);
    return way;
  }

  // ---- The guns, by the id of the enemy's weapon (kinds.js). Each: its shortest interval
  // between two sounds, its voices, its level, its group, and how it is made (`p` its pitch
  // this time, about 1).
  const GUNS = {
    // The bullhead's sawn-off: a short, fat blast, rougher than the salmon's shotgun -- the
    // short barrel's "blat" in the low middle -- and the water's whump after it.
    sawnoff: {
      interval: 0.12,
      cost: 5,
      level: 0.9,
      play(c, o, p) {
        noise(c, o.out, { type: "lowpass", frequency: 240 * p, Q: 0.9, peak: 1, attack: 0.002, decay: 0.3 });
        tone(c, o.out, { from: 88 * p, to: 40 * p, peak: 0.85, attack: 0.003, decay: 0.3, sweep: 0.2, drive: 3 });
        noise(c, o.out, { type: "bandpass", frequency: 520 * p, Q: 1.3, peak: 0.65, attack: 0.001, decay: 0.09 });
        noise(c, o.crack, { type: "highpass", frequency: 1600, peak: 0.75, attack: 0.001, decay: 0.03 });
        noise(c, o.out, { type: "bandpass", frequency: 300 * p, to: 130, Q: 1.2, peak: 0.28, attack: 0.03, decay: 0.5, at: 0.02 });
      },
    },
    // The cod's pump-action: a longer barrel, so more boom and less blat, and then the pump
    // worked back and forth, clack-clack.
    pumpgun: {
      interval: 0.2,
      cost: 8,
      level: 0.84,
      play(c, o, p) {
        noise(c, o.out, { type: "lowpass", frequency: 200 * p, Q: 0.9, peak: 1.05, attack: 0.002, decay: 0.36 });
        tone(c, o.out, { from: 80 * p, to: 38 * p, peak: 0.9, attack: 0.003, decay: 0.34, sweep: 0.22, drive: 3 });
        noise(c, o.crack, { type: "highpass", frequency: 1400, peak: 0.75, attack: 0.001, decay: 0.035 });
        noise(c, o.out, { type: "bandpass", frequency: 650 * p, Q: 0.8, peak: 0.55, attack: 0.001, decay: 0.08 });
        noise(c, o.out, { type: "bandpass", frequency: 260 * p, to: 120, Q: 1.2, peak: 0.3, attack: 0.03, decay: 0.55, at: 0.02 });
        const pump = any(0.32, 0.38);
        click(c, o.out, { frequency: 1300 * p, peak: 0.34, ring: 360 * p, at: pump });
        click(c, o.out, { frequency: 1750 * p, peak: 0.4, ring: 480 * p, at: pump + any(0.13, 0.17) });
      },
    },
    // The perch's pistol: a sharp crack over a short body, and the slide's click.
    pistol: {
      interval: 0.08,
      cost: 5,
      level: 1.35,
      play(c, o, p) {
        tone(c, o.out, { from: 150 * p, to: 75 * p, peak: 0.55, attack: 0.002, decay: 0.1, sweep: 0.06, drive: 2 });
        noise(c, o.out, { type: "lowpass", frequency: 700 * p, peak: 0.5, attack: 0.002, decay: 0.1 });
        noise(c, o.crack, { type: "bandpass", frequency: 2000 * p, Q: 1, peak: 0.85, attack: 0.001, decay: 0.022 });
        noise(c, o.out, { type: "bandpass", frequency: 900 * p, Q: 0.8, peak: 0.6, attack: 0.001, decay: 0.05 });
        click(c, o.out, { frequency: 2600 * p, peak: 0.1, at: 0.05 });
      },
    },
    // The goosander's revolver: heavier than the pistol, a little ring to its blast, and the
    // cylinder turning on to the next chamber after it.
    revolver: {
      interval: 0.12,
      cost: 7,
      level: 0.95,
      play(c, o, p) {
        tone(c, o.out, { from: 120 * p, to: 58 * p, peak: 0.75, attack: 0.002, decay: 0.16, sweep: 0.08, drive: 2.5 });
        noise(c, o.out, { type: "lowpass", frequency: 450 * p, peak: 0.7, attack: 0.002, decay: 0.18 });
        noise(c, o.crack, { type: "bandpass", frequency: 1500 * p, Q: 0.9, peak: 0.85, attack: 0.001, decay: 0.03 });
        noise(c, o.out, { type: "bandpass", frequency: 750 * p, Q: 0.8, peak: 0.5, attack: 0.001, decay: 0.07 });
        noise(c, o.out, { type: "bandpass", frequency: 240 * p, to: 110, Q: 1.2, peak: 0.18, attack: 0.02, decay: 0.3, at: 0.02 });
        click(c, o.out, { frequency: 2200 * p, peak: 0.09, ring: 1250 * p, at: 0.13 });
      },
    },
    // The trout's machine pistol: light and quick, tk-tk-tk, each round a small thump and a
    // thin crack.
    smg: {
      interval: 0.06,
      cost: 4,
      level: 1.35,
      vary: 0.08,
      play(c, o, p) {
        tone(c, o.out, { from: 170 * p, to: 95 * p, peak: 0.5, attack: 0.002, decay: 0.085, sweep: 0.05, drive: 1.5 });
        noise(c, o.out, { type: "lowpass", frequency: 900 * p, peak: 0.5, attack: 0.001, decay: 0.09 });
        noise(c, o.crack, { type: "bandpass", frequency: 2400 * p, Q: 1.2, peak: 0.7, attack: 0.001, decay: 0.018 });
        noise(c, o.out, { type: "bandpass", frequency: 1000 * p, Q: 0.8, peak: 0.45, attack: 0.001, decay: 0.04 });
      },
    },
    // The mackerel's assault rifle: a deeper thump than the machine pistol's, a harder crack,
    // and a tail of the water after each round.
    rifle: {
      interval: 0.07,
      cost: 5,
      level: 1.3,
      play(c, o, p) {
        tone(c, o.out, { from: 115 * p, to: 55 * p, peak: 0.6, attack: 0.002, decay: 0.12, sweep: 0.07, drive: 2.5 });
        noise(c, o.out, { type: "lowpass", frequency: 520 * p, peak: 0.55, attack: 0.002, decay: 0.13 });
        noise(c, o.crack, { type: "highpass", frequency: 1900, peak: 0.8, attack: 0.001, decay: 0.02 });
        noise(c, o.out, { type: "bandpass", frequency: 800 * p, Q: 0.8, peak: 0.55, attack: 0.001, decay: 0.06 });
        noise(c, o.out, { type: "bandpass", frequency: 300 * p, to: 140, Q: 1.2, peak: 0.16, attack: 0.02, decay: 0.25, at: 0.015 });
      },
    },
    // The beetle larva's nail gun: no powder, air -- the valve's short hiss, the driver
    // slamming home ("tak"), the exhaust bubbling off.
    nailgun: {
      interval: 0.08,
      cost: 5,
      level: 1.3,
      play(c, o, p) {
        noise(c, o.crack, { type: "highpass", frequency: 1400 * p, peak: 0.4, attack: 0.001, decay: 0.05 });
        click(c, o.out, { frequency: 1800 * p, peak: 0.55, ring: 620 * p });
        tone(c, o.out, { from: 210 * p, to: 140 * p, peak: 0.7, attack: 0.002, decay: 0.07, drive: 1.5 });
        noise(c, o.out, { type: "bandpass", frequency: 700 * p, to: 1400, Q: 3, peak: 0.07, attack: 0.02, decay: 0.15, at: 0.02 });
      },
    },
    // The grayling's crossbow: no blast, the string -- a woody snap as it lets go, the low
    // twang of the string, the stock's knock, the bolt fizzing off through the water.
    crossbow: {
      interval: 0.15,
      cost: 4,
      level: 1.45,
      play(c, o, p) {
        noise(c, o.crack, { type: "bandpass", frequency: 1100 * p, Q: 1.8, peak: 0.8, attack: 0.001, decay: 0.035 });
        tone(c, o.out, { type: "triangle", from: 118 * p, to: 96 * p, peak: 0.32, attack: 0.002, decay: 0.18, sweep: 0.1 });
        tone(c, o.out, { from: 70 * p, to: 45, peak: 0.38, attack: 0.002, decay: 0.08 });
        noise(c, o.out, { type: "bandpass", frequency: 1700 * p, to: 900, Q: 2, peak: 0.09, attack: 0.02, decay: 0.2 });
      },
    },
    // The sticklebacks' throwing stars: the flick of the throw, then the star spinning off,
    // a fast metallic whirr fading away.
    stars: {
      interval: 0.06,
      cost: 3,
      level: 2.5,
      play(c, o, p) {
        noise(c, o.out, { type: "bandpass", frequency: 700 * p, to: 1600, Q: 1.4, peak: 0.6, attack: 0.015, decay: 0.07 });
        whirr(c, o.crack, { frequency: 1900 * p, rate: any(26, 34), peak: 0.4, attack: 0.02, decay: 0.25 });
      },
    },
    // The herrings' throwing knives: a quicker, heavier flick, and the blade turning over and
    // over as it goes (wup-wup), slower than a star's whirr.
    knives: {
      interval: 0.06,
      cost: 3,
      level: 2.5,
      play(c, o, p) {
        noise(c, o.out, { type: "bandpass", frequency: 600 * p, to: 1800, Q: 1.6, peak: 0.65, attack: 0.02, decay: 0.08 });
        whirr(c, o.out, { frequency: 950 * p, rate: any(10, 13), peak: 0.45, attack: 0.03, decay: 0.3, Q: 2.5 });
      },
    },
    // The heron's harpoon gun, fired from high over the water: the bands' hard snap and the
    // stock kicking, the sear's click, and the line whizzing off after the shaft. In the air
    // group: from under the water it comes down dull.
    speargun: {
      interval: 0.3,
      cost: 4,
      level: 3.2,
      group: "air",
      play(c, o, p) {
        click(c, o.out, { frequency: 2400 * p, peak: 0.18 });
        noise(c, o.crack, { type: "bandpass", frequency: 1250 * p, Q: 2, peak: 0.65, attack: 0.001, decay: 0.045 });
        tone(c, o.out, { from: 95 * p, to: 55, peak: 0.55, attack: 0.003, decay: 0.13, drive: 1.5 });
        noise(c, o.out, { type: "bandpass", frequency: 2200 * p, to: 1000, Q: 3, peak: 0.14, attack: 0.01, decay: 0.4, at: 0.02 });
      },
    },
    // The pike's elephant gun: one enormous shot -- a deep boom driven hard and ringing out
    // long, the muzzle's blast, a crack, the water shoved away and rolling back, and the gas
    // bubble collapsing into a second, lower thump. Long after, the bolt worked.
    elephantgun: {
      interval: 0.4,
      cost: 10,
      level: 0.66,
      vary: 0.04,
      // (Heard from farther off than the rest, as if a quarter nearer: its boom is the
      // lowest of them all, and the water takes the lows last. The pike fires from far.)
      carry: 0.75,
      play(c, o, p) {
        tone(c, o.out, { from: 52 * p, to: 28 * p, peak: 1.2, attack: 0.003, decay: 1, sweep: 0.6, drive: 4 });
        noise(c, o.out, { type: "lowpass", frequency: 260 * p, peak: 1.1, attack: 0.002, decay: 0.7 });
        noise(c, o.out, { type: "bandpass", frequency: 650 * p, Q: 0.9, peak: 0.5, attack: 0.001, decay: 0.12 });
        noise(c, o.crack, { type: "highpass", frequency: 1300, peak: 0.85, attack: 0.001, decay: 0.04 });
        noise(c, o.out, { type: "bandpass", frequency: 220 * p, to: 90, Q: 1.3, peak: 0.35, attack: 0.05, decay: 0.9, at: 0.05 });
        tone(c, o.out, { from: 60 * p, to: 35 * p, peak: 0.45, attack: 0.02, decay: 0.35, at: any(0.15, 0.19), drive: 2 });
        const bolt = any(1.4, 1.6);
        click(c, o.out, { frequency: 1200 * p, peak: 0.25, ring: 300 * p, at: bolt });
        click(c, o.out, { frequency: 1500 * p, peak: 0.28, ring: 420 * p, at: bolt + any(0.18, 0.24) });
      },
    },
  };

  // A spinning blade's whirr: a band of noise pulsed `rate` times a second, dying away.
  function whirr(c, out, { frequency, rate, peak, attack, decay, Q = 5 }) {
    const t = c.currentTime;
    const spinner = c.createOscillator();
    spinner.frequency.value = rate;
    const pulse = c.createGain();
    pulse.gain.value = 0.5;
    const depth = c.createGain();
    depth.gain.value = 0.5;
    spinner.connect(depth).connect(pulse.gain);
    pulse.connect(out);
    noise(c, pulse, { type: "bandpass", frequency, to: frequency * 0.8, Q, peak, attack, decay });
    spinner.start(t);
    spinner.stop(t + attack + decay + 0.05);
  }

  // ---- The minigun: one loop while the barrels turn. The aim spins them up (a motor's hum
  // rising); every round keeps the fire going -- white noise pulsed by a falling saw, each
  // period a round's sharp onset and quick fall, over the saw's own low thump -- and
  // a tenth of a second without one lets it stop, the barrels running down after. The loop
  // ends itself on the audio clock (`gone`), so a burst cut short (the king sunk) is not left
  // turning; update() lets its nodes go.
  function minigun(distance, seconds) {
    const k = nearness(distance);
    const buses = k > 0 ? sound.buses?.() : null;
    if (!buses) return;
    const c = buses.context;
    const t = c.currentTime;
    if (spin && spin.c !== c) letGo();
    if (!spin) {
      if (!room(t, 3)) return;
      const out = c.createGain();
      out.gain.value = MINIGUN * k;
      const top = filter(c, "lowpass", cutoff(k), 0.5);
      out.connect(top).connect(buses.water);
      // The rounds.
      const rounds = c.createBufferSource();
      rounds.buffer = whiteBuffer(c);
      rounds.loop = true;
      const rate = c.createOscillator();
      rate.type = "sawtooth";
      rate.frequency.value = 20;
      const pulse = c.createGain();
      pulse.gain.value = 0.5;
      const depth = c.createGain();
      depth.gain.value = -0.5;
      rate.connect(depth).connect(pulse.gain);
      const crack = c.createGain();
      crack.gain.value = 0.3 * Math.sqrt(k);
      rounds.connect(filter(c, "lowpass", 520, 0.9)).connect(pulse);
      rounds.connect(filter(c, "highpass", 1800, 0.7)).connect(crack).connect(pulse);
      // (Silent until a round comes: set as its value, which no cancelling takes away.)
      const fire = c.createGain();
      fire.gain.value = 0;
      pulse.connect(fire).connect(out);
      // The thump of each round: the saw itself, driven and kept low (twice filtered, so its
      // upper harmonics do not beat against the motor's hum).
      const thump = c.createGain();
      thump.gain.value = 0.55;
      rate.connect(saturate(c, 2.5)).connect(filter(c, "lowpass", 120, 0.9)).connect(filter(c, "lowpass", 120, 0.9)).connect(thump).connect(fire);
      // The motor turning the barrels.
      const motor = c.createOscillator();
      motor.type = "triangle";
      motor.frequency.value = 35;
      const hum = c.createGain();
      hum.gain.value = 0;
      motor.connect(filter(c, "lowpass", 900, 0.8)).connect(hum).connect(out);
      rounds.start(t, Math.random() * 0.5);
      rate.start(t);
      motor.start(t);
      // (Three voices that sound; the saw is one of them, as the thump.)
      hold(3);
      spin = { c, out, top, crack, fire, hum, motor, rate, rounds, sources: [rounds, rate, motor], gone: t + 3, k };
    }
    const g = spin;
    // (Where it is heard from set again only when that has moved: a round comes every frame.)
    if (Math.abs(k - g.k) > 0.01) {
      g.k = k;
      g.out.gain.setTargetAtTime(MINIGUN * k, t, 0.03);
      g.top.frequency.setTargetAtTime(cutoff(k), t, 0.03);
      g.crack.gain.setTargetAtTime(0.3 * Math.sqrt(k), t, 0.03);
    }
    // (Only what was yet to come is taken back: a glide under way goes on from where it is.)
    for (const param of [g.fire.gain, g.hum.gain, g.motor.frequency]) param.cancelScheduledValues(t);
    if (seconds > 0) {
      // Spun up over the aim, and run down again if no round follows.
      g.motor.frequency.setTargetAtTime(SPUN, t, seconds / 3);
      g.hum.gain.setTargetAtTime(0.22, t, seconds / 4);
      runDown(g, t + seconds + 0.3);
    } else {
      g.motor.frequency.setTargetAtTime(SPUN, t, 0.06);
      g.hum.gain.setTargetAtTime(0.16, t, 0.03);
      g.fire.gain.setTargetAtTime(1, t, 0.004);
      g.fire.gain.setTargetAtTime(0, t + 0.09, 0.02);
      // (Never quite the same rate twice, nor the noise run through at the same pace -- its
      // buffer is a second long: a long burst does not come round as a loop would.)
      g.rate.frequency.setTargetAtTime(vary(20, 0.12), t, 0.04);
      g.rounds.playbackRate.setTargetAtTime(vary(1, 0.2), t, 0.05);
      runDown(g, t + 0.09);
    }
  }
  function runDown(g, at) {
    g.motor.frequency.setTargetAtTime(28, at, 0.45);
    g.hum.gain.setTargetAtTime(0, at + 0.15, 0.3);
    g.gone = at + 2.2;
  }
  function letGo() {
    const g = spin;
    spin = null;
    hold(-3);
    const t = g.c.currentTime;
    g.out.gain.cancelScheduledValues(t);
    g.out.gain.setTargetAtTime(0, t, 0.02);
    // (A context the game has let go of may be closed already.)
    for (const s of g.sources)
      try {
        s.stop(t + 0.1);
      } catch {}
  }

  // ---- The blades, by the id of the enemy's weapon: the swing (as its strike begins) and
  // the blow landing (on the salmon), each at its level (`levels` [swing, blow]). The game
  // plays the body's knock of a blow already (outcome.bitten); these are the blade's own part
  // of it over that knock. A swing is soft: a shoal darting in must not become a hiss.
  const BLADES = {
    // The young trout's combat knife: a low whoosh; the stab a dull thud and a wet "shlk".
    knife: {
      levels: [0.8, 4],
      swing(c, o, p) {
        noise(c, o.out, { type: "bandpass", frequency: 380 * p, to: 1200, Q: 1.3, peak: 0.28, attack: 0.05, decay: 0.09 });
      },
      land(c, o, p) {
        tone(c, o.out, { from: 170 * p, to: 95, peak: 0.38, attack: 0.002, decay: 0.05 });
        noise(c, o.out, { type: "bandpass", frequency: 1400 * p, to: 650, Q: 1.4, peak: 0.34, attack: 0.002, decay: 0.07 });
      },
    },
    // The minnows' razor blades: a thin, quick whisk past, and a fine slice.
    razor: {
      levels: [1.2, 3],
      swingCost: 1,
      swing(c, o, p) {
        noise(c, o.out, { type: "bandpass", frequency: 2600 * p, to: 4200, Q: 3, peak: 0.09, attack: 0.02, decay: 0.04 });
      },
      land(c, o, p) {
        noise(c, o.crack, { type: "bandpass", frequency: 3200 * p, Q: 2.5, peak: 0.6, attack: 0.001, decay: 0.04 });
        noise(c, o.out, { type: "bandpass", frequency: 1100 * p, Q: 2, peak: 0.5, attack: 0.002, decay: 0.035 });
      },
    },
    // The kingfisher's push dagger, driven in by its dive: a hard punch and the steel. (Its
    // swing is its dive, heard as the bird's.)
    pushdagger: {
      levels: [0, 3.8],
      landCost: 3,
      land(c, o, p) {
        tone(c, o.out, { from: 240 * p, to: 120, peak: 0.45, attack: 0.002, decay: 0.05, drive: 1.5 });
        noise(c, o.out, { type: "bandpass", frequency: 900 * p, Q: 2, peak: 0.34, attack: 0.001, decay: 0.05 });
        click(c, o.crack, { frequency: 2000 * p, peak: 0.12 });
      },
    },
    // The eel's shocker: as it strikes, the arc charging -- a low buzz swelling; the shock a
    // harsh, stuttering buzz with sparks crackling through it and a jolt under it.
    shocker: {
      levels: [1.2, 2.9],
      swingCost: 1,
      swing(c, o, p) {
        buzz(c, o.out, { from: 70 * p, to: 110 * p, peak: 0.09, attack: 0.18, decay: 0.12, top: 900 });
      },
      landCost: 7,
      land(c, o, p) {
        buzz(c, o.out, { from: 95 * p, to: 80 * p, peak: 0.32, attack: 0.004, decay: 0.3, top: 2400, stutter: true });
        tone(c, o.out, { from: 90 * p, to: 50, peak: 0.38, attack: 0.002, decay: 0.08 });
        for (let i = 0; i < 4; i++) click(c, o.crack, { frequency: any(1500, 3400), peak: any(0.08, 0.16), at: any(0, 0.25) });
      },
    },
    // The dragonfly larva's switchblade: the blade flicked out ("tschak") as it strikes; a
    // small stab.
    switchblade: {
      levels: [1.2, 5],
      swingCost: 3,
      swing(c, o, p) {
        click(c, o.out, { frequency: 2800 * p, peak: 0.22, ring: 1600 * p });
        noise(c, o.out, { type: "bandpass", frequency: 1800 * p, Q: 2, peak: 0.1, attack: 0.001, decay: 0.03, at: 0.012 });
      },
      land(c, o, p) {
        tone(c, o.out, { from: 220 * p, to: 130, peak: 0.26, attack: 0.002, decay: 0.04 });
        noise(c, o.out, { type: "bandpass", frequency: 1800 * p, to: 900, Q: 1.4, peak: 0.22, attack: 0.002, decay: 0.05 });
      },
    },
    // The otter's machete: a heavy whoosh from high up; the chop a meaty "chunk" with the
    // blade ringing faintly after.
    machete: {
      levels: [0.56, 2.7],
      swing(c, o, p) {
        noise(c, o.out, { type: "bandpass", frequency: 280 * p, to: 900, Q: 1, peak: 0.45, attack: 0.08, decay: 0.14 });
      },
      landCost: 3,
      land(c, o, p) {
        tone(c, o.out, { from: 130 * p, to: 65, peak: 0.6, attack: 0.002, decay: 0.09, drive: 2 });
        noise(c, o.out, { type: "lowpass", frequency: 1100 * p, peak: 0.45, attack: 0.001, decay: 0.09 });
        tone(c, o.out, { from: 1150 * p, to: 1120 * p, peak: 0.045, attack: 0.003, decay: 0.2 });
      },
    },
  };
  // An electric buzz: a saw gliding from `from` to `to` through a lowpass, stuttering (its
  // pitch jumping about, as an arc does) when asked.
  function buzz(c, out, { from, to, peak, attack, decay, top, stutter = false }) {
    const t = c.currentTime;
    const osc = c.createOscillator();
    osc.type = "sawtooth";
    osc.frequency.setValueAtTime(from, t);
    if (stutter) for (let s = 0.03; s < attack + decay; s += 0.03) osc.frequency.setValueAtTime(from + (to - from) * (s / (attack + decay)) * any(0.6, 1.5), t + s);
    else osc.frequency.exponentialRampToValueAtTime(to, t + attack + decay);
    const gain = c.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    osc.connect(filter(c, "lowpass", top, 0.8)).connect(gain).connect(out);
    osc.start(t);
    voice(osc, attack + decay, t);
  }

  // ---- The charges going off (the jellyfish's sea mine, the gannet's bombs): blasts under
  // water. `size` as the salmon's explosion has it.
  const BLASTS = {
    // The sea mine: its casing bursting (a sharp crack and a short metallic clang), the deep
    // boom of a big charge, the gas bubble collapsing into a second thump, the water rushing
    // back.
    seamine: {
      cost: 7,
      level: 1.1,
      play(c, o, p, full) {
        tone(c, o.out, { from: 44 * p, to: 26 * p, peak: 1.25, attack: 0.004, decay: 1.3, sweep: 0.8, drive: 4 });
        noise(c, o.out, { type: "lowpass", frequency: 320 * p, peak: 1, attack: 0.004, decay: 1 });
        if (!full) return;
        noise(c, o.crack, { type: "highpass", frequency: 700, peak: 0.6, attack: 0.001, decay: 0.06 });
        tone(c, o.crack, { from: 690 * p, to: 650 * p, peak: 0.07, attack: 0.002, decay: 0.45 });
        tone(c, o.out, { from: 40 * p, to: 28 * p, peak: 0.55, attack: 0.03, decay: 0.6, at: any(0.26, 0.32), drive: 2 });
        noise(c, o.out, { type: "bandpass", frequency: 500 * p, to: 1600, Q: 1.4, peak: 0.2, attack: 0.1, decay: 1.2, at: 0.08 });
      },
    },
    // The bombs: a sharper crack (a smaller charge, nearer the surface), the boom, the bubble
    // pulse, and the water and spray coming down.
    bombs: {
      cost: 6,
      level: 1.75,
      play(c, o, p, full) {
        tone(c, o.out, { from: 58 * p, to: 34 * p, peak: 1.15, attack: 0.004, decay: 0.9, sweep: 0.5, drive: 4 });
        noise(c, o.out, { type: "lowpass", frequency: 450 * p, peak: 0.95, attack: 0.004, decay: 0.75 });
        if (!full) return;
        noise(c, o.crack, { type: "highpass", frequency: 1000, peak: 0.7, attack: 0.001, decay: 0.05 });
        tone(c, o.out, { from: 50 * p, to: 32 * p, peak: 0.4, attack: 0.03, decay: 0.4, at: any(0.18, 0.23), drive: 2 });
        noise(c, o.out, { type: "bandpass", frequency: 800 * p, to: 2200, Q: 1.5, peak: 0.2, attack: 0.06, decay: 0.9, at: 0.05 });
      },
    },
  };

  return {
    // An enemy's gun goes off (combat.js enemyShoots), `distance` units from the ear.
    enemyShot(id, distance = 8) {
      if (id === "minigun") return minigun(distance, 0);
      const gun = GUNS[id] ?? GUNS.pistol;
      const o = begin(`shot:${id}`, gun.interval, gun.cost, distance, gun);
      if (o) gun.play(o.c, o, vary(1, gun.vary ?? 0.05));
    },
    // A long aim begins, `seconds` before the shot: the tell, heard only where it helps --
    // the minigun's barrels spinning up, the elephant gun's hammer cocked, the harpoon gun's
    // safety, and the gannet's bombs whistling down as it dives. (The rest have the game's
    // ticking of a hunter about to strike, which the aim already sets off.)
    enemyAim(id, distance = 8, seconds = 1) {
      if (id === "minigun") return minigun(distance, Math.max(0.2, seconds));
      if (id === "elephantgun") {
        const o = begin("aim:elephantgun", 1, 4, distance, { level: 4.3 });
        if (!o) return;
        click(o.c, o.out, { frequency: 1400, peak: 0.3, ring: 380 });
        click(o.c, o.out, { frequency: 2000, peak: 0.26, ring: 900, at: any(0.06, 0.08) });
      } else if (id === "speargun") {
        // (Low for a click, where the surface takes least from it, and with a second ring
        // off the first so that it still sounds of metal; loud in the air, so that the
        // salmon under the water hears it through the surface -- the game's own calls from
        // over the water are raised as much for it.)
        const o = begin("aim:speargun", 1, 3, distance, { group: "air", level: 13 });
        if (!o) return;
        click(o.c, o.out, { frequency: 1000, peak: 0.3, ring: 520 });
        tone(o.c, o.out, { from: 1370, peak: 0.05, attack: 0.002, decay: 0.08 });
      } else if (id === "bombs") {
        // A breathy whistle falling in pitch, swelling as the bombs come down, gone as they go
        // into the water: soft, and dulled by the surface for the salmon under it. (More air
        // than tone, and falling only so far: a pure glide would be a cartoon's bomb.)
        const o = begin("aim:bombs", 0.5, 2, distance, { group: "air", level: 1 });
        if (!o) return;
        const c = o.c;
        const t = c.currentTime;
        const s = Math.max(0.4, Math.min(3, seconds));
        const high = any(1350, 1550);
        const gain = c.createGain();
        gain.gain.value = 0.0001;
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(0.3, t + 0.08);
        gain.gain.exponentialRampToValueAtTime(1.5, t + s);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + s + 0.06);
        gain.connect(o.crack);
        const osc = c.createOscillator();
        osc.frequency.setValueAtTime(high, t);
        osc.frequency.exponentialRampToValueAtTime(high * 0.6, t + s);
        const pure = c.createGain();
        pure.gain.value = 0.45;
        osc.connect(pure).connect(gain);
        osc.start(t);
        voice(osc, s + 0.06, t);
        const air = c.createBufferSource();
        air.buffer = whiteBuffer(c);
        air.loop = true;
        const band = filter(c, "bandpass", high, 6);
        band.frequency.setValueAtTime(high, t);
        band.frequency.exponentialRampToValueAtTime(high * 0.6, t + s);
        const breath = c.createGain();
        breath.gain.value = 5;
        air.connect(band).connect(breath).connect(gain);
        air.start(t, Math.random() * 0.5);
        voice(air, s + 0.06, t);
      }
    },
    // An enemy's blade: `landed` false as its strike begins (the swing), true when the blow
    // lands on the salmon.
    enemyStrike(id, distance = 3, landed = true) {
      const blade = BLADES[id] ?? BLADES.knife;
      const make = landed ? blade.land : blade.swing;
      if (!make) return;
      const cost = (landed ? blade.landCost : blade.swingCost) ?? 2;
      const o = begin(`${landed ? "blow" : "swing"}:${id}`, id === "razor" ? 0.1 : 0.15, cost, distance, { level: blade.levels[landed ? 1 : 0] });
      if (o) make(o.c, o, vary(1, 0.07));
    },
    // An enemy's round coming into the water from the air (the heron's harpoon) or a bomb
    // going in: a splash at the surface (the game's own), a hollow plunk and the bubbles of
    // its trail.
    enemyEntry(id, distance = 10) {
      const bomb = id === "bombs";
      const o = begin(`in:${id}`, 0.12, 2, distance, { level: bomb ? 0.9 : 0.75 });
      if (!o) return;
      sound.splash?.(Math.min(1.4, (bomb ? 1.3 : 0.9) * o.k), bomb ? 1.5 : 0.8);
      const p = vary(1, 0.08);
      tone(o.c, o.out, { from: (bomb ? 200 : 300) * p, to: (bomb ? 100 : 150) * p, peak: 0.3, attack: 0.002, decay: bomb ? 0.09 : 0.06 });
      noise(o.c, o.out, { type: "bandpass", frequency: 800 * p, to: 2200, Q: 2, peak: 0.1, attack: 0.03, decay: 0.4 });
    },
    // An enemy's charge goes off (combat.js explode), `size` as the salmon's explosion has it:
    // it may take the reserve, and with no room even there it is heard as its boom alone.
    enemyBlast(id, distance = 8, size = 1.5) {
      const blast = BLASTS[id] ?? BLASTS.bombs;
      const kind = `blast:${id}`;
      const p = vary(1, 0.05) * Math.pow(1.5 / Math.max(0.5, size), 0.25);
      const level = 0.72 * blast.level * Math.min(1.3, 0.8 + 0.15 * size);
      let o = begin(kind, 0.06, blast.cost, distance, { level, vital: true });
      if (o) return blast.play(o.c, o, p, true);
      // (No room: begin() took nothing, so its kind may try again, smaller.)
      const r = recent.get(kind);
      if (r && sound.buses?.()?.context.currentTime - r.at < 0.06) return;
      o = begin(kind, 0.06, 2, distance, { level, vital: true });
      if (o) blast.play(o.c, o, p, false);
    },
    // Each frame: the minigun's loop, once it has run down -- or its context replaced by a
    // new one (the sound let go of the device and took it up again) -- is let go.
    update() {
      if (!spin) return;
      const buses = sound.buses?.();
      if ((buses && buses.context !== spin.c) || spin.c.currentTime > spin.gone) letGo();
    },
  };
}
