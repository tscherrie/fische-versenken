// Combat on the screen: the crosshair (the middle of the view, where shots go), a mark on it
// for a hit and a sink, the call-outs ("Treffer!", "Versenkt!"), and the weapon cards in the
// bottom-left corner, the one corner the game leaves free: for each weapon how hot it is, how
// much fuel is left, or its rounds as pips and the magazine filling while it reloads, and a
// word when it cannot fire ("Überhitzt", "Leer", "Nachladen"). On a phone the crosshair
// shows whenever the fish is armed (there is no pointer to catch), and the cards name the
// places instead of the mouse buttons.
// The German texts are the source; the page's translation watch turns them into the chosen
// language (fv/i18n.js has the words).

import { t } from "../i18n.js";

const CSS = `
#xh { position: fixed; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; pointer-events: none; z-index: 3; opacity: 0; transition: opacity 0.2s; }
#habitat.locked:not(.paused):not(.menu):not(.building) #xh.armed, #habitat.touch:not(.paused):not(.menu):not(.building) #xh.armed { opacity: 1; }
#xh i { position: absolute; background: rgba(255, 244, 230, 0.85); box-shadow: 0 0 3px rgba(0, 0, 0, 0.6); }
#xh i.t, #xh i.b { left: 14px; width: 2px; height: 8px; }
#xh i.t { top: 0; } #xh i.b { bottom: 0; }
#xh i.l, #xh i.r { top: 14px; width: 8px; height: 2px; }
#xh i.l { left: 0; } #xh i.r { right: 0; }
#xh b { position: absolute; left: 13px; top: 13px; width: 4px; height: 4px; border-radius: 50%; background: rgba(255, 240, 225, 0.9); }
#xh.hot i, #xh.hot b { background: #ff8a4a; }
#xh .mark { position: absolute; inset: -6px; opacity: 0; transform: rotate(45deg) scale(0.8); transition: opacity 0.12s, transform 0.12s; }
#xh .mark::before, #xh .mark::after { content: ""; position: absolute; left: 50%; top: 50%; background: #fff; }
#xh .mark::before { width: 26px; height: 2px; margin: -1px 0 0 -13px; }
#xh .mark::after { width: 2px; height: 26px; margin: -13px 0 0 -1px; }
#xh.hit .mark { opacity: 0.9; transform: rotate(45deg) scale(1); }
#xh.kill .mark::before, #xh.kill .mark::after { background: #ff4a3a; }
#callout { position: fixed; left: 50%; top: 30%; transform: translate(-50%, 0); pointer-events: none; z-index: 3; text-align: center; font: 800 clamp(26px, 3.6vw, 44px)/1.1 var(--hud-font, var(--font-body)); color: #fff4ea; text-shadow: 0 2px 10px rgba(0, 0, 0, 0.55), 0 0 18px rgba(255, 90, 40, 0.55); letter-spacing: 0.02em; opacity: 0; transition: opacity 0.18s, transform 0.18s; }
#callout.shown { opacity: 1; transform: translate(-50%, -6px); }
#callout small { display: block; font-size: 0.42em; font-weight: 700; opacity: 0.85; letter-spacing: 0.04em; margin-top: 4px; }
#arsenal { position: fixed; left: 16px; bottom: 16px; z-index: 2; pointer-events: none; display: flex; gap: 8px; font: 600 13px/1.2 var(--hud-font, var(--font-body)); color: var(--text, #eee); opacity: 0; transition: opacity 0.3s; }
#habitat:not(.building):not(.menu) #arsenal.armed { opacity: 1; }
#arsenal .card { min-width: 132px; padding: 8px 10px 9px; border-radius: 10px; background: rgba(6, 18, 16, 0.55); border: 1px solid rgba(238, 238, 222, 0.14); backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px); }
#arsenal .card[hidden] { display: none; }
#arsenal .key { font-size: 10px; opacity: 0.6; letter-spacing: 0.06em; text-transform: uppercase; }
#arsenal .key .finger, .touch #arsenal .key .mouse { display: none; }
.touch #arsenal .key .finger { display: inline; }
#arsenal .name { margin: 2px 0 6px; font-weight: 800; }
#arsenal .card.flag .name::after { content: " · " attr(data-state); color: #ffd9a0; }
#arsenal .card.locked .name::after { color: #ff7a5a; }
#arsenal .heat { height: 4px; border-radius: 2px; background: rgba(238, 238, 222, 0.16); overflow: hidden; }
#arsenal .heat i { display: block; height: 100%; width: 100%; transform: scaleX(0); transform-origin: 0 50%; background: linear-gradient(90deg, #ffd27a, #ff6a3a); will-change: transform; }
#arsenal .card.fuel .heat i { background: linear-gradient(90deg, #ff8a3a, #ffd27a); }
#arsenal .card.shells .heat i { background: rgba(238, 238, 222, 0.75); }
#arsenal .card.locked .heat i { background: #ff3b2e; }
#arsenal .pips { display: flex; gap: 3px; height: 8px; }
#arsenal .pips b { flex: 0 0 5px; border-radius: 1.5px; background: #f0d9a8; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.25); }
#arsenal .pips b.spent { background: rgba(238, 238, 222, 0.16); box-shadow: none; }
#arsenal .card.shells:not(.reloading) .heat, #arsenal .card:not(.shells) .pips, #arsenal .card.reloading .pips { display: none; }
@media (max-width: 1000px) { #arsenal { bottom: 70px; } }
#bossbar { position: fixed; left: 50%; top: 18px; width: min(460px, 60vw); transform: translate(-50%, 0); z-index: 3; pointer-events: none; text-align: center; font: 800 13px/1.2 var(--hud-font, var(--font-body)); color: #fff4ea; letter-spacing: 0.08em; text-transform: uppercase; text-shadow: 0 1px 6px rgba(0, 0, 0, 0.6); opacity: 0; transition: opacity 0.4s; }
#bossbar.shown { opacity: 1; }
#habitat.building #bossbar, #habitat.menu #bossbar { display: none; }
#bossbar .track { margin-top: 6px; height: 7px; border-radius: 4px; background: rgba(10, 16, 14, 0.6); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.14); overflow: hidden; }
#bossbar .track b { display: block; height: 100%; width: 100%; background: linear-gradient(90deg, #b3121b, #ff4a2a); transition: width 0.15s; }
#foes { position: fixed; inset: 0; pointer-events: none; z-index: 2; }
#habitat.building #foes, #habitat.menu #foes { display: none; }
#foes i { position: absolute; left: 0; top: 0; width: 38px; height: 4px; margin: -2px 0 0 -19px; border-radius: 2px; background: rgba(10, 16, 14, 0.55); box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12); opacity: 0; transition: opacity 0.25s; will-change: transform; }
#foes i b { display: block; height: 100%; border-radius: 2px; background: linear-gradient(90deg, #ff5a3c, #ffb25a); transform-origin: 0 50%; will-change: transform; }
#foes i.shown { opacity: 1; }
`;

export function createCombatHud(habitat, { weapons }) {
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  const cross = document.createElement("div");
  cross.id = "xh";
  cross.innerHTML = '<i class="t"></i><i class="b"></i><i class="l"></i><i class="r"></i><b></b><span class="mark"></span>';
  habitat.appendChild(cross);

  const callout = document.createElement("div");
  callout.id = "callout";
  habitat.appendChild(callout);

  const arsenal = document.createElement("div");
  arsenal.id = "arsenal";
  const cards = {};
  for (const [place, key, spot] of [
    ["back", "Linke Maustaste", "Rücken"],
    ["belly", "Rechte Maustaste", "Bauch"],
  ]) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="key"><span class="mouse">${key}</span><span class="finger">${spot}</span></div><div class="name"></div><div class="heat"><i></i></div><div class="pips"></div>`;
    arsenal.appendChild(card);
    // (`shown` starts as nothing at all, so the first frame hides a card with no weapon.)
    cards[place] = { card, name: card.querySelector(".name"), heat: card.querySelector(".heat i"), pips: card.querySelector(".pips"), shown: undefined, kind: null, level: -1, locked: null, label: null, reloading: null, shells: -1, rounds: -1 };
  }
  // (What the weapon card reads each frame, filled in place.)
  const readout = {};
  habitat.appendChild(arsenal);

  // Bars over enemies that have been hit, while they are near and in view.
  const foes = document.createElement("div");
  foes.id = "foes";
  habitat.appendChild(foes);
  const bars = Array.from({ length: 10 }, () => {
    const bar = document.createElement("i");
    bar.innerHTML = "<b></b>";
    foes.appendChild(bar);
    return { bar, fill: bar.firstChild, shown: false, width: -1, x: 0, y: 0 };
  });
  // The boss's name and strength across the top of the screen.
  const bossbar = document.createElement("div");
  bossbar.id = "bossbar";
  bossbar.innerHTML = '<div class="name"></div><div class="track"><b></b></div>';
  habitat.appendChild(bossbar);
  const bossName = bossbar.querySelector(".name"),
    bossFill = bossbar.querySelector(".track b");
  let bossShown = null,
    bossWidth = -1;
  let projector = null;

  let markUntil = 0,
    calloutUntil = 0,
    clock = 0,
    armed = null,
    hot = null;

  return {
    // `a` the arsenal, or null when nothing is carried.
    update(dt, a) {
      clock += dt;
      const on = !!a;
      if (on !== armed) {
        armed = on;
        cross.classList.toggle("armed", on);
        arsenal.classList.toggle("armed", on);
      }
      if (a) {
        for (const place of ["back", "belly"]) {
          const c = cards[place];
          const id = a[place];
          if (id !== c.shown) {
            c.shown = id;
            c.card.hidden = !id;
            if (id) c.name.textContent = t(weapons[id]?.title ?? id);
          }
          if (!id) continue;
          const r = a.readout ? a.readout(id, readout) : { kind: "heat", level: Math.min(1, a.heat[id] ?? 0), locked: !!a.locked[id], label: a.locked[id] ? "Überhitzt" : "", reload: 0, rounds: 0, shells: 0 };
          if (r.kind !== c.kind) {
            c.card.classList.remove(`${c.kind}`);
            c.kind = r.kind;
            c.card.classList.add(r.kind);
          }
          // The bar: heat rising, fuel falling, or the magazine filling while it reloads.
          const level = Math.round(Math.min(1, Math.max(0, r.level)) * 100);
          if (level !== c.level) {
            c.level = level;
            c.heat.style.transform = `scaleX(${level / 100})`;
          }
          const reloading = r.reload > 0;
          if (reloading !== c.reloading) {
            c.reloading = reloading;
            c.card.classList.toggle("reloading", reloading);
          }
          // The rounds, one pip each, the spent ones dimmed.
          if (r.kind === "shells") {
            if (r.shells !== c.shells) {
              c.shells = r.shells;
              c.rounds = -1;
              c.pips.innerHTML = "<b></b>".repeat(r.shells);
            }
            if (r.rounds !== c.rounds) {
              c.rounds = r.rounds;
              for (let i = 0; i < c.pips.children.length; i++) c.pips.children[i].classList.toggle("spent", i >= r.rounds);
            }
          }
          if (r.locked !== c.locked) {
            c.locked = r.locked;
            c.card.classList.toggle("locked", r.locked);
          }
          if (r.label !== c.label) {
            c.label = r.label;
            if (r.label) c.name.dataset.state = t(r.label);
            c.card.classList.toggle("flag", !!r.label);
          }
        }
        const isHot = !!a.locked[a.back];
        if (isHot !== hot) {
          hot = isHot;
          cross.classList.toggle("hot", isHot);
        }
      }
      if (markUntil && clock > markUntil) {
        markUntil = 0;
        cross.classList.remove("hit", "kill");
      }
      if (calloutUntil && clock > calloutUntil) {
        calloutUntil = 0;
        callout.classList.remove("shown");
      }
    },
    // The boss bar: a name and its strength 0..1, or null to hide it.
    boss(name, fraction = 1) {
      if (name !== bossShown) {
        bossShown = name;
        if (name) bossName.textContent = t(name);
        bossbar.classList.toggle("shown", !!name);
      }
      const width = Math.round(Math.max(0, fraction) * 100);
      if (name && width !== bossWidth) {
        bossWidth = width;
        bossFill.style.width = `${width}%`;
      }
    },
    // `list`: the enemies; `camera`; `time`: the game's clock (for how long a bar stays).
    bars(list, camera, time) {
      projector ??= new camera.position.constructor();
      let n = 0;
      const w = window.innerWidth,
        h = window.innerHeight;
      for (const e of list) {
        if (n >= bars.length) break;
        if (e.dead || e.spec.boss || e.hp >= e.maxHp || time - (e.hitAt ?? -1e9) > 3) continue;
        projector.copy(e.position);
        projector.y += e.size * 0.35;
        if (projector.distanceTo(camera.position) > 30) continue;
        projector.project(camera);
        if (projector.z > 1 || Math.abs(projector.x) > 1.1 || Math.abs(projector.y) > 1.1) continue;
        const b = bars[n++];
        const x = Math.round((projector.x * 0.5 + 0.5) * w),
          y = Math.round((0.5 - projector.y * 0.5) * h);
        if (x !== b.x || y !== b.y) {
          b.x = x;
          b.y = y;
          b.bar.style.transform = `translate(${x}px, ${y}px)`;
        }
        const width = Math.max(0, Math.round((e.hp / e.maxHp) * 100));
        if (width !== b.width) {
          b.width = width;
          b.fill.style.transform = `scaleX(${width / 100})`;
        }
        if (!b.shown) {
          b.shown = true;
          b.bar.classList.add("shown");
        }
      }
      for (let i = n; i < bars.length; i++) {
        const b = bars[i];
        if (b.shown) {
          b.shown = false;
          b.bar.classList.remove("shown");
        }
      }
    },
    hit(kill = false) {
      cross.classList.add("hit");
      cross.classList.toggle("kill", kill);
      markUntil = clock + (kill ? 0.3 : 0.1);
    },
    // A call-out in the middle of the screen: a word, and a smaller line under it.
    say(word, line = "", seconds = 0.9) {
      callout.innerHTML = `${t(word)}${line ? `<small>${t(line)}</small>` : ""}`;
      callout.classList.add("shown");
      calloutUntil = clock + seconds;
    },
  };
}
