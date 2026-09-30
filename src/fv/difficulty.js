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

// The level in use: the one kept in the browser, else Normal.
let level = LEVELS[1];
try {
  level = LEVELS.find((l) => l.id === localStorage.getItem(KEY)) ?? level;
} catch {}

// On the title card, where the vegan switch was: the three levels as one row of buttons
// (a .seg, which the card's settings give the look of their other rows), each level's line
// in its tooltip. card.js adds it among the settings as the page loads, with its label, so
// it carries no heading of its own.
let row = null;
export function difficultyRow() {
  if (row || typeof document === "undefined") return row;
  row = document.createElement("div");
  row.className = "fv-difficulty seg";
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
  return row;
}

// What combat reads each step.
export function createDifficulty() {
  return {
    get level() {
      return level;
    },
  };
}
