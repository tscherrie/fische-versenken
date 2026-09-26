# Combat bench: webgl2, detail

ANGLE (Apple, ANGLE Metal Renderer: Apple M1 Pro, Unspecified Version) · WebGL 2 (the fallback, ?webgl) · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames · three r186 · clock step 0.1 ms

Place: s 2503.9, u 0, water 12.09 u deep, a parr of 1 u; camera fixed behind and above it. The fight is kept at 40 enemies, 150 players' shots and 60 enemy shots in flight, topped up before every step; 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a rate a fight of four players might see. Without the fight, combat's step and frame are not run at all.

Held in the first repeat (mean, min–max per frame): enemies alive 39 (37–40), dead ones 6 (3–8), players' shots 146 (100–150), enemy shots flying 61 (25–67), spent and sinking 99 (93–135), lying on the bed 0 (0–1), glow points 385 (340–468), bubbles 444 (310–480); 62 hits and 4.0 kills a second, and 276 players' shots fired a second to keep their number up (medians of the repeats).

## Fight minus no fight

|  | no fight | fight | difference | difference over the repeats |
|---|---:|---:|---:|---:|
| Card: combat's meshes, shown against hidden (ms) | – | – | +0.512 | 0.300 … 0.625 |
| Card, WebGL timer query per frame (ms) | 20.24 | 22.13 | +1.44 | -4.47 … 6.46 |
| Card: whole fight against no fight, back to back (ms) | 14.66 | 12.21 | +0.27 | -8.41 … 6.70 |
| Whole frames back to back, script and card (ms) | 14.42 | 9.52 | −0.02 | -7.60 … 7.27 |
| combat.step + combat.frame (ms) | 0.000 | 1.236 | +1.236 | 1.106 … 1.285 |
| Script of the frame: world step + combat.frame + draw (ms) | 6.50 | 8.84 | +1.80 | 1.69 … 2.43 |
| … of it the world step, with combat.step (ms) | 1.13 | 2.43 | +1.22 | 1.13 … 1.37 |
| … of it the page's style and layout (ms) | 0.000 | 0.253 | +0.253 | 0.248 … 0.304 |
| … of it the draw's script (ms) | 5.36 | 5.92 | +0.26 | 0.16 … 0.65 |
| Left on the heap a frame (KB) | 503 | 880 | +377 | 362 … 417 |
| Draw calls of combat's meshes, shown against hidden | – | – | +12 | 12 … 12 |
| Triangles of combat's meshes, shown against hidden | – | – | +143865 | 90271 … 146319 |
| Draw calls of the whole frame (medians; the scene's own count varies) | 189 | 200 | +12 | 10 … 12 |
| Triangles of the whole frame (medians) | 2134873 | 2233525 | +98386 | 96304 … 99488 |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the parts below plain means. combat.step alone 1.179 ms, combat.frame 0.056 ms; the slowest tenth of the frames take over 1.500 ms for both.

How: WebGL 2: EXT_disjoint_timer_query_webgl2 per frame, and frames drawn back to back, then gl.finish(). The card, not the script, held up the frames drawn back to back. While it ran, 6 other headless Chromes were open on this machine (load 98.4 / 96.9 / 116.8): they share the card, which is why the whole fight against the whole calm, seconds apart, scatters so, and why the card's verdict goes by combat's meshes shown and hidden in turn, in batches of a few frames, the median of the paired differences.

**Verdict:** card 0.512 ms against 1.5 ms: **within**; script (combat.step + combat.frame) 1.236 ms against 1 ms: **over**. With what the fight adds to the world step, the page's layout and the draw's script, the frame's script grows by 1.80 ms (**over** the 1 ms, counted that way).

## Where combat's script time goes (ms per frame, median of the repeats)

| part | ms | share of combat.step + frame | per unit |
|---|---:|---:|---:|
| enemies.update (thinking, moving, drawing the crowds) | 0.203 | 16 % | 4.54 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.657 | 53 % | 4.52 µs a shot |
| hostile.update (enemy shots, with hits on the player) | 0.166 | 13 % | 1.04 µs a round |
| aim.update | 0.020 | 2 % |  |
| director.update | 0.003 | 0 % |  |
| terrain.collidersNear (stones for the shots) | 0.078 | 6 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.053 | 4 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.056 | 5 % |  |
| outside them: the threat list (signals.js, asked for by the game's own step) | 0.015 | – |  |
| outside them: handing combat's meshes to the card (the draw's script, paired) | 0.213 | – |  |

The river lookups on their own (µs a call, on the fight as it stood: 145 shots, 48 enemies): a shot's locate + bed + level 0.83 (locate 0.28, bed 0.46, level 0.09); an enemy's current + locate + bed + level 1.46 (current 0.56); terrain.collidersNear 0.012 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each): an enemy round flying at the fish 0.826, spent and sinking 0.847, lying on the bed 0.049; a players' shot flying along the river 3.201, without the bed and surface lookup 1.507 (tested against 194 stones and the enemies of the fight).

The players' shots with parts swapped out (ms a frame, one measurement each):

| projectiles.update | projectiles.update | collidersNear | both | combat.step | shots |
|---|---:|---:|---:|---:|---:|
| as it is | 0.661 | 0.068 | 0.729 | 1.204 | 146 |
| a copy of it, to check the copy | 0.639 | 0.075 | 0.714 | 1.173 | 146 |
| the copy without the bed and surface lookup | 0.410 | 0.056 | 0.466 | 0.951 | 146 |
| the copy with each shot looking every other step | 0.539 | 0.078 | 0.618 | 1.142 | 146 |
| the copy with the stones sorted into 2 u cells each step | 0.709 | 0.082 | 0.791 | 1.320 | 146 |
| the copy with the stones sorted into cells once, while they stay the same | 0.493 | 0.083 | 0.577 | 1.095 | 146 |
| as it is, with no stones at all | 0.581 | 0.001 | 0.582 | 1.117 | 146 |

The bed and surface lookup: 0.229 ms a frame at 146 shots, 1.57 µs a shot. The stones (collidersNear and the test of every shot against every stone): 0.148 ms; sorted into cells each step, 0.209 ms, sorted once, -0.005 ms.

The page's style and layout with the fight on, parts of the HUD taken off the page (ms a frame, one measurement each):

| page | style and layout | combat.frame | script of the frame |
|---|---:|---:|---:|
| as it is | 0.272 | 0.041 | 8.51 |
| without the health bars (#foes) | 0.230 | 0.035 | 8.29 |
| without combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | 0.164 | 0.050 | 8.34 |
| … and without the game's threat arrows (#threats) | 0.000 | 0.046 | 8.50 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.298 against 1.286 ms, enemies.update 0.187 against 0.201, projectiles.update 0.770 against 0.725, heap 1633 against 1228 KB a frame.

Left on the heap for the collector, KB a frame (calls in which it collected are missed, so these are lower bounds): the whole frame 1616; combat.step 1075.7, combat.frame 7.5, enemies.update 47.5, projectiles.update 993.6, hostile.update 24.4, aim.update 3.1, director.update 1.0, collidersNear 3.5, the threat list 6.3.

## Where the card's time goes (each part of combat shown against hidden, ms)

| part | costs | middle half of the batches |
|---|---:|---:|
| Combat bullhead | 0.163 | -0.250 … 1.475 |
| Combat troutParr | 0.575 | -0.675 … 1.250 |
| Combat trout | 0.563 | 0.037 … 0.663 |
| Combat dragonflyLarva | 0.537 | -0.563 … 1.063 |
| Combat beetleLarva | 0.438 | -1.287 … 1.550 |
| Combat glow | 0.850 | -1.050 … 1.912 |
| Combat bubbles | -0.088 | -0.163 … 0.050 |

The parts are timed one after another, so they need not add up to the whole exactly; a part near zero costs less than the noise.

## The fight scaled (one measurement each)

| enemies | shots (held) | enemy shots flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | card (meshes) | calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 (60 / 99 / 0) | 0.997 | 0.045 | 0.072 | 0.563 | 0.196 | 0.337 | 198 | 16 | 2.0 |
| 20 (22) | 150 (146) | 60 (61 / 99 / 0) | 1.144 | 0.048 | 0.135 | 0.644 | 0.193 | -0.525 | 199 | 43 | 3.5 |
| 40 (37) | 150 (146) | 60 (62 / 98 / 0) | 1.321 | 0.064 | 0.200 | 0.892 | 0.195 | 1.262 | 202 | 44 | 2.5 |
| 80 (80) | 150 (146) | 60 (62 / 98 / 0) | 1.773 | 0.052 | 0.345 | 1.064 | 0.190 | 1.300 | 204 | 66 | 2.5 |
| 40 (40) | 50 (48) | 60 (62 / 98 / 0) | 0.786 | 0.036 | 0.193 | 0.277 | 0.173 | 0.925 | 205 | 57 | 0.5 |
| 40 (39) | 300 (293) | 60 (62 / 98 / 0) | 2.034 | 0.057 | 0.219 | 1.532 | 0.182 | 0.188 | 207 | 57 | 6.0 |
| 40 (38) | 150 (146) | 0 (6 / 11 / 0) | 1.222 | 0.036 | 0.225 | 0.818 | 0.035 | 0.287 | 205 | 43 | 5.0 |
| 40 (40) | 150 (146) | 120 (119 / 40 / 0) | 1.396 | 0.056 | 0.235 | 0.873 | 0.181 | -0.225 | 204 | 49 | 4.5 |
| 40 (40) | 0 (0) | 0 (3 / 10 / 0) | 0.322 | 0.018 | 0.231 | 0.001 | 0.029 | 1.062 | 204 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 (0 / 0 / 0) | 0.019 | 0.000 | 0.007 | 0.001 | 0.001 | – | 194 | 0 | 0.0 |

enemies.update ≈ 0.019 + 5.62 µs·n + -0.019 µs·n² (n enemies alive): at 40 that is 225 µs growing with the number and -31 µs growing with its square (the pairs of separate() and striking()).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the card's number there is too low.)

## Spent enemy bullets over 45 s of fight

| s | flying | spent, sinking | on the bed | oldest spent (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | shots | bubbles | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 61 | 98 | 0 | 1.5 | 0.178 | 1.705 | 43 (3) | 150 | 325 | 378.9 |
| 5 | 62 | 97 | 0 | 1.5 | 0.180 | 1.435 | 45 (7) | 146 | 479 | 390.9 |
| 10 | 63 | 97 | 0 | 1.5 | 0.187 | 1.578 | 46 (8) | 148 | 479 | 220.2 |
| 15 | 54 | 106 | 0 | 1.6 | 0.222 | 1.928 | 46 (7) | 146 | 479 | 247.8 |
| 20 | 62 | 98 | 0 | 1.5 | 0.180 | 1.467 | 45 (8) | 144 | 480 | 250.7 |
| 25 | 67 | 93 | 0 | 1.5 | 0.218 | 1.543 | 48 (10) | 145 | 480 | 261.8 |
| 30 | 65 | 95 | 0 | 1.4 | 0.195 | 1.502 | 46 (6) | 143 | 480 | 279 |
| 35 | 62 | 98 | 0 | 1.6 | 0.200 | 1.558 | 46 (8) | 144 | 478 | 227.3 |
| 40 | 56 | 103 | 0 | 1.5 | 0.183 | 1.513 | 44 (4) | 145 | 478 | 255.7 |
| 45 | 60 | 100 | 0 | 1.6 | 0.203 | 1.615 | 44 (5) | 147 | 480 | 256.2 |

The list held at most 160 rounds, 99 of them spent and sinking and 0 on the bed on average; no spent round was older than 1.6 s, so none reached the bed (the water here is 12.09 u deep, and sinking at 0.45 u/s a round needs longer than it is kept): the full list lets the oldest go first. Nothing piles up without bound. At 0.85 µs a step each (the lists of their own, above), the spent ones cost 0.084 ms a step.

## Console

No errors.

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8170/_vercel/insights/script.js)

Pictures: bench-webgl2-detail-kampf.jpg (the fight) and -ohne.jpg (the same place without it).
