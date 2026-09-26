# Combat bench: webgpu, eco

apple metal-3 · WebGPU · quality eco (light pools) · canvas 1280×720, scene drawn at 1280×720 · one step of 50.0 ms per frame · 5 repeats of 120 frames · three r186 · clock step 0.1 ms

Place: s 2503.5, u 0, water 11.98 u deep, a parr of 1 u; camera fixed behind and above it. The fight is kept at 40 enemies, 150 players' shots and 60 enemy shots in flight, topped up before every step; 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a rate a fight of four players might see. Without the fight, combat's step and frame are not run at all.

Held in the first repeat (mean, min–max per frame): enemies alive 38 (36–40), dead ones 7 (2–12), players' shots 138 (116–149), enemy shots flying 58 (32–71), spent and sinking 32 (19–58), lying on the bed 0 (0–0), glow points 293 (253–352), bubbles 240 (240–240); 49 hits and 4.5 kills a second, and 238 players' shots fired a second to keep their number up (medians of the repeats).

## Fight minus no fight

|  | no fight | fight | difference | difference over the repeats |
|---|---:|---:|---:|---:|
| Card: combat's meshes, shown against hidden (ms) | – | – | +0.587 | 0.362 … 1.850 |
| Card: whole fight against no fight, back to back (ms) | 11.25 | 11.23 | −0.02 | -3.28 … 1.51 |
| Whole frames back to back, script and card (ms) | 10.65 | 11.56 | +1.00 | -0.61 … 1.83 |
| combat.step + combat.frame (ms) | 0.000 | 1.203 | +1.203 | 1.182 … 1.262 |
| Script of the frame: world step + combat.frame + draw (ms) | 5.67 | 7.29 | +1.78 | 1.00 … 1.92 |
| … of it the world step, with combat.step (ms) | 1.15 | 2.31 | +1.22 | 1.03 … 1.35 |
| … of it the page's style and layout (ms) | 0.000 | 0.299 | +0.299 | 0.257 … 0.325 |
| … of it the draw's script (ms) | 4.47 | 4.58 | +0.17 | -0.31 … 0.25 |
| Left on the heap a frame (KB) | 260 | 178 | −30 | -137 … 188 |
| Draw calls of combat's meshes, shown against hidden | – | – | +12 | 12 … 12 |
| Triangles of combat's meshes, shown against hidden | – | – | +116248 | 113816 … 116452 |
| Draw calls of the whole frame (medians; the scene's own count varies) | 177 | 187 | +11 | 10 … 12 |
| Triangles of the whole frame (medians) | 2591624 | 2667856 | +76554 | 54838 … 112854 |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the parts below plain means. combat.step alone 1.137 ms, combat.frame 0.054 ms; the slowest tenth of the frames take over 1.400 ms for both.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran, 6 other headless Chromes were open on this machine (load 84.1 / 101.5 / 115.2): they share the card, which is why the whole fight against the whole calm, seconds apart, scatters so, and why the card's verdict goes by combat's meshes shown and hidden in turn, in batches of a few frames, the median of the paired differences.

**Verdict:** card 0.587 ms against 1.5 ms: **within**; script (combat.step + combat.frame) 1.203 ms against 1 ms: **over**. With what the fight adds to the world step, the page's layout and the draw's script, the frame's script grows by 1.78 ms (**over** the 1 ms, counted that way).

## Where combat's script time goes (ms per frame, median of the repeats)

| part | ms | share of combat.step + frame | per unit |
|---|---:|---:|---:|
| enemies.update (thinking, moving, drawing the crowds) | 0.225 | 19 % | 5.01 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.687 | 57 % | 4.97 µs a shot |
| hostile.update (enemy shots, with hits on the player) | 0.107 | 9 % | 1.20 µs a round |
| aim.update | 0.027 | 2 % |  |
| director.update | 0.003 | 0 % |  |
| terrain.collidersNear (stones for the shots) | 0.071 | 6 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.017 | 1 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.054 | 5 % |  |
| outside them: the threat list (signals.js, asked for by the game's own step) | 0.015 | – |  |
| outside them: handing combat's meshes to the card (the draw's script, paired) | 0.163 | – |  |

The river lookups on their own (µs a call, on the fight as it stood: 134 shots, 44 enemies): a shot's locate + bed + level 0.75 (locate 0.27, bed 0.45, level 0.12); an enemy's current + locate + bed + level 1.14 (current 0.53); terrain.collidersNear 0.028 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each): an enemy round flying at the fish 0.694, spent and sinking 0.819, lying on the bed 0.049; a players' shot flying along the river 4.056, without the bed and surface lookup 2.896 (tested against 194 stones and the enemies of the fight).

The players' shots with parts swapped out (ms a frame, one measurement each):

| projectiles.update | projectiles.update | collidersNear | both | combat.step | shots |
|---|---:|---:|---:|---:|---:|
| as it is | 0.721 | 0.082 | 0.802 | 1.182 | 138 |
| a copy of it, to check the copy | 0.813 | 0.059 | 0.872 | 1.229 | 138 |
| the copy without the bed and surface lookup | 0.607 | 0.076 | 0.682 | 1.052 | 138 |
| the copy with each shot looking every other step | 0.717 | 0.069 | 0.786 | 1.203 | 138 |
| the copy with the stones sorted into 2 u cells each step | 0.667 | 0.069 | 0.736 | 1.096 | 138 |
| the copy with the stones sorted into cells once, while they stay the same | 0.532 | 0.068 | 0.599 | 0.980 | 138 |
| as it is, with no stones at all | 0.492 | 0.001 | 0.493 | 0.944 | 138 |

The bed and surface lookup: 0.206 ms a frame at 138 shots, 1.49 µs a shot. The stones (collidersNear and the test of every shot against every stone): 0.310 ms; sorted into cells each step, 0.243 ms, sorted once, 0.107 ms.

The page's style and layout with the fight on, parts of the HUD taken off the page (ms a frame, one measurement each):

| page | style and layout | combat.frame | script of the frame |
|---|---:|---:|---:|
| as it is | 0.275 | 0.056 | 7.02 |
| without the health bars (#foes) | 0.231 | 0.036 | 6.92 |
| without combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | 0.170 | 0.032 | 6.88 |
| … and without the game's threat arrows (#threats) | 0.000 | 0.047 | 6.87 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.264 against 1.276 ms, enemies.update 0.189 against 0.205, projectiles.update 0.847 against 0.845, heap 1193 against 1195 KB a frame.

Left on the heap for the collector, KB a frame (calls in which it collected are missed, so these are lower bounds): the whole frame 1221; combat.step 1377.3, combat.frame 7.3, enemies.update 53.3, projectiles.update 1292.2, hostile.update 16.1, aim.update 2.2, director.update 1.0, collidersNear 3.8, the threat list 7.2.

## Where the card's time goes (each part of combat shown against hidden, ms)

| part | costs | middle half of the batches |
|---|---:|---:|
| Combat bullhead | 0.088 | 0.025 … 0.225 |
| Combat troutParr | 0.212 | 0.150 … 0.263 |
| Combat trout | 0.150 | 0.025 … 0.275 |
| Combat dragonflyLarva | -0.137 | -0.375 … 0.137 |
| Combat beetleLarva | -0.012 | -0.137 … 0.138 |
| Combat glow | 0.025 | -0.137 … 0.163 |
| Combat bubbles | 0.000 | -0.113 … 0.125 |

The parts are timed one after another, so they need not add up to the whole exactly; a part near zero costs less than the noise.

## The fight scaled (one measurement each)

| enemies | shots (held) | enemy shots flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | card (meshes) | calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (139) | 60 (58 / 32 / 0) | 0.954 | 0.040 | 0.089 | 0.631 | 0.105 | 0.400 | 184 | 20 | 2.0 |
| 20 (22) | 150 (139) | 60 (57 / 33 / 0) | 1.098 | 0.044 | 0.130 | 0.729 | 0.106 | 0.612 | 185 | 29 | 3.0 |
| 40 (38) | 150 (139) | 60 (58 / 32 / 0) | 1.352 | 0.044 | 0.211 | 0.926 | 0.108 | 1.087 | 184 | 37 | 4.7 |
| 80 (79) | 150 (138) | 60 (59 / 31 / 0) | 2.068 | 0.056 | 0.448 | 1.466 | 0.130 | 0.725 | 187 | 65 | 4.3 |
| 40 (40) | 50 (46) | 60 (59 / 31 / 0) | 0.772 | 0.034 | 0.211 | 0.336 | 0.110 | 0.487 | 185 | 26 | 1.7 |
| 40 (39) | 300 (140, pool full) | 60 (58 / 32 / 0) | 1.384 | 0.040 | 0.223 | 0.923 | 0.108 | 1.462 | 188 | 37 | 4.0 |
| 40 (40) | 150 (138) | 0 (7 / 24 / 0) | 1.334 | 0.041 | 0.237 | 0.934 | 0.050 | 0.350 | 187 | 44 | 3.3 |
| 40 (40) | 150 (138) | 120 (90 / 0 / 0) | 1.358 | 0.040 | 0.217 | 0.910 | 0.100 | 0.300 | 186 | 46 | 3.2 |
| 40 (40) | 0 (0) | 0 (6 / 12 / 0) | 0.260 | 0.018 | 0.205 | 0.000 | 0.030 | 0.613 | 183 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 (0 / 0 / 0) | 0.020 | 0.000 | 0.009 | 0.001 | 0.001 | – | 173 | 0 | 0.0 |

enemies.update ≈ 0.055 + 3.07 µs·n + 0.024 µs·n² (n enemies alive): at 40 that is 123 µs growing with the number and 39 µs growing with its square (the pairs of separate() and striking()).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the card's number there is too low.)

## Spent enemy bullets over 45 s of fight

| s | flying | spent, sinking | on the bed | oldest spent (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | shots | bubbles | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 60 | 28 | 0 | 0.9 | 0.105 | 1.395 | 44 (4) | 146 | 240 | 243.5 |
| 5 | 61 | 29 | 0 | 1.0 | 0.070 | 1.330 | 45 (5) | 137 | 240 | 234.5 |
| 10 | 61 | 27 | 0 | 1.0 | 0.100 | 1.370 | 42 (2) | 144 | 240 | 230.5 |
| 15 | 63 | 27 | 0 | 1.0 | 0.105 | 1.425 | 43 (3) | 134 | 240 | 258.1 |
| 20 | 69 | 21 | 0 | 0.9 | 0.100 | 1.390 | 43 (3) | 144 | 240 | 255.1 |
| 25 | 61 | 27 | 0 | 0.9 | 0.115 | 1.280 | 45 (6) | 136 | 240 | 250.8 |
| 30 | 72 | 18 | 0 | 0.9 | 0.125 | 1.385 | 44 (6) | 139 | 240 | 246.8 |
| 35 | 74 | 16 | 0 | 0.9 | 0.110 | 1.430 | 47 (7) | 146 | 240 | 274.1 |
| 40 | 58 | 32 | 0 | 1.0 | 0.115 | 1.385 | 45 (5) | 138 | 240 | 269.8 |
| 45 | 56 | 34 | 0 | 0.8 | 0.080 | 1.410 | 44 (5) | 135 | 240 | 267.6 |

The list held at most 90 rounds, 31 of them spent and sinking and 0 on the bed on average; no spent round was older than 1.1 s, so none reached the bed (the water here is 11.98 u deep, and sinking at 0.45 u/s a round needs longer than it is kept): the full list lets the oldest go first. Nothing piles up without bound. At 0.82 µs a step each (the lists of their own, above), the spent ones cost 0.025 ms a step.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with an index count of 0 is unusual. (http://localhost:8170/)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8170/_vercel/insights/script.js)

Pictures: bench-webgpu-eco-kampf.jpg (the fight) and -ohne.jpg (the same place without it).
