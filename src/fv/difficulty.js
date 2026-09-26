// Difficulty, in the place of the base game's vegan mode (plan, part 2): Tourist for whoever
// just wants to look round with a gun, Normal as the game is meant, Serious for more and
// harder enemies. It is picked on the title card, kept in the browser, and read each step:
// how much of a strike or a shot reaches the fish, whether a big fish can swallow it whole,
// how many enemies come, and how much it takes to sink them. (In co-op each player will
// have their own.)

const KEY = "extreme-difficulty";
export const LEVELS = [
  { id: "tourist", name: "Tourist", line: "Die Gegner treffen kaum, verschluckt wirst du nicht.", taken: 0.4, count: 0.7, hp: 0.8, swallow: false },
  { id: "normal", name: "Normal", line: "So, wie es gedacht ist.", taken: 1, count: 1, hp: 1, swallow: true },
  { id: "serious", name: "Serious", line: "Mehr Gegner, die härter zuschlagen und mehr aushalten.", taken: 1.5, count: 1.4, hp: 1.3, swallow: true },
];

const CSS = `
#intro .fv-difficulty { margin: 0 auto 16px; max-width: 30em; }
#intro .fv-difficulty .options { grid-template-columns: repeat(3, minmax(0, 1fr)); }
`;

export function createDifficulty(habitat) {
  let id = "normal";
  try {
    id = localStorage.getItem(KEY) ?? id;
  } catch {}
  let level = LEVELS.find((l) => l.id === id) ?? LEVELS[1];

  const style = document.createElement("style");
  style.textContent = CSS;
  document.head.appendChild(style);
  // On the title card, where the vegan switch was, in the look of the graphics picker.
  const start = habitat.querySelector("#intro-start");
  if (start) {
    const box = document.createElement("div");
    box.className = "quality-picker fv-difficulty";
    box.innerHTML = `<p class="head"><b>Schwierigkeit</b></p><div class="options"></div><p class="about"></p>`;
    const options = box.querySelector(".options");
    const about = box.querySelector(".about");
    const buttons = LEVELS.map((l) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option";
      button.innerHTML = `<b>${l.name}</b>`;
      button.addEventListener("click", () => pick(l));
      options.appendChild(button);
      return button;
    });
    const pick = (l) => {
      level = l;
      try {
        localStorage.setItem(KEY, l.id);
      } catch {}
      buttons.forEach((b, i) => b.setAttribute("aria-pressed", String(LEVELS[i] === l)));
      about.textContent = l.line;
    };
    pick(level);
    start.parentNode.insertBefore(box, start);
  }

  return {
    get level() {
      return level;
    },
  };
}
