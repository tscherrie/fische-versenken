# Combat bench: webgpu, detail

apple metal-3 · WebGPU · quality detail · canvas 1280×720, scene drawn at 1280×720 · one step of 16.7 ms per frame · 5 repeats of 120 frames, 32 blocks for everything timed in turns · three r186 · clock step 0.1 ms

Place: s 2503.6, u 0, water 12 u deep, a parr of 1 u 7.02 u above the bed (the fish held there, and held at its size to the end), the camera fixed behind and above it. Two fights are held there, topped up before every step: **four players** -- 40 enemies firing their own guns at their own pace and 28 laser bolts in the water, as many as four players firing the laser without pause keep there (a bolt lives reach / speed = 0.71 s at this size, and comes every 0.11 s) -- and the **stress case**, 40 enemies, 150 players' shots and 60 enemy rounds in flight (the bench fires the rounds, far more than the enemies do). 12 % of the players' shots are aimed at an enemy, and the enemies have 4× their hit points, which keeps the kills to a steady rate. Without the fight, combat's step and frame are not run at all.

| held (first repeat: mean, min–max a frame) | four players | stress case |
|---|---:|---:|
| enemies alive | 40 (39–40) | 40 (38–40) |
| dead ones (cleared 0.5 s after the kill) | 1 (0–1) | 2 (0–4) |
| simulated but not drawn (past a kind's crowd) | 0 (0–0) | 0 (0–0) |
| players' shots | 27 (25–29) | 145 (103–150) |
| enemy rounds flying | 10 (5–17) | 63 (26–70) |
| … spent and sinking | 28 (17–37) | 97 (90–134) |
| … lying on the bed | 0 (0–0) | 0 (0–0) |
| glow points / bubbles | 87 (58–106) / 104 (93–114) | 391 (339–485) / 462 (313–480) |
| hits / kills a second (median of the repeats) | 25 / 1.0 | 80 / 6.0 |
| players' shots fired by the bench a second | 50 | 285 |
| enemy rounds fired a second: by the bench / by the enemies | 0 / 7 | 112 / 8 |

## Verdict

- **Card** (stress case, combat's meshes shown against hidden in turns, all pairs of the repeats together): 0.463 (95 % 0.425 … 0.500, 160 pairs) ms against 1.5 ms: **within**. Per repeat 0.400 … 0.625 ms. The same method with nothing shown or hidden (A/A): 0.013 (95 % -0.037 … 0.050, 160 pairs) ms.
- **Script, four players:** combat.step + combat.frame 0.974 ms (repeats 0.924 … 1.020) against 1 ms: **within**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.381 ms (1.359 … 1.464): **over**. The slowest tenth of the frames take over 1.100 ms for step and frame, the slowest 1.200 ms.
- **Script, stress case:** combat.step + combat.frame 1.456 ms (repeats 1.435 … 1.488) against 1 ms: **over**; with everything else the fight costs the script (the firing the bench does for the game, the threat list, the page's style and layout, handing combat's meshes to the card) 1.915 ms (1.846 … 1.940): **over**. The slowest tenth of the frames take over 1.600 ms for step and frame, the slowest 1.800 ms.

## Fight minus no fight

| script, ms a frame (median of the repeats, their range) | four players | stress case |
|---|---:|---:|
| combat.step + combat.frame | +0.974 (0.924 … 1.020) | +1.456 (1.435 … 1.488) |
| the firing the bench does for the game (projectiles.fire, the enemies' guns) | +0.001 (0.001 … 0.002) | +0.006 (0.003 … 0.007) |
| the threat list (signals.js, asked for by the game's own step) | +0.012 (0.007 … 0.018) | +0.013 (0.008 … 0.017) |
| the page's style and layout (fight against no fight) | +0.172 (0.166 … 0.217) | +0.196 (0.193 … 0.211) |
| handing combat's meshes to the card (paired, stress case) | +0.213 (0.175 … 0.275) | +0.213 (0.175 … 0.275) |
| **all of it** | +1.381 (1.359 … 1.464) | +1.915 (1.846 … 1.940) |
| (seconds apart, noisy:) the frame's whole script | +1.46 (1.21 … 1.51) | +1.93 (1.87 … 2.00) |
| (seconds apart, noisy:) … of it the draw's script | +0.23 (0.12 … 0.25) | +0.23 (0.20 … 0.27) |

Script times are means of the middle 80 % of the frames (the clock steps by 0.1 ms), the firing and the threat list plain means. Card: combat's meshes add +12 draw calls and +51242 triangles (shown against hidden). Whole fight against no fight, seconds apart (noisy): the card drawing frames back to back 7.66 → 7.96 ms, whole frames back to back 7.75 → 8.06 ms.

How: WebGPU: frames drawn back to back, then device.queue.onSubmittedWorkDone(). The card, not the script, held up the frames drawn back to back. While it ran (7 minutes), 3 other headless Chromes were open on this machine (load 15.6 / 13.7 / 32.3): they share the card, which is why only what is timed in turns, in short blocks, is taken for a verdict.

## Where combat's script time goes (ms a frame, plain means, median of the repeats)

| part | four players | share | per unit | stress case | share | per unit |
|---|---:|---:|---:|---:|---:|---:|
| enemies.update (thinking, moving, the crawlers' heights on the ground, drawing the crowds) | 0.484 | 50 % | 11.93 µs an enemy | 0.403 | 28 % | 9.58 µs an enemy |
| projectiles.update (with hits: enemies.hit, gore.hit, fx.burst) | 0.132 | 14 % | 4.84 µs a shot | 0.571 | 39 % | 3.93 µs a shot |
| hostile.update (enemy rounds, with hits on the player) | 0.032 | 3 % | 0.80 µs a round | 0.088 | 6 % | 0.55 µs a round |
| aim.update | 0.021 | 2 % |  | 0.017 | 1 % |  |
| director.update | 0.003 | 0 % |  | 0.003 | 0 % |  |
| pickups.update | 0.002 | 0 % |  | 0.003 | 0 % |  |
| the stones for the shots (terrain.collidersNear) | 0.010 | 1 % |  | 0.013 | 1 % |  |
| the crawlers' ground gathered (ground.refresh: collidersNear and pebbles.near within 12 u) | 0.221 | 23 % |  | 0.219 | 15 % |  |
| rest of combat.step (firing, bosses, rules, fx.update, gore.update, corpses) | 0.038 | 4 % |  | 0.104 | 7 % |  |
| combat.frame (hud and health bars, fx.begin/add/end, models, gore.frame) | 0.032 | 3 % |  | 0.038 | 3 % |  |
| combat.step + combat.frame | 0.974 | 100 % |  | 1.458 | 100 % |  |

The river lookups on their own (µs a call, on the stress case as it stood: 149 shots, 42 enemies): a shot's locate + bed + level 0.69 (locate 0.25, bed 0.40, level 0.09); an enemy's current + locate + bed + level 1.35 (current 0.56); terrain.collidersNear 0.026 ms a call, 194 stones returned.

On lists of their own (600 at a time, µs a step each; the rounds made spent and laid on the bed through hostile.js's own path): an enemy round flying at the fish 0.938, spent and sinking 0.243, lying on the bed 0.049; a players' shot flying along the river 3.618, without the bed and surface lookup 2.444 (tested against 194 stones and the enemies of the fight).

## What the proposals save (timed in turns)

Each variant against what it replaces, in 32 blocks of 6 frames (off, on, on, off, then the other way round): the median change of combat.step, with the middle half of the blocks; negative saves. The variants for the shots are copies of projectiles.js's update, timed against a plain copy of it; the copy itself against the original: −0.010 ms (-0.030 … 0.010). Every variant gives the same hits, stones, grounds and heights as the code it stands for.

| proposal | fight | change of combat.step (ms) | middle half |
|---|---:|---:|---:|
| Each players' shot looks up the bed and the surface every other step (for the game: with the crossing found between two looks; at Eco's 50 ms step a bolt goes 4 u between them) | stress case | −0.090 | -0.110 … -0.070 |
| The stones near the fish sorted into 2 u cells, again only when the list of stones changes; a shot tests only the stones of its cell | stress case | −0.140 | -0.170 … -0.120 |
| The living enemies sorted into 2 u cells once a step; a shot tests only the enemies its step can reach | stress case | −0.010 | -0.040 … 0.010 |
| The living enemies' middles and sizes in flat arrays once a step, for the first test of every shot against every enemy (the records, of many shapes, read only for those near) | stress case | −0.140 | -0.190 … -0.110 |
| Every other lookup, stone cells and enemy arrays together | stress case | −0.320 | -0.340 … -0.300 |
| The same three together | four players | −0.050 | -0.070 … -0.030 |
| The crawlers' ground gathered again only once the fish has moved (0.5 u), not every step | four players | −0.210 | -0.230 … -0.180 |
| A crawler's height looked up among the stones and pebbles of its 1 u cell only, sorted into cells whenever the ground is gathered | four players | +0.020 | 0.000 … 0.050 |
| Both for the ground: gathered when the fish has moved, sorted into cells then | four players | −0.490 | -0.510 … -0.470 |
| Everything together: the three for the shots, both for the ground | four players | −0.560 | -0.590 … -0.520 |

The page's style and layout with parts of the HUD taken off the page (display: none) in turns against as it is (stress case, ms a frame; what writing them by transform alone could save at most):

| taken off | style and layout | middle half |
|---|---:|---:|
| the health bars (#foes, moved by transform since main's 96c98ec) | −0.030 | -0.050 … -0.010 |
| all of combat's HUD (#xh, #callout, #arsenal, #foes, #bossbar) | −0.060 | -0.070 … -0.040 |
| the game's threat arrows (#threats, base game: Next's to change) | −0.070 | -0.080 … -0.040 |

Enemy records all of one shape (every field the combat code adds later given at spawn, in one order) against as they are, twice in turn after a fresh set of enemies: combat.step 1.455 against 1.429 ms, enemies.update 0.409 against 0.373, projectiles.update 0.574 against 0.584.

## What the script allocates (stress case)

Chrome's sampling heap profiler over 120 frames, counting what the collector had already taken too: 1773 KB a frame in all; within combat.step 1222.8, combat.frame 8.1, projectiles.update 241.4, enemies.update 879.2, hostile.update 16.5, hud.bars 2.1, fx.update 12.0 KB (callees included). Where it is allocated (KB a frame, the site itself):

| site | KB a frame |
|---|---:|
| height (ground.js:19) | 806.0 |
| update (projectiles.js:79) | 217.8 |
| update (life.js:1447) | 89.1 |
| subarray (native) | 59.8 |
| near (pebbles.js:250) | 49.9 |
| _update (three.webgpu.js:33882) | 48.6 |
| drawLocal (minimap.js:138) | 36.7 |
| update (life.js:430) | 22.8 |
| meters.gravel.fn (scenes-look.js:346) | 21.1 |
| split (anatomy.js:2084) | 19.4 |
| update (life.js:836) | 17.1 |
| riverBed (course.js:757) | 17.1 |
| add (native) | 16.4 |
| update (enemies.js:370) | 14.5 |
| update (three.webgpu.js:16605) | 12.5 |

## Combat's meshes (stress case, each part shown against hidden)

| part | draw calls | triangles |
|---|---:|---:|
| Combat bullhead | +2 | +10688 |
| Combat bullhead far | +1 | +480 |
| Combat troutParr | +2 | +24696 |
| Combat troutParr far | +1 | +1680 |
| Combat trout | +2 | +13720 |
| Combat trout far | +0 | +0 |
| Combat dragonflyLarva | +0 | +0 |
| Combat dragonflyLarva far | +1 | +720 |
| Combat beetleLarva | +0 | +0 |
| Combat beetleLarva far | +1 | +480 |
| Combat glow | +1 | +734 |
| Combat bubbles | +1 | +960 |

(What one part costs the card alone is below the noise of timing it on a shared machine; the card's verdict is for all of them together.)

## The fight scaled (one measurement each: for the shape of the growth)

| enemies | shots (held) | enemy rounds asked / flying / spent / on the bed | combat.step | combat.frame | enemies | projectiles | hostile | draw calls | hits/s | kills/s |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 10 (10) | 150 (146) | 60 / 61 / 99 / 0 | 1.025 | 0.024 | 0.166 | 0.368 | 0.122 | +10 | 21 | 3.0 |
| 20 (22) | 150 (146) | 60 / 60 / 100 / 0 | 1.191 | 0.042 | 0.273 | 0.468 | 0.097 | +11 | 27 | 3.5 |
| 40 (40) | 150 (146) | 60 / 61 / 99 / 0 | 1.472 | 0.026 | 0.407 | 0.591 | 0.106 | +12 | 54 | 3.5 |
| 80 (77, 35 not drawn) | 150 (145) | 60 / 61 / 99 / 0 | 2.190 | 0.033 | 0.776 | 0.927 | 0.097 | +12 | 101 | 6.0 |
| 40 (40) | 28 (27) | 60 / 61 / 99 / 0 | 1.079 | 0.025 | 0.514 | 0.138 | 0.098 | +12 | 18 | 1.0 |
| 40 (40) | 50 (48) | 60 / 61 / 99 / 0 | 1.107 | 0.021 | 0.482 | 0.209 | 0.104 | +12 | 38 | 1.5 |
| 40 (39) | 300 (293) | 60 / 60 / 99 / 0 | 1.981 | 0.037 | 0.417 | 1.109 | 0.098 | +12 | 62 | 7.5 |
| 40 (39) | 150 (146) | 0 / 9 / 17 / 0 | 1.406 | 0.034 | 0.412 | 0.602 | 0.027 | +12 | 55 | 6.0 |
| 40 (40) | 150 (146) | 120 / 122 / 38 / 0 | 1.545 | 0.037 | 0.443 | 0.594 | 0.133 | +12 | 59 | 5.0 |
| 40 (40) | 0 (0) | 0 / 6 / 11 / 0 | 0.816 | 0.009 | 0.512 | 0.001 | 0.027 | +12 | 0 | 0.0 |
| 0 (combat running empty) | 0 (0) | 0 / 0 / 0 / 0 | 0.015 | 0.000 | 0.012 | 0.000 | 0.000 | – | 0 | 0.0 |

enemies.update ≈ 0.099 + 6.98 µs·n + 0.024 µs·n² (n enemies alive): at 40 that is 279 µs growing with the number and 39 µs growing with its square (the pairs of separate() and striking()).

projectiles.update grows by 3.66 µs a shot at 40 enemies (27 → 293 shots).

(80 enemies: past a kind's crowd they are moved and tested but not drawn, so the draw calls there are too few.)

## Enemy rounds over 30 s of the fight of four players, the fish held low over the bed

| s | fired in that second | flying | spent, sinking | on the bed | oldest spent (s) | longest on the bed (s) | hostile.update (ms) | combat.step (ms) | enemies (dead) | heap (MB) |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 12 | 8 | 37 | 3 | 1.6 | 0.5 | 0.042 | 0.870 | 41 (2) | 243.7 |
| 5 | 7 | 0 | 51 | 25 | 5.6 | 4.5 | 0.030 | 0.978 | 44 (4) | 262 |
| 10 | 24 | 8 | 51 | 60 | 10.6 | 7.8 | 0.058 | 1.038 | 42 (2) | 264.8 |
| 15 | 7 | 2 | 58 | 34 | 10.9 | 7.9 | 0.058 | 1.022 | 42 (2) | 244.8 |
| 20 | 10 | 7 | 46 | 54 | 11.8 | 7.9 | 0.040 | 0.982 | 40 (2) | 256.2 |
| 25 | 25 | 5 | 58 | 36 | 11.9 | 7.0 | 0.060 | 1.020 | 42 (3) | 267.4 |
| 30 | 4 | 2 | 49 | 37 | 11.1 | 7.9 | 0.047 | 1.017 | 42 (5) | 227.7 |

The enemies fired 15.5 rounds a second on their own. The list held at most 119 rounds (capacity 160); up to 66 lay on the bed at once, in 30 of 30 seconds, the longest 8.0 s (they go after 8 s there, or at 12 s old). hostile.update took 0.042 ms a step (median of the seconds). Nothing piles up without bound.

## Console

No errors.

1 different warnings:

- rendering: Calling [RenderPassEncoder (unlabeled)].Draw with an index count of 0 is unusual. (http://localhost:8182/)

(The draws with an index count of 0 come from the base game's warm-up render at start-up -- two transparent objects with an empty index in each pass, the mirror's too, which never sees combat -- not from combat.)

Left aside, the development server's and not the game's:

- network: Failed to load resource: the server responded with a status of 404 (Not Found) (http://localhost:8182/_vercel/insights/script.js)

Pictures: bench-webgpu-detail-kampf.jpg (the stress case) and -ohne.jpg (the same place without it).
