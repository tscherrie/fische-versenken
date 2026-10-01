// Handles for testing co-op with several pages at once (?fvcoop, with ?diagnostics=1): a
// driver outside the pages (over the DevTools protocol) calls these to set a fight up the
// same way every time -- enemies put in front of this page's fish, run by this page -- and
// reads back what each page sees. Nothing here changes how the game plays.
//
//   fvcoop.spawn(kind, ds, du)         an enemy run by this page, `ds` units along the river
//                                      from this page's fish and `du` across from the deepest
//                                      line there, at the fish's height
//   fvcoop.quiet(on)                   this page's director sends nobody while on
//   fvcoop.stay(on)                    the fish held where it is (a test fish has no player
//                                      to swim it, and the current carries it off)
//   fvcoop.endure(on)                  its strength never falls below a third, and nothing
//                                      swallows it (a long test fight is not cut short by
//                                      the fish's death)
//   fvcoop.face(id | null)             the fish turns to that enemy and keeps turning to it
//   fvcoop.state()                     what this page has: its fish, its enemies and proxies,
//                                      the co-op counters and the traffic
//   fvcoop.track(on)                   every frame, where each shared enemy is (for the
//                                      driver to compare pages): fvcoop.tracks
//   fvcoop.timing()                    from now on, what combat's step and frame cost, and
//                                      co-op's own part of the step: fvcoop.times()

export function installCoopDev(salmon, extreme) {
  const { course, fish, look, THREE } = salmon;
  const combat = extreme.combat;
  const owners = extreme.owners;
  // (Alone -- no room -- for the same fight solo: no owners, no line.)
  const net = extreme.coop.net ?? { now: () => performance.now(), traffic: {}, seat: null };
  let facing = null,
    tracking = false,
    staying = null,
    enduring = false;
  const tracks = [];
  // Every shared enemy's death as this page shows it: burst or whole, caught as the splatter
  // is told (a burst body is gone from the list at once).
  const deaths = {};
  const kill = combat.gore.kill;
  combat.gore.kill = function (e, ...rest) {
    const out = kill.call(this, e, ...rest);
    if (e?.id > 0) {
      if (!deaths[e.id]) deaths[e.id] = { burst: !!e.burst, weapon: rest[1] ?? null, time: +extreme.game.now.time.toFixed(2), n: 0 };
      deaths[e.id].n++;
    }
    return out;
  };
  function loop() {
    if (enduring && fish.energy < 0.34) fish.energy = 0.34;
    if (staying) {
      fish.position.copy(staying);
      fish.velocity.set(0, 0, 0);
      fish.relative?.set(0, 0, 0);
    }
    if (facing !== null) {
      const e = combat.enemies.list.find((x) => x.id === facing);
      if (e && !e.dead) {
        const d = e.position.clone().sub(fish.position);
        look.yaw = Math.atan2(d.z, d.x);
        look.pitch = Math.max(-0.6, Math.min(0.6, Math.atan2(d.y, Math.hypot(d.x, d.z))));
      }
    }
    if (tracking) {
      const now = net.now();
      for (const e of combat.enemies.list) if (e.id > 0) tracks.push([Math.round(now), e.id, +e.position.x.toFixed(3), +e.position.y.toFixed(3), +e.position.z.toFixed(3), e.remote ? 1 : 0, e.dead ? 1 : 0, e.remote ? Math.round(e.net?.delay ?? 0) : 0]);
      if (tracks.length > 60000) tracks.splice(0, tracks.length - 60000);
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);
  const spot = {};
  const api = {
    tracks,
    deaths,
    spawn(kind, ds, du = 0, y = null) {
      // (Where the water is deep enough: along the deepest line, then nearer the fish, or
      // the other way along the river -- a riffle or a fall may be where it was asked.)
      course.locate(fish.position.x, fish.position.z, fish.river.s, spot);
      api.why = [];
      for (const k of [1, 0.6, -1, -0.6, 0.3, 1.5, -1.5])
        for (const side of [du, du * 0.5, 0]) {
          const s = spot.s + ds * k;
          const c = course.section(s);
          const u = c.thalweg + side;
          const floor = course.bed(s, u);
          const top = course.level(s);
          if (top - floor < 1.2) {
            api.why.push(`shallow ${s.toFixed(1)} ${u.toFixed(1)}: ${(top - floor).toFixed(2)}`);
            continue;
          }
          const e = combat.enemies.spawn(kind, s, u, y ?? Math.min(top - 0.3, Math.max(floor + 0.3, fish.position.y)));
          if (e) return e.id;
          api.why.push(`refused ${s.toFixed(1)} ${u.toFixed(1)}: count ${combat.enemies.count(kind)}`);
        }
      return null;
    },
    // This fish to river place (s, u), `height` of the way up from the bed.
    moveTo(s, u, height = 0.5) {
      salmon.startAt(s, u, height);
      if (staying) staying.copy(fish.position);
    },
    quiet(on) {
      if (owners) owners.devQuiet = !!on;
      else if (on) combat.director.hold(1e6);
    },
    stay(on) {
      staying = on ? fish.position.clone() : null;
    },
    endure(on) {
      enduring = !!on;
      // (Nor swallowed whole: that ends a life at once, whatever its strength.)
      import("../difficulty.js").then((m) => {
        for (const level of m.LEVELS) level.swallowWas ??= level.swallow;
        for (const level of m.LEVELS) level.swallow = on ? false : level.swallowWas;
      });
    },
    face(id) {
      facing = id;
    },
    track(on) {
      tracking = !!on;
      if (on) tracks.length = 0;
    },
    state() {
      const f = fish.position;
      const enemies = combat.enemies.list.filter((e) => e.id > 0).map((e) => ({ id: e.id, kind: e.kind, owner: e.owner, remote: !!e.remote, dead: !!e.dead, burst: !!e.burst, hp: +e.hp.toFixed(2), mode: e.mode, v: e.claim?.v ?? null, x: +e.position.x.toFixed(2), y: +e.position.y.toFixed(2), z: +e.position.z.toFixed(2), d: +e.position.distanceTo(f).toFixed(2), target: e.target ? (e.target.local ? "me" : e.target.id) : null, delay: e.remote ? Math.round(e.net?.delay ?? 0) : null }));
      return {
        seat: net.seat,
        now: Math.round(net.now()),
        fish: [+f.x.toFixed(3), +f.y.toFixed(3), +f.z.toFixed(3)],
        s: +fish.river.s.toFixed(1),
        energy: +fish.energy.toFixed(4),
        kills: combat.local.kills,
        down: combat.local.down,
        dead: extreme.game.now.dead > 0,
        paused: extreme.game.now.paused,
        time: +extreme.game.now.time.toFixed(2),
        directs: owners?.directs ?? true,
        group: owners?.groupSeats() ?? [],
        roomSize: owners?.roomSize ?? 1,
        mates: [...(extreme.coop.mates?.mates.values() ?? [])].map((m) => ({ seat: m.seat, connected: m.connected, down: m.down, pz: m.pz, delay: Math.round(m.delay), fish: [+m.fish.position.x.toFixed(2), +m.fish.position.y.toFixed(2), +m.fish.position.z.toFixed(2)] })),
        enemies,
        counters: { ...(owners?.counters ?? {}) },
        traffic: { ...net.traffic, seconds: +((Date.now() - net.traffic.since) / 1000).toFixed(1) },
        deaths: combat.deaths.slice(),
        players: combat.players.length,
        targets: combat.targets.length,
      };
    },
  };
  // What things cost (ms per call), once timing() has been called.
  const spent = {};
  const timed = (object, name, key) => {
    const fn = object[name];
    const t = (spent[key] = { total: 0, calls: 0, list: [] });
    object[name] = function (...args) {
      const t0 = performance.now();
      try {
        return fn.apply(this, args);
      } finally {
        const ms = performance.now() - t0;
        t.total += ms;
        t.calls++;
        if (t.list.length < 20000) t.list.push(ms);
      }
    };
  };
  api.timing = () => {
    if (spent.step) return;
    timed(combat, "step", "step");
    timed(combat, "frame", "frame");
    if (owners) for (const name of ["before", "replays", "after"]) timed(owners, name, `coop-${name}`);
  };
  api.times = () => {
    const out = {};
    for (const [k, t] of Object.entries(spent)) {
      const sorted = t.list.slice().sort((a, b) => a - b);
      out[k] = { mean: +(t.total / Math.max(1, t.calls)).toFixed(3), median: +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3), p90: +(sorted[Math.floor(sorted.length * 0.9)] ?? 0).toFixed(3), calls: t.calls };
      t.total = 0;
      t.calls = 0;
      t.list.length = 0;
    }
    return out;
  };
  window.fvcoop = api;
  return api;
}
