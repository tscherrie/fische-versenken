// What Extreme adds to the title card. The base game lays the card out itself (index.html,
// style.css, intro.js) and leaves room for an extension: a place under the start and rows
// among the settings. Extreme puts the co-op in that place (the offer to open a room, or the
// room) and the difficulty first among the settings; it adds the shooting to the keys and
// takes the vegan switch out, as there is no vegan mode here (wild.js). In a co-op room the
// card changes a little: no line about the game, the lobby where the start would be, and in
// the pause neither the saved stage nor "new game", as a game swum together is never saved.
//
// All of it is done as this module is read (layOutCard, called by extreme.js), before the
// game puts the card up, so that the card goes up as it is meant to look. Only the graphics
// steps' tooltips wait for init (finishCard): the game builds its picker as it starts.

import "./i18n.js";
import { t } from "../i18n.js";
import { settingsRow } from "../intro.js";
import { coopPanel } from "./coop.js";
import { difficultyRow } from "./difficulty.js";

const CSS = `
/* In a room: no line about the game, and no saved stage or "new game" under the start. In
   the lobby the room stands where the start would: the start is left out, its emptied place
   keeps its distance under the title, and the room follows it with none of its own. */
#intro.fv-in-room .lead, #intro.fv-in-room .sub, #intro.fv-in-room:not(.paused) #intro-start { display: none; }
#intro.fv-in-room:not(.paused) .extension { margin-top: 0; }
/* The offer to open a room belongs to the start and sits close under it; the room in the
   pause stands a little further off. */
#intro:not(.fv-in-room) .extension { margin-top: 12px; }
.touch #intro:not(.fv-in-room) .extension { margin-top: 8px; }
.touch #intro.fv-in-room.paused .extension { margin-top: 12px; }
/* Sideways on a phone the base card is drawn tighter so that it fits the screen; the offer
   follows, a little closer under the start and a little lower (coop.js), or it alone would
   make the card scroll. */
@media (max-height: 500px) {
  .touch #intro:not(.fv-in-room) .extension { margin-top: 6px; }
}
`;

// Adds Extreme's parts to the card; once, as the page loads (see above).
let done = false;
export function layOutCard() {
  if (done || typeof document === "undefined") return;
  const intro = document.querySelector("#intro");
  if (!intro) return;
  done = true;
  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);

  // The co-op right under the start (in a room, coop.js has marked the card fv-in-room).
  const coop = coopPanel();
  if (coop) intro.querySelector("#intro-extension")?.append(coop);

  // The difficulty, the first of the settings, a row of buttons like the ones below it; and
  // no vegan switch.
  settingsRow("Schwierigkeit", difficultyRow(), { first: true });
  intro.querySelector("#intro-vegan")?.closest(".row")?.remove();

  // The shooting among the keys, after the dodge (in as few words as the mouse's entry, so
  // that the list keeps to two short lines in every language). The page translates it with
  // the base game's keys.
  const keys = intro.querySelector(".keys:not(.touch-keys)");
  if (keys) {
    const item = document.createElement("li");
    item.innerHTML = `<span class="mouse" aria-hidden="true"></span> Linksklick: schießen`;
    keys.insertBefore(item, keys.children[3] ?? null);
  }
}

// At init, once the game has built the graphics picker: in a co-op room a switch starts the
// fish afresh (the solo save is never written there), so the steps' tooltips no longer say
// that it stays saved. (The page is built in one language: a switch reloads it.)
export function finishCard() {
  const intro = document.querySelector("#intro.fv-in-room");
  if (!intro) return;
  const saved = t("Ein Wechsel lädt das Spiel neu – dein Lachs bleibt gespeichert.");
  const plain = t("Ein Wechsel lädt das Spiel neu.");
  for (const option of intro.querySelectorAll(".settings .quality-picker .option")) option.title = option.title.replace(saved, plain);
}
