// Combat on the screen: the crosshair (the middle of the view, where shots go), a mark on it
// for a hit and a sink, the call-outs ("Treffer!", "Versenkt!"), and the weapon card in the
// bottom-left corner, the one corner the game leaves free, with how hot the weapon is.
// The German texts are the source; the page's translation watch turns them into the chosen
// language (fv/i18n.js has the words).

import { t } from "../i18n.js";

const CSS = `
#xh { position: fixed; left: 50%; top: 50%; width: 30px; height: 30px; margin: -15px 0 0 -15px; pointer-events: none; z-index: 3; opacity: 0; transition: opacity 0.2s; }
#habitat.locked:not(.paused):not(.menu):not(.building) #xh.armed { opacity: 1; }
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
#arsenal .name { margin: 2px 0 6px; font-weight: 800; }
#arsenal .heat { height: 4px; border-radius: 2px; background: rgba(238, 238, 222, 0.16); overflow: hidden; }
#arsenal .heat i { display: block; height: 100%; width: 0; background: linear-gradient(90deg, #ffd27a, #ff6a3a); }
#arsenal .card.locked .heat i { background: #ff3b2e; }
#arsenal .card.locked .name::after { content: " · " attr(data-hot); color: #ff7a5a; }
@media (max-width: 1000px) { #arsenal { bottom: 70px; } }
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
  for (const [place, key] of [
    ["back", "Linke Maustaste"],
    ["belly", "Rechte Maustaste"],
  ]) {
    const card = document.createElement("div");
    card.className = "card";
    card.innerHTML = `<div class="key">${key}</div><div class="name"></div><div class="heat"><i></i></div>`;
    card.querySelector(".name").dataset.hot = t("Überhitzt");
    arsenal.appendChild(card);
    cards[place] = { card, name: card.querySelector(".name"), heat: card.querySelector(".heat i"), shown: null, width: -1, locked: null };
  }
  habitat.appendChild(arsenal);

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
            if (id) c.name.textContent = t(weapons[id].title);
          }
          if (!id) continue;
          const width = Math.round(Math.min(1, a.heat[id] ?? 0) * 100);
          if (width !== c.width) {
            c.width = width;
            c.heat.style.width = `${width}%`;
          }
          const locked = !!a.locked[id];
          if (locked !== c.locked) {
            c.locked = locked;
            c.card.classList.toggle("locked", locked);
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
