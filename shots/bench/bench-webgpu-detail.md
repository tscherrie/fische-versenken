# Combat bench: webgpu, detail

apple metal-3 · WebGPU · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames · three r186 · clock step 0.1 ms

Place: s 2503.6, u 0, water 12 u deep, a parr of 1 u; camera fixed behind and above it. The fight is kept at 40 enemies, 150 players' shots and 60 enemy shots in flight, topped up before every step; 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a rate a fight of four players might see. Without the fight, combat's step and frame are not run at all.

Held in the first repeat (mean, min–max per frame): enemies alive 39 (37–40), dead ones 6 (2–9), players' shots 146 (98–151), enemy shots flying 61 (31–66), spent and sinking 99 (93–129), lying on the bed 0 (0–0), glow points 375 (320–444), bubbles 422 (264–480); 57 hits and 4.5 kills a second, and 271 players' shots fired a second to keep their number up (medians of the repeats).

## Fight minus no fight

|  | no fight | fight | difference | difference over the repeats |
|---|---:|---:|---:|---:|
| Card: combat's meshes, shown against hidden (ms) | – | – | +0.650 | 0.337 … 0.875 |
| Card: whole fight against no fight, back to back (ms) | 12.38 | 9.57 | +0.40 | -2.80 … 1.83 |
| Whole frames back to back, script and card (ms) | 9.62 | 8.55 | −0.04 | -1.06 … 0.84 |
| combat.step + combat.frame (ms) | 0.000 | 1.155 | +1.155 | 1.137 … 1.216 |
| Script of the frame: world step + combat.frame + draw (ms) | 5.71 | 7.11 | +1.41 | 1.27 … 1.87 |
| … of it the world step, with combat.step (ms) | 1.13 | 2.26 | +1.13 | 1.12 … 1.31 |
| … of it the page's style and layout (ms) | 0.000 | 0.221 | +0.221 | 0.202 … 0.246 |
| … of it the draw's script (ms) | 4.50 | 4.46 | −0.03 | -0.16 … 0.20 |
| Left on the heap a frame (KB) | 98 | 172 | +120 | -400 … 181 |
| Draw calls of combat's meshes, shown against hidden | – | – | +12 | 12 … 12 |
| Triangles of combat's meshes, shown against hidden | – | – | +143757 | 114392 … 143811 |
| Draw calls of the whole frame (medians; the scene's own count varies) | 221 | 233 | +12 | -8 … 44 |
| Triangles of the whole frame (medians) | 3100163 | 3153871 | +79354 | -204662 … 406888 |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the parts below plain means. combat.step alone 1.111 ms, combat.frame 0.043 ms; the slowest tenth of the frames take over 1.300 ms for both.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran, 4 other headless Chromes were open on this machine (load 163.9 / 132.5 / 136.8): they share the card, which is why the whole fight against the whole calm, seconds apart, scatters so, and why the card's verdict goes by combat's meshes shown and hidden in turn, in batches of a few frames, the median of the paired differences.

**Verdict:** card 0.650 ms against 1.5 ms: **within**; script (combat.step + combat.frame) 1.155 ms against 1 ms: **over**. With what the fight adds to the world step, the page's layout and the draw's script, the frame's script grows by 1.41 ms (**over** the 1 ms, counted that way).

## Where combat's script time goes (ms per frame, median of the repeats)

| part | ms | share of combat.step + frame | per unit |
|---|---:|---:|---:|
| enemies.update (thinking, moving, drawing the crowds) | 0.206 | 18 % | 4.66 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.624 | 54 % | 4.29 µs a shot |
| hostile.update (enemy shots, with hits on the player) | 0.161 | 14 % | 1.01 µs a round |
| aim.update | 0.023 | 2 % |  |
| director.update | 0.003 | 0 % |  |
| terrain.collidersNear (stones for the shots) | 0.060 | 5 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.034 | 3 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.043 | 4 % |  |
| outside them: the threat list (signals.js, asked for by the game's own step) | 0.012 | – |  |
| outside them: handing combat's meshes to the card (the draw's script, paired) | 0.262 | – |  |

The river lookups on their own (µs a call, on the fight as it stood: 147 shots, 47 enemies): a shot's locate + bed + level 0.86 (locate 0.29, bed 0.45, level 0.14); an enemy's current + locate + bed + level 1.49 (current 0.50); terrain.collidersNear 0.044 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each): an enemy round flying at the fish 1.437, spent and sinking 1.146, lying on the bed 0.056; a players' shot flying along the river 4.028, without the bed and surface lookup 2.569 (tested against 194 stones and the enemies of the fight).

The players' shots with parts swapped out (ms a frame, one measurement each):

| projectiles.update | projectiles.update | collidersNear | both | combat.step | shots |
|---|---:|---:|---:|---:|---:|
| as it is | 0.653 | 0.076 | 0.729 | 1.258 | 146 |
| a copy of it, to check the copy | 0.645 | 0.074 | 0.719 | 1.216 | 146 |
| the copy without the bed and surface lookup | 0.452 | 0.082 | 0.533 | 1.056 | 146 |
| the copy with each shot looking every other step | 0.588 | 0.077 | 0.665 | 1.192 | 146 |
| the copy with the stones sorted into 2 u cells each step | 0.710 | 0.078 | 0.788 | 1.320 | 146 |
| the copy with the stones sorted into cells once, while they stay the same | 0.569 | 0.078 | 0.648 | 1.197 | 146 |
| as it is, with no stones at all | 0.473 | 0.006 | 0.479 | 1.063 | 146 |

The bed and surface lookup: 0.193 ms a frame at 146 shots, 1.32 µs a shot. The stones (collidersNear and the test of every shot against every stone): 0.250 ms; sorted into cells each step, 0.309 ms, sorted once, 0.168 ms.

The page's style and layout with the fight on, parts of the HUD taken off the page (ms a frame, one measurement each):

| page | style and layout | combat.frame | script of the frame |
|---|---:|---:|---:|
| as it is | 0.237 | 0.048 | 7.58 |
| without the health bars (#foes) | 0.196 | 0.052 | 7.63 |
| without combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | 0.125 | 0.044 | 7.30 |
| … and without the game's threat arrows (#threats) | 0.000 | 0.049 | 7.13 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.211 against 1.220 ms, enemies.update 0.191 against 0.203, projectiles.update 0.695 against 0.669, heap 140 against 138 KB a frame.

Left on the heap for the collector, KB a frame (calls in which it collected are missed, so these are lower bounds): the whole frame 377; combat.step 692.4, combat.frame 7.6, enemies.update 48.4, projectiles.update 595.8, hostile.update 24.7, aim.update 3.1, director.update 1.0, collidersNear 3.6, the threat list 6.6.

## Where the card's time goes (each part of combat shown against hidden, ms)

| part | costs | middle half of the batches |
|---|---:|---:|
| Combat bullhead | 0.263 | -1.688 … 1.387 |
| Combat troutParr | 1.375 | -0.138 … 2.425 |
| Combat trout | 0.150 | -0.100 … 0.462 |
| Combat dragonflyLarva | 0.250 | -0.050 … 1.075 |
| Combat beetleLarva | -0.050 | -0.100 … 0.087 |
| Combat glow | 0.125 | -0.200 … 0.375 |
| Combat bubbles | -0.025 | -0.200 … 0.275 |

The parts are timed one after another, so they need not add up to the whole exactly; a part near zero costs less than the noise.

## The fight scaled (one measurement each)

| enemies | shots (held) | enemy shots flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | card (meshes) | calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 (62 / 98 / 0) | 1.023 | 0.044 | 0.089 | 0.590 | 0.188 | 0.712 | 232 | 38 | 3.5 |
| 20 (22) | 150 (146) | 60 (61 / 99 / 0) | 1.137 | 0.057 | 0.137 | 0.642 | 0.187 | 1.075 | 233 | 65 | 5.0 |
| 40 (38) | 150 (146) | 60 (62 / 98 / 0) | 1.337 | 0.048 | 0.228 | 0.771 | 0.187 | 0.375 | 233 | 44 | 5.0 |
| 80 (79) | 150 (146) | 60 (61 / 99 / 0) | 1.771 | 0.055 | 0.364 | 1.064 | 0.161 | 2.175 | 238 | 71 | 2.5 |
| 40 (40) | 50 (49) | 60 (61 / 98 / 0) | 0.859 | 0.047 | 0.207 | 0.291 | 0.197 | 0.588 | 239 | 21 | 1.0 |
| 40 (37) | 300 (293) | 60 (61 / 99 / 0) | 2.017 | 0.054 | 0.218 | 1.481 | 0.185 | 0.425 | 239 | 74 | 5.0 |
| 40 (39) | 150 (146) | 0 (8 / 11 / 0) | 1.312 | 0.048 | 0.226 | 0.882 | 0.036 | 0.250 | 239 | 73 | 6.5 |
| 40 (36) | 150 (146) | 120 (120 / 40 / 0) | 1.499 | 0.064 | 0.217 | 0.934 | 0.194 | 1.125 | 239 | 62 | 6.5 |
| 40 (40) | 0 (0) | 0 (9 / 15 / 0) | 0.320 | 0.018 | 0.203 | 0.000 | 0.052 | 1.475 | 238 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 (0 / 0 / 0) | 0.019 | 0.000 | 0.006 | 0.001 | 0.000 | – | 226 | 0 | 0.0 |

enemies.update ≈ 0.026 + 6.02 µs·n + -0.022 µs·n² (n enemies alive): at 40 that is 241 µs growing with the number and -35 µs growing with its square (the pairs of separate() and striking()).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the card's number there is too low.)

## Spent enemy bullets over 45 s of fight

| s | flying | spent, sinking | on the bed | oldest spent (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | shots | bubbles | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 60 | 98 | 0 | 1.5 | 0.177 | 1.287 | 45 (5) | 149 | 389 | 223 |
| 5 | 59 | 101 | 0 | 1.7 | 0.190 | 1.480 | 48 (8) | 145 | 480 | 246.1 |
| 10 | 45 | 115 | 0 | 1.6 | 0.183 | 1.672 | 45 (5) | 144 | 479 | 255 |
| 15 | 64 | 96 | 0 | 1.5 | 0.183 | 1.465 | 44 (4) | 146 | 480 | 262.8 |
| 20 | 60 | 100 | 0 | 1.5 | 0.177 | 1.402 | 44 (5) | 142 | 480 | 274.6 |
| 25 | 67 | 92 | 0 | 1.3 | 0.195 | 1.480 | 45 (9) | 149 | 480 | 261.6 |
| 30 | 55 | 105 | 0 | 1.6 | 0.177 | 1.473 | 45 (6) | 146 | 480 | 252.5 |
| 35 | 57 | 103 | 0 | 1.5 | 0.163 | 1.340 | 43 (3) | 146 | 473 | 280.2 |
| 40 | 60 | 97 | 1 | 1.7 | 0.162 | 1.367 | 44 (5) | 142 | 480 | 281.2 |
| 45 | 60 | 98 | 0 | 1.5 | 0.170 | 1.387 | 45 (5) | 140 | 480 | 246 |

The list held at most 160 rounds, 100 of them spent and sinking and 0 on the bed on average; no spent round was older than 1.8 s, so some reached the bed: the full list lets the oldest go first. Nothing piles up without bound. At 1.15 µs a step each (the lists of their own, above), the spent ones cost 0.115 ms a step.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with an index count of 0 is unusual. (http://localhost:8170/)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8170/_vercel/insights/script.js)

Pictures: bench-webgpu-detail-kampf.jpg (the fight) and -ohne.jpg (the same place without it).
