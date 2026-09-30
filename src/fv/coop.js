// Co-op (plan, part 5), the part that runs in the page: the lobby on the title card, the
// start for everyone at once, the others in the river (mates.js), the one clock of the day.
//
// Without ?room the title card only offers to open a room: that asks the room service for
// a code and comes back to the page with ?room=<code>&new (a fresh brood at the spring: a
// game swum together never starts from the solo save, and never writes it either). With
// ?room the card shows the room: its link to send, the players (their places' colours, who
// is ready), a nickname and a ready button in place of the start button. When everyone in
// the room is ready the room counts down, and at its moment every page starts its game --
// all hatch together in the gravel of the spring. Coming back into a room that is already
// under way starts at once.
//
// The day's hour is the host's: it sends it every few seconds and the others follow it.

import { frame as riverFrame } from "../course.js";
import { t } from "../i18n.js";
import { VERSION } from "../version.js";
import { SEAT_COLOURS, createMates } from "./mates.js";
import { ROOMS, createNet } from "./net.js";

const NAME = "extreme-name";
// How often the host sends the hour (s), and how far off the others may be before they
// follow (hours).
const HOUR_EVERY = 4;
const HOUR_SLACK = 0.05;

const CSS = `
#intro .fv-coop { margin: 0 auto 16px; max-width: 30em; display: grid; gap: 10px; text-align: left; }
#intro .fv-coop .offer { display: flex; flex-wrap: wrap; align-items: center; justify-content: center; gap: 8px 12px; font-size: 13px; opacity: 0.9; }
#intro .fv-coop button.small { padding: 6px 14px; font-size: 13px; }
#intro .fv-coop .room { display: grid; gap: 10px; padding: 12px 14px; border-radius: 12px; background: rgba(255, 255, 255, 0.06); border: 1px solid rgba(255, 255, 255, 0.12); }
#intro .fv-coop .head { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; flex-wrap: wrap; }
#intro .fv-coop .code { font: 700 18px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.12em; }
#intro .fv-coop .link { display: flex; gap: 6px; }
#intro .fv-coop .link input { flex: 1; min-width: 0; font: 12px ui-monospace, Menlo, monospace; padding: 6px 8px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.25); color: inherit; }
#intro .fv-coop ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 4px; }
#intro .fv-coop li { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; gap: 8px; align-items: center; font-size: 14px; }
#intro .fv-coop li i { width: 10px; height: 10px; border-radius: 50%; }
#intro .fv-coop li .state { font-size: 12px; opacity: 0.8; }
#intro .fv-coop li.away { opacity: 0.5; }
#intro .fv-coop .me { display: flex; gap: 8px; }
#intro .fv-coop .me input { flex: 1; min-width: 0; padding: 7px 10px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.18); background: rgba(0,0,0,0.25); color: inherit; font: inherit; }
#intro .fv-coop .note { font-size: 12.5px; opacity: 0.8; margin: 0; }
#intro .fv-coop .warn { color: #ffb08a; }
#intro.fv-in-room:not(.paused) #intro-start, #intro.fv-in-room #intro-new { display: none; }
#intro .fv-coop.hatched .me, #intro .fv-coop.hatched .link { display: none; }
#fv-countdown { position: fixed; inset: 0; display: grid; place-items: center; z-index: 50; pointer-events: none; font: 800 clamp(64px, 14vw, 160px)/1 var(--hud-font, var(--font-body)); color: #fff4ea; text-shadow: 0 4px 30px rgba(0,0,0,0.6); }
#fv-countdown[hidden] { display: none; }
`;

export function createCoop(game) {
  const { query, habitat } = game;
  const code = (query.get("room") ?? "").toUpperCase();
  const base = query.get("rooms") || ROOMS;
  // (No room service yet: nothing of co-op shows.)
  if (!base) return { active: false, step() {}, frame() {} };
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const intro = habitat.querySelector("#intro");
  const start = habitat.querySelector("#intro-start");
  const panel = document.createElement("div");
  panel.className = "fv-coop";
  start?.parentNode.insertBefore(panel, start);

  const savedName = () => {
    try {
      return localStorage.getItem(NAME) || "";
    } catch {
      return "";
    }
  };
  const keepName = (name) => {
    try {
      localStorage.setItem(NAME, name);
    } catch {
      // (Asked again next time.)
    }
  };

  // ---- No room: only the offer to open one.
  if (!/^[A-Z2-9]{6}$/.test(code)) {
    panel.innerHTML = `<div class="offer"><span>${t("Zu zweit bis zu viert spielen:")}</span><button class="small quiet" type="button">${t("Koop-Raum eröffnen")}</button></div><p class="note warn" hidden></p>`;
    const button = panel.querySelector("button");
    const warn = panel.querySelector(".warn");
    button.addEventListener("click", async () => {
      button.disabled = true;
      try {
        const reply = await fetch(`${base}/rooms/new`);
        const { code: fresh } = await reply.json();
        const rooms = query.get("rooms") ? `&rooms=${encodeURIComponent(query.get("rooms"))}` : "";
        location.href = `${location.pathname}?room=${fresh}&new${rooms}`;
      } catch {
        button.disabled = false;
        warn.hidden = false;
        warn.textContent = t("Der Raum-Dienst ist gerade nicht erreichbar. Bitte gleich noch einmal versuchen.");
      }
    });
    return { active: false, step() {}, frame() {} };
  }

  // ---- In a room.
  intro?.classList.add("fv-in-room");
  // A game swum together never writes the solo save.
  if (game.save) game.save.store = () => {};
  const net = createNet({ base, version: VERSION, player: query.get("player") ?? "" });
  const mates = createMates(game, net);
  const link = `${location.origin}${location.pathname}?room=${code}&new`;
  panel.innerHTML = `
    <div class="room">
      <div class="head"><span>${t("Koop-Raum")}</span><span class="code">${code}</span></div>
      <div class="link"><input id="fv-room-link" type="text" readonly aria-label="${t("Link zum Raum")}"><button class="small" type="button" id="fv-copy">${t("Link kopieren")}</button></div>
      <ul id="fv-seats"></ul>
      <div class="me"><input id="fv-name" type="text" maxlength="16" autocomplete="nickname" aria-label="${t("Dein Name")}" placeholder="${t("Dein Name")}"><button type="button" id="fv-ready" disabled>${t("Bereit")}</button></div>
      <p class="note" id="fv-status">${t("Verbinde mit dem Raum …")}</p>
    </div>`;
  const linkBox = panel.querySelector("#fv-room-link");
  linkBox.value = link;
  const copy = panel.querySelector("#fv-copy");
  copy.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(link);
      copy.textContent = t("Kopiert");
    } catch {
      linkBox.select();
    }
  });
  const nameBox = panel.querySelector("#fv-name");
  nameBox.value = savedName() || `Lachs ${Math.floor(10 + Math.random() * 90)}`;
  nameBox.addEventListener("change", () => {
    const name = nameBox.value.trim().slice(0, 16) || "Lachs";
    nameBox.value = name;
    keepName(name);
    net.rename(name);
  });
  const readyButton = panel.querySelector("#fv-ready");
  const status = panel.querySelector("#fv-status");
  const seatsList = panel.querySelector("#fv-seats");
  let ready = false,
    started = false,
    startAt = 0,
    worldReady = false,
    hatched = false;
  readyButton.addEventListener("click", () => {
    ready = !ready;
    net.send({ t: "ready", ready });
    readyButton.textContent = ready ? t("Doch nicht") : t("Bereit");
  });

  net.on("status", (n) => {
    if (n.state === "connecting") status.textContent = t("Verbinde mit dem Raum …");
    if (n.state === "refused") status.textContent = t("Der Raum ist voll: vier spielen schon.");
    if (n.state === "replaced") status.textContent = t("Du spielst in diesem Raum schon in einem anderen Fenster.");
  });
  net.on("welcome", (m) => {
    readyButton.disabled = false;
    status.textContent = m.version && m.version !== VERSION ? t("Ihr habt verschiedene Versionen: bitte alle neu laden.") : t("Wenn alle bereit sind, geht es los.");
    if (m.started) {
      started = true;
      startAt = m.startAt;
      status.textContent = t("Das Spiel läuft schon: du steigst gleich ein.");
    }
  });
  net.on("lobby", (m) => {
    seatsList.replaceChildren();
    for (const s of m.seats) {
      const li = document.createElement("li");
      if (!s.connected) li.className = "away";
      const dot = document.createElement("i");
      dot.style.background = SEAT_COLOURS[s.seat] ?? "#fff";
      const who = document.createElement("span");
      who.textContent = s.name + (s.seat === net.seat ? ` (${t("du")})` : "") + (s.seat === m.host ? ` · ${t("Gastgeber")}` : "");
      const state = document.createElement("span");
      state.className = "state";
      state.textContent = !s.connected ? t("weg") : s.version && s.version !== VERSION ? t("andere Version") : s.ready ? t("bereit") : t("wartet");
      li.append(dot, who, state);
      seatsList.appendChild(li);
    }
  });
  net.on("start", (m) => {
    started = true;
    startAt = m.at;
    status.textContent = t("Gleich geht es los!");
  });
  // The day's hour: the host's, followed by the others.
  net.on("ev", (m) => {
    if (m.k === "hour" && m.seat === net.host && net.seat !== net.host && Number.isFinite(m.h)) {
      const mine = game.daylight.state.hour;
      let d = m.h - mine;
      if (d > 12) d -= 24;
      if (d < -12) d += 24;
      if (Math.abs(d) > HOUR_SLACK) game.daylight.setHour(m.h);
    }
  });
  net.join(code, nameBox.value);

  // The countdown, and the start of the game at the room's moment (once this page's river
  // is built: the start button says so by coming on).
  const countdown = document.createElement("div");
  countdown.id = "fv-countdown";
  countdown.hidden = true;
  document.body.appendChild(countdown);
  function tick() {
    worldReady = !!start && !start.disabled;
    if (started && !hatched) {
      const left = (startAt - net.now()) / 1000;
      if (left > 0) {
        countdown.hidden = false;
        countdown.textContent = String(Math.ceil(left));
      } else if (worldReady) {
        countdown.hidden = true;
        hatched = true;
        panel.classList.add("hatched");
        start.click();
      } else {
        countdown.hidden = true;
        status.textContent = t("Der Fluss entsteht noch …");
      }
    }
    if (!hatched) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  // The others on the map (the base game's minimap draws what it is handed as `others`).
  const minimap = game.minimap;
  if (minimap?.update) {
    const update = minimap.update;
    minimap.update = function (dt, options) {
      if (options) options.others = mates.others();
      return update.call(this, dt, options);
    };
  }

  let hourClock = 0,
    placed = false;
  const along = {};
  return {
    active: true,
    net,
    mates,
    // Each step of the world: our fish out to the others, and the hour if we are the host.
    step(dt, local) {
      if (!hatched) return;
      // (All hatch side by side: each place a little across the gravel from the next.)
      if (!placed && net.seat !== null) {
        placed = true;
        const f = local.fish;
        riverFrame(f.river.s, along);
        const across = (net.seat - 1.5) * 0.45;
        f.position.x += -along.tz * across;
        f.position.z += along.tx * across;
      }
      mates.send(local);
      hourClock += dt;
      if (net.seat === net.host && hourClock > HOUR_EVERY) {
        hourClock = 0;
        net.send({ t: "ev", k: "hour", h: Math.round(game.daylight.state.hour * 1000) / 1000 });
      }
    },
    frame(dt) {
      mates.frame(dt);
    },
  };
}
