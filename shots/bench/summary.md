# Combat bench

Budget for all of combat: at most 1.5 ms on the card and 1 ms of script a frame. Fight minus the same place without it, median of the repeats (min … max in brackets). The card: combat's meshes shown against hidden, in turns.

| configuration | card (ms) | combat.step + frame (ms) | script of the frame (ms) | draw calls | triangles | verdict | errors |
|---|---:|---:|---:|---:|---:|---:|---:|
| webgpu-detail | 0.650 (0.337 … 0.875) | 1.155 (1.137 … 1.216) | +1.41 (1.27 … 1.87) | +12 | +143757 | card within, combat's script **over**, frame's script **over** | 0 |
| webgl2-detail | 0.512 (0.300 … 0.625) | 1.236 (1.106 … 1.285) | +1.80 (1.69 … 2.43) | +12 | +143865 | card within, combat's script **over**, frame's script **over** | 0 |
| webgpu-eco | 0.587 (0.362 … 1.850) | 1.203 (1.182 … 1.262) | +1.78 (1.00 … 1.92) | +12 | +116248 | card within, combat's script **over**, frame's script **over** | 0 |

(≤: the script, not the card, held up the frames drawn back to back, so the card's number is an upper bound. "Script of the frame": what the fight adds to the world step, combat.frame, the page's layout and the draw's script together.) Details: bench-<configuration>.md.
