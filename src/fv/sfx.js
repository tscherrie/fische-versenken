// The sounds of combat, made in code like every other sound of the game and played into its
// groups (sound.buses()), so mute, the pause and the ear crossing the surface apply to them
// too. Weapons fire many times a second, so each kind of sound has a shortest interval and
// there is a cap on how many play at once.

export function createSfx(sound) {
  const last = new Map();
  let playing = 0;
  let noise = null;

  function ready(kind, interval) {
    const buses = sound.buses?.();
    if (!buses) return null;
    const now = buses.context.currentTime;
    if (now - (last.get(kind) ?? -1) < interval || playing > 14) return null;
    last.set(kind, now);
    return buses;
  }
  function noiseBuffer(context) {
    if (noise && noise.sampleRate === context.sampleRate) return noise;
    noise = context.createBuffer(1, Math.round(context.sampleRate * 0.5), context.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }
  function voice(node, seconds) {
    playing++;
    node.onended = () => playing--;
    node.stop(node.context.currentTime + seconds + 0.05);
  }
  // A gain that rises fast and dies away: the shape of every short sound here.
  function envelope(context, peak, attack, decay) {
    const gain = context.createGain();
    const t = context.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(peak, t + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return gain;
  }

  return {
    // The pew-pew: a bright chirp falling fast, a little different each time.
    piu(size = 0.3) {
      const buses = ready("piu", 0.045);
      if (!buses) return;
      const c = buses.context;
      const osc = c.createOscillator();
      osc.type = "square";
      const top = 2200 - Math.min(900, size * 500) + Math.random() * 300;
      const t = c.currentTime;
      osc.frequency.setValueAtTime(top, t);
      osc.frequency.exponentialRampToValueAtTime(top * 0.28, t + 0.08);
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = 3800;
      const gain = envelope(c, 0.07, 0.004, 0.08);
      osc.connect(filter).connect(gain).connect(buses.water);
      osc.start();
      voice(osc, 0.1);
    },
    // A shot landing on a body: a short, dull tick.
    hit() {
      const buses = ready("hit", 0.03);
      if (!buses) return;
      const c = buses.context;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.value = 900 + Math.random() * 400;
      band.Q.value = 2.5;
      const gain = envelope(c, 0.22, 0.002, 0.05);
      src.connect(band).connect(gain).connect(buses.water);
      src.start(0, Math.random() * 0.4);
      voice(src, 0.06);
    },
    // A shot into the bed or a stone: a gritty puff.
    ground() {
      const buses = ready("ground", 0.06);
      if (!buses) return;
      const c = buses.context;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const low = c.createBiquadFilter();
      low.type = "lowpass";
      low.frequency.value = 1400;
      const gain = envelope(c, 0.08, 0.003, 0.09);
      src.connect(low).connect(gain).connect(buses.water);
      src.start(0, Math.random() * 0.4);
      voice(src, 0.1);
    },
    // Sunk: a deep thump falling away, and a rush of bubbles.
    sunk(size = 1) {
      const buses = ready("sunk", 0.08);
      if (!buses) return;
      const c = buses.context;
      const t = c.currentTime;
      const osc = c.createOscillator();
      osc.type = "sine";
      const base = 150 / Math.sqrt(Math.max(0.5, size));
      osc.frequency.setValueAtTime(base, t);
      osc.frequency.exponentialRampToValueAtTime(base * 0.3, t + 0.45);
      const gain = envelope(c, 0.5, 0.01, 0.45);
      osc.connect(gain).connect(buses.water);
      osc.start();
      voice(osc, 0.5);
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const band = c.createBiquadFilter();
      band.type = "bandpass";
      band.frequency.setValueAtTime(500, t);
      band.frequency.exponentialRampToValueAtTime(1800, t + 0.4);
      band.Q.value = 4;
      const fizz = envelope(c, 0.12, 0.05, 0.4);
      src.connect(band).connect(fizz).connect(buses.water);
      src.start();
      voice(src, 0.5);
    },
    // Too hot: a hiss, and the weapon falls silent.
    overheat() {
      const buses = ready("overheat", 0.8);
      if (!buses) return;
      const c = buses.context;
      const src = c.createBufferSource();
      src.buffer = noiseBuffer(c);
      const high = c.createBiquadFilter();
      high.type = "highpass";
      high.frequency.value = 2500;
      const gain = envelope(c, 0.1, 0.02, 0.35);
      src.connect(high).connect(gain).connect(buses.water);
      src.start();
      voice(src, 0.4);
    },
  };
}
