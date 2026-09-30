// Difficulty, in the place of the base game's vegan mode (plan, part 2): Tourist for whoever
// just wants to look round with a gun, Normal as the game is meant, Serious for more and
// harder enemies. It is picked on the title card, kept in the browser, and read each step:
// how much of a strike or a shot reaches the fish, whether a big fish can swallow it whole,
// how many enemies come, and how much it takes to sink them. (In co-op each player will
// have their own.)

import { t } from "../i18n.js";

const KEY = "extreme-difficulty";
export const LEVELS = [
  { id: "tourist", name: "Tourist", line: "Die Gegner treffen kaum, verschluckt wirst du nicht.", taken: 0.4, count: 0.7, hp: 0.8, swallow: false },
  { id: "normal", name: "Normal", line: "So, wie es gedacht ist.", taken: 1, count: 1, hp: 1, swallow: true },
  { id: "serious", name: "Serious", line: "Mehr Gegner, die härter zuschlagen und mehr aushalten.", taken: 1.5, count: 1.4, hp: 1.3, swallow: true },
];

export function createDifficulty(habitat) {
  let id = "normal";
  try {
    id = localStorage.getItem(KEY) ?? id;
  } catch {}
  let level = LEVELS.find((l) => l.id === id) ?? LEVELS[1];

  // On the title card, where the vegan switch was: the three levels as one row of buttons,
  // their line in the tooltip. The card (card.js) gives the row its label and its place
  // among the settings, so it carries no heading of its own. The words go through t() here
  // as they are made, so they are in the page's language from the first frame on.
  const start = habitat.querySelector("#intro-start");
  if (start) {
    const row = document.createElement("div");
    row.className = "fv-difficulty";
    row.setAttribute("role", "group");
    row.setAttribute("aria-label", t("Schwierigkeit"));
    const buttons = LEVELS.map((l) => {
      const button = document.createElement("button");
      button.type = "button";
      button.textContent = t(l.name);
      button.title = t(l.line);
      button.addEventListener("click", () => pick(l));
      row.appendChild(button);
      return button;
    });
    const pick = (l) => {
      level = l;
      try {
        localStorage.setItem(KEY, l.id);
      } catch {}
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LEVELS[i] === l)));
    };
    pick(level);
    start.parentNode.insertBefore(row, start);
  }

  return {
    get level() {
      return level;
    },
  };
}
