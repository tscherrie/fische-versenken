// Co-op (plan, part 5), the part that runs in the page: the lobby on the title card, the
// start for everyone at once, the others in the river (mates.js), the one clock of the day.
//
// Without ?room the title card only offers to open a room: that asks the room service for
// a code and comes back to the page with ?room=<code>&new (a fresh brood at the spring: a
// game swum together never starts from the solo save, and never writes it either). With
// ?room the card shows the room: its code (a click copies the link to send), the players
// (their places' colours, who is ready), a nickname and a ready button in place of the
// start button. When everyone in the room is ready the room counts down, and at its moment
// every page starts its game -- all hatch together in the gravel of the spring. Coming back
// into a room that is already under way starts at once. Once hatched, the pause shows only
// the code and the players: the rest has done its work. (The panel sits in the base card's
// place for an extension, under the start; what else a room changes on the card is
// card.js's.)
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

// The panel's own look; its place on the card and the card's rhythm are the base card's and
// card.js's. (The card's rule for all its buttons -- the big start pill -- is undone for
// these.)
const CSS = `
#intro .fv-coop { display: grid; gap: 8px; text-align: left; }
#intro .fv-coop button { min-width: 0; font: 700 13px/1 var(--hud-font); box-shadow: none; }
#intro .fv-coop button:hover:not(:disabled) { transform: none; }
#intro .fv-coop .fv-open { width: 100%; height: 36px; padding: 0 16px; border-radius: 999px; color: inherit; background: rgba(255, 255, 255, 0.07); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.16); opacity: 0.9; }
#intro .fv-coop .fv-open:hover:not(:disabled) { background: rgba(255, 255, 255, 0.12); opacity: 1; }
/* (Sideways on a phone, where the card's rows are lower too, so that the card fits: card.js.) */
@media (max-height: 500px) { .touch #intro .fv-coop .fv-open { height: 30px; } }
#intro .fv-coop .room { display: grid; gap: 12px; padding: 12px 16px 14px; border-radius: 14px; background: rgba(255, 255, 255, 0.05); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.1); }
#intro .fv-coop .head { display: flex; align-items: center; gap: 4px; min-height: 28px; }
#intro .fv-coop .head .title { flex: 1; min-width: 0; font-size: 12px; font-weight: 700; opacity: 0.6; }
#intro .fv-coop .code { height: 28px; padding: 0 8px; border-radius: 8px; font: 700 16px/1 ui-monospace, "SF Mono", Menlo, monospace; letter-spacing: 0.14em; color: inherit; background: none; }
#intro .fv-coop .copy { display: inline-flex; align-items: center; justify-content: center; gap: 6px; height: 28px; min-width: 28px; padding: 0 7px; border-radius: 8px; color: inherit; background: rgba(255, 255, 255, 0.08); }
#intro .fv-coop .code:hover, #intro .fv-coop .copy:hover { background: rgba(255, 255, 255, 0.14); }
#intro .fv-coop .copy svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; }
#intro .fv-coop .copy .done { display: none; font-size: 12px; }
#intro .fv-coop .copy.copied { color: #8fe3c0; }
#intro .fv-coop .copy.copied .done { display: inline; }
#intro .fv-coop ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 6px; }
#intro .fv-coop li { display: grid; grid-template-columns: 10px minmax(0, 1fr) auto; gap: 10px; align-items: center; font-size: 13.5px; font-weight: 700; }
#intro .fv-coop li i { width: 10px; height: 10px; border-radius: 50%; }
#intro .fv-coop li .who { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
#intro .fv-coop li .state { font-size: 12px; font-weight: 600; opacity: 0.65; }
#intro .fv-coop li.away { opacity: 0.5; }
#intro .fv-coop .me { display: flex; gap: 8px; }
#intro .fv-coop .me input { flex: 1; min-width: 0; height: 36px; box-sizing: border-box; padding: 0 12px; border-radius: 999px; border: 0; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.18); background: rgba(0, 0, 0, 0.25); color: inherit; font: 600 14px/1 var(--hud-font); }
#intro .fv-coop .me input:focus-visible { outline: 3px solid #ffd98a; outline-offset: 2px; }
.touch #intro .fv-coop .me input { font-size: 16px; }
#intro .fv-coop .me button { flex: none; height: 36px; padding: 0 20px; border-radius: 999px; font-size: 14px; font-weight: 800; }
#intro .fv-coop .me button.on { color: inherit; background: rgba(255, 255, 255, 0.08); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.2); }
#intro .fv-coop .fv-note { margin: 0; font-size: 12px; line-height: 1.4; opacity: 0.7; }
#intro .fv-coop .warn { color: #ffb08a; opacity: 1; }
#intro .fv-coop.hatched .me, #intro .fv-coop.hatched #fv-status, #intro .fv-coop.hatched li .state.lobby { display: none; }
#fv-countdown { position: fixed; inset: 0; display: grid; place-items: center; z-index: 50; pointer-events: none; font: 800 clamp(64px, 14vw, 160px)/1 var(--hud-font, var(--font-body)); color: #fff4ea; text-shadow: 0 4px 30px rgba(0,0,0,0.6); }
#fv-countdown[hidden] { display: none; }
`;

// The room's code in the address (six of the characters the room service hands out), or "".
function roomCode() {
  const code = (new URLSearchParams(location.search).get("room") ?? "").toUpperCase();
  return /^[A-Z2-9]{6}$/.test(code) ? code : "";
}
// The room service: ?rooms=<url> in the address (one run locally), else the live one.
const service = () => new URLSearchParams(location.search).get("rooms") || ROOMS;
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

// The panel on the title card: without a room the offer to open one (a quiet button under
// the start; what it is for goes in its tooltip, so the card carries one line less), in a
// room the room -- its code, the players, a name and the ready button. It is built once,
// when card.js adds it to the card as the page loads, so that it is on the card from its
// first frame, and in a room the lead and the start button never are; createCoop brings it
// to life at init. It is null where there is no room service to offer.
let built;
export function coopPanel() {
  if (built !== undefined) return built;
  built = null;
  if (typeof document === "undefined" || !service()) return built;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  const panel = document.createElement("div");
  panel.className = "fv-coop";
  const code = roomCode();
  if (!code) {
    panel.innerHTML = `<button class="fv-open" type="button" title="${t("Zu zweit bis zu viert spielen")}">${t("Koop-Raum eröffnen")}</button><p class="fv-note warn" hidden></p>`;
  } else {
    document.querySelector("#intro")?.classList.add("fv-in-room");
    panel.innerHTML = `
    <div class="room">
      <div class="head"><span class="title">${t("Koop-Raum")}</span><button class="code" type="button" title="${t("Link kopieren")}">${code}</button><button class="copy" type="button" id="fv-copy" title="${t("Link kopieren")}" aria-label="${t("Link kopieren")}"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="8.5" y="8.5" width="11" height="11" rx="2.5" /><path d="M15.5 8.5V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7.5a2 2 0 0 0 2 2h2.5" /></svg><span class="done">${t("Kopiert")}</span></button></div>
      <ul id="fv-seats"></ul>
      <div class="me"><input id="fv-name" type="text" maxlength="16" autocomplete="nickname" aria-label="${t("Dein Name")}" placeholder="${t("Dein Name")}"><button type="button" id="fv-ready" disabled>${t("Bereit")}</button></div>
      <p class="fv-note" id="fv-status">${t("Verbinde mit dem Raum …")}</p>
    </div>`;
    panel.querySelector("#fv-name").value = savedName() || `${t("Lachs")} ${Math.floor(10 + Math.random() * 90)}`;
  }
  built = panel;
  return built;
}

export function createCoop(game) {
  const { query, habitat } = game;
  const code = roomCode();
  const base = service();
  const panel = coopPanel();
  // (No room service yet: nothing of co-op shows.)
  if (!panel) return { active: false, step() {}, frame() {} };
  const start = habitat.querySelector("#intro-start");

  // ---- No room: the offer, which asks the room service for a code and comes back with it.
  if (!code) {
    const button = panel.querySelector(".fv-open");
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
  // A game swum together never writes the solo save.
  if (game.save) game.save.store = () => {};
  const net = createNet({ base, version: VERSION, player: query.get("player") ?? "" });
  const mates = createMates(game, net);
  const link = `${location.origin}${location.pathname}?room=${code}&new`;
  // The link to send: copied by the button beside the code, or by the code itself. (Where
  // the clipboard is closed to the page, the old way through a selected text; the code
  // itself can still be read out.)
  const copy = panel.querySelector("#fv-copy");
  let copiedTimer = 0;
  async function copyLink() {
    let done = false;
    try {
      await navigator.clipboard.writeText(link);
      done = true;
    } catch {
      const area = document.createElement("textarea");
      area.value = link;
      area.setAttribute("readonly", "");
      area.style.cssText = "position: fixed; opacity: 0; pointer-events: none;";
      document.body.appendChild(area);
      area.select();
      try {
        done = document.execCommand("copy");
      } catch {}
      area.remove();
    }
    if (!done) return;
    copy.classList.add("copied");
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => copy.classList.remove("copied"), 1600);
  }
  copy.addEventListener("click", copyLink);
  panel.querySelector(".code").addEventListener("click", copyLink);
  const nameBox = panel.querySelector("#fv-name");
  nameBox.addEventListener("change", () => {
    const name = nameBox.value.trim().slice(0, 16) || t("Lachs");
    nameBox.value = name;
    keepName(name);
    net.rename(name);
  });
  const readyButton = panel.querySelector("#fv-ready");
  const status = panel.querySelector("#fv-status");
  // The line under the room says only what is needed now; empty, it takes no room.
  const say = (text) => {
    status.textContent = text;
    status.hidden = !text;
  };
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
    readyButton.classList.toggle("on", ready);
  });

  net.on("status", (n) => {
    if (n.state === "connecting") say(t("Verbinde mit dem Raum …"));
    if (n.state === "refused") say(t("Der Raum ist voll: vier spielen schon."));
    if (n.state === "replaced") say(t("Du spielst in diesem Raum schon in einem anderen Fenster."));
  });
  net.on("welcome", (m) => {
    readyButton.disabled = false;
    say(m.version && m.version !== VERSION ? t("Ihr habt verschiedene Versionen: bitte alle neu laden.") : t("Wenn alle bereit sind, geht es los."));
    if (m.started) {
      started = true;
      startAt = m.startAt;
      say(t("Das Spiel läuft schon: du steigst gleich ein."));
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
      who.className = "who";
      who.textContent = s.name + (s.seat === net.seat ? ` (${t("du")})` : "") + (s.seat === m.host ? ` · ${t("Gastgeber")}` : "");
      const state = document.createElement("span");
      state.className = "state";
      state.textContent = !s.connected ? t("weg") : s.version && s.version !== VERSION ? t("andere Version") : s.ready ? t("bereit") : t("wartet");
      // (Who is ready matters only until the start; who is away, or on another version, stays.)
      if (s.connected && !(s.version && s.version !== VERSION)) state.classList.add("lobby");
      li.append(dot, who, state);
      seatsList.appendChild(li);
    }
  });
  net.on("start", (m) => {
    started = true;
    startAt = m.at;
    // (The countdown says it from here on.)
    say("");
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
        say(t("Der Fluss entsteht noch …"));
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
