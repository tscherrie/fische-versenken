// The title card, tidied (the user asked for a minimal one). The base game's card (index.html,
// intro.js) is added to by the combat (a key, the difficulty) and the co-op (the room), and
// each part used to bring its own heading, its own line of text and its own box. Here the
// card is laid out once, from the top: the kicker and the title; the line about the game only
// on a fresh first card; the start button, with the saved stage and "new game" in one quiet
// line under it; the co-op (the offer, or the room); the settings -- difficulty, graphics,
// language -- as three rows of the same buttons, each beside its label; the keys, small, at
// the bottom; GitHub and the version in one line. What the notes and the captions said goes
// into tooltips. Nothing in the base files changes: its nodes are moved (the base game finds
// them by id and class, wherever they sit) and the look is laid over in a style of its own.

import { t } from "../i18n.js";
import { QUALITIES } from "../intro.js";
import { VERSION } from "../version.js";

// Every rule starts with `#habitat #intro.fv-card`: two ids and a class, so it outweighs the
// base card's rules, the ones for short screens included, without !important.
const CSS = `
#habitat #intro.fv-card .card { box-sizing: border-box; width: min(34em, 100%); padding: 28px 24px 20px; }
#habitat #intro.fv-card .kicker { margin: 0 0 6px; font-size: 12px; }
#habitat #intro.fv-card h1 { margin: 0; font-size: clamp(32px, 6vw, 44px); }
#habitat #intro.fv-card.paused h1 { font-size: clamp(24px, 4.5vw, 30px); }
#habitat #intro.fv-card .lead { max-width: 28em; margin: 12px auto 0; font-size: 15px; line-height: 1.45; opacity: 0.85; }
#habitat #intro.fv-card.paused .lead, #habitat #intro.fv-card.fv-in-room .lead { display: none; }
#habitat #intro.fv-card .homescreen { margin: 16px 0 0; }
#habitat #intro.fv-card:not(.phone) .for-desktop { display: flex; flex-direction: column; gap: 24px; margin-top: 24px; }
#habitat #intro.fv-card .for-desktop > .note { display: none; }

/* The start, and under it the saved stage and the way to start afresh. */
#habitat #intro.fv-card .fv-primary { display: grid; }
#habitat #intro.fv-card.fv-in-room:not(.paused) .fv-primary { display: none; }
#habitat #intro.fv-card #intro-start { width: 100%; min-width: 0; height: 52px; padding: 0 24px; }
#habitat #intro.fv-card #intro-start:hover:not(:disabled) { transform: translateY(-1px); }
#habitat #intro.fv-card #intro-start:focus-visible { outline-width: 2px; outline-offset: 2px; }
#habitat #intro.fv-card .fv-sub { display: flex; flex-wrap: wrap; justify-content: center; align-items: baseline; column-gap: 16px; font-size: 12.5px; font-weight: 600; }
#habitat #intro.fv-card .fv-sub > * { margin: 8px 0 0; }
#habitat #intro.fv-card #intro-status { min-height: 0; font-size: inherit; font-weight: inherit; color: inherit; opacity: 0.65; }
#habitat #intro.fv-card #intro-status:empty { display: none; }
#habitat #intro.fv-card #intro-new { padding: 0; font: inherit; opacity: 0.65; }
#habitat #intro.fv-card #intro-new:hover { opacity: 1; }
/* The co-op close under the start (the offer, or the room once swimming); in the lobby the
   room stands where the start would. */
#habitat #intro.fv-card:not(.fv-in-room) .fv-coop { margin-top: -12px; }
#habitat #intro.fv-card.fv-in-room.paused .fv-coop { margin-top: -8px; }

/* The settings: a label on the left, its row of buttons on the right. */
#habitat #intro.fv-card .fv-settings { display: grid; grid-template-columns: max-content minmax(0, 1fr); align-items: center; gap: 8px 16px; text-align: left; }
#habitat #intro.fv-card .fv-label { margin: 0; font-size: 12px; font-weight: 700; opacity: 0.6; }
#habitat #intro.fv-card .quality-slot { max-width: none; margin: 0; padding: 0; border-radius: 0; background: none; }
#habitat #intro.fv-card .quality-picker { display: block; }
#habitat #intro.fv-card .quality-picker .head,
#habitat #intro.fv-card .quality-picker .about,
#habitat #intro.fv-card .quality-picker .option small { display: none; }
#habitat #intro.fv-card .fv-seg { display: flex; gap: 2px; margin: 0; padding: 3px; border-radius: 11px; background: rgba(0, 0, 0, 0.22); box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08); }
#habitat #intro.fv-card .fv-seg button { position: relative; display: flex; align-items: center; justify-content: center; flex: 1 1 0; min-width: max-content; height: 30px; margin: 0; padding: 0 8px; border: 0; border-radius: 8px; font: 700 12.5px/1 var(--hud-font); color: inherit; background: none; box-shadow: none; opacity: 0.7; transform: none; filter: none; white-space: nowrap; cursor: pointer; }
#habitat #intro.fv-card .fv-seg button b { font: inherit; }
#habitat #intro.fv-card .fv-seg button:hover:not(:disabled) { background: rgba(255, 255, 255, 0.08); opacity: 1; transform: none; }
#habitat #intro.fv-card .fv-seg button:focus-visible { outline: 2px solid #ffd98a; outline-offset: 1px; }
#habitat #intro.fv-card .fv-seg button[aria-pressed="true"] { background: rgba(160, 235, 200, 0.2); box-shadow: inset 0 0 0 1px rgba(160, 235, 200, 0.55); opacity: 1; cursor: default; }
/* The graphics step recommended for this kind of device: a small star in its corner (the
   word stays for a screen reader, its tooltip says it). */
#habitat #intro.fv-card .fv-seg .tag { position: absolute; top: 3px; right: 4px; left: auto; padding: 0; font-size: 0; line-height: 1; background: none; box-shadow: none; transform: none; }
#habitat #intro.fv-card .fv-seg .tag::after { content: "★"; font-size: 8px; color: #ffd98a; }
/* Picked, the step loads the game afresh: it lights up, the others wait. */
#habitat #intro.fv-card .quality-picker.busy .option { opacity: 0.35; cursor: progress; }
#habitat #intro.fv-card .quality-picker.busy .option.picked { opacity: 1; color: #06232a; background: linear-gradient(180deg, #b6f7a0, #3fd0a0); box-shadow: none; animation: fv-card-busy 700ms ease-in-out infinite alternate; }
@keyframes fv-card-busy { to { filter: brightness(1.15); } }

/* The keys: small and quiet, at the bottom. */
#habitat #intro.fv-card .keys { gap: 6px 14px; margin: 0; font-size: 12px; font-weight: 600; opacity: 0.6; }
#habitat #intro.fv-card .keys li { gap: 5px; }
#habitat #intro.fv-card .keys li.fv-in-corner { display: none; }
#habitat #intro.fv-card .keys kbd:not(.touch-key) { padding: 1px 5px; border-radius: 5px; font-size: 10.5px; }
#habitat #intro.fv-card .keys .mouse { width: 9px; height: 13px; border-width: 1.5px; border-radius: 5px; }
#habitat #intro.fv-card .keys .mouse::after { top: 2px; height: 3px; }
#habitat #intro.fv-card .keys kbd.touch-key { width: 18px; height: 18px; }

/* GitHub and the version, one line. */
#habitat #intro.fv-card .fv-foot { display: flex; flex-wrap: wrap; justify-content: center; align-items: center; gap: 2px 8px; margin-top: 16px; font-size: 11px; font-weight: 700; opacity: 0.5; }
#habitat #intro.fv-card .fv-foot .links, #habitat #intro.fv-card .fv-foot .version { margin: 0; font-size: inherit; letter-spacing: 0.02em; opacity: 1; }
#habitat #intro.fv-card .fv-foot .links a { gap: 5px; border: 0; padding: 0; opacity: 1; }
#habitat #intro.fv-card .fv-foot .links a:hover { text-decoration: underline; }
#habitat #intro.fv-card .fv-foot .links svg { width: 12px; height: 12px; }
#habitat #intro.fv-card .fv-foot .version::before { content: "·"; margin-right: 8px; }

/* Narrow: each label over its row, and the buttons in a row as wide as their words need
   (five languages side by side leave no room for equal widths). */
@media (max-width: 520px) {
  #habitat #intro.fv-card .card { padding: 20px 16px 16px; }
  #habitat #intro.fv-card .fv-settings { grid-template-columns: minmax(0, 1fr); gap: 4px; }
  #habitat #intro.fv-card .fv-label:not(:first-child) { margin-top: 8px; }
  #habitat #intro.fv-card .fv-seg { flex-wrap: nowrap; }
  #habitat #intro.fv-card .fv-seg button { flex: 1 1 auto; min-width: 0; padding: 0 6px; }
}
/* Touch: sideways on a phone the card is short, so everything sits a little closer. */
#habitat.touch #intro.fv-card .card { padding: 18px 20px 14px; }
#habitat.touch #intro.fv-card h1 { font-size: clamp(26px, 5vw, 36px); }
#habitat.touch #intro.fv-card.paused h1 { font-size: 24px; }
#habitat.touch #intro.fv-card .lead { font-size: 14px; }
#habitat.touch #intro.fv-card .for-desktop { gap: 16px; margin-top: 16px; }
#habitat.touch #intro.fv-card #intro-start { height: 46px; }
#habitat.touch #intro.fv-card:not(.fv-in-room) .fv-coop { margin-top: -8px; }
#habitat.touch #intro.fv-card.fv-in-room.paused .fv-coop { margin-top: -4px; }
/* Sideways on a phone the corner buttons' labels reach in from the right: the card keeps
   clear of them as far as the screen allows. */
@media (max-height: 500px) {
  #habitat.touch #intro.fv-card .card { width: clamp(400px, 100vw - 392px, 34em); }
  #habitat.touch #intro.fv-card .fv-seg { flex-wrap: nowrap; }
  #habitat.touch #intro.fv-card .fv-seg button { flex: 1 1 auto; min-width: 0; padding: 0 6px; }
}
`;

export function tidyCard({ habitat, touchMode }) {
  const intro = habitat.querySelector("#intro");
  const body = intro?.querySelector(".for-desktop");
  const start = body?.querySelector("#intro-start");
  if (!start) return;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  intro.classList.add("fv-card");
  const make = (tag, className, text) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text) node.textContent = text;
    return node;
  };

  // The start, with the saved stage and "new game" in one line under it.
  const primary = make("div", "fv-primary");
  const sub = make("div", "fv-sub");
  start.before(primary);
  primary.append(start, sub);
  for (const id of ["#intro-status", "#intro-new"]) {
    const node = body.querySelector(id);
    if (node) sub.append(node);
  }
  // The co-op right under it.
  const coop = body.querySelector(".fv-coop");
  if (coop) primary.after(coop);

  // The settings, each row beside its label. The graphics picker (intro.js) and the
  // language chips keep their own markup and behaviour; they only take the rows' look.
  const settings = make("div", "fv-settings");
  (coop ?? primary).after(settings);
  const row = (label, control) => {
    if (!control) return;
    control.classList.add("fv-seg");
    settings.append(make("p", "fv-label", t(label)), control.closest(".quality-slot") ?? control);
  };
  row("Schwierigkeit", body.querySelector(".fv-difficulty"));
  row("Grafik", body.querySelector(".quality-picker .options"));
  row("Sprache", intro.querySelector(".langs"));
  // What the graphics steps said in their captions, the line under them and the badge goes
  // into each step's tooltip. (The page is built in one language: a switch reloads it, and
  // these are set again then.)
  const reloads = t("Ein Wechsel lädt das Spiel neu – dein Lachs bleibt gespeichert.");
  for (const option of settings.querySelectorAll(".quality-picker .option")) {
    const quality = QUALITIES.find((q) => q.id === option.dataset.quality);
    if (!quality) continue;
    const lines = [t((touchMode && quality.aboutTouch) || quality.about)];
    if (option.classList.contains("recommended")) lines.push(t("Empfohlen für dieses Gerät."));
    lines.push(reloads);
    option.title = lines.join("\n");
  }

  // The keys at the bottom. The map's and the logbook's are left out: their buttons stand
  // in the corner, with their keys on them, whenever the card is up.
  settings.after(...body.querySelectorAll(".keys"));
  for (const item of body.querySelectorAll(".keys li")) {
    const keys = [...item.querySelectorAll("kbd")];
    if (keys.some((k) => k.textContent === "M" || k.classList.contains("map"))) item.classList.add("fv-in-corner");
  }

  // GitHub and the version, one line at the foot.
  const foot = make("div", "fv-foot");
  const links = intro.querySelector(".links");
  const version = intro.querySelector(".version");
  intro.querySelector(".card").append(foot);
  if (links) {
    const link = links.querySelector("a");
    const label = link?.querySelector("span");
    if (link) link.title = t("Mitmachen / Feedback auf GitHub");
    if (label) label.textContent = "GitHub";
    foot.append(links);
  }
  if (version) {
    version.textContent = VERSION === "dev" ? t("Entwicklungsversion") : VERSION;
    foot.append(version);
  }
}
