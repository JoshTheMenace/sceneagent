# Ferrun Hollow — the full-pipeline live test

**Prompt (the entire user input):** "Create a medieval mountain village scene
for a 3D game — explorable, stylized, beautiful."

A builder agent followed `skills/build-stylized-threejs-scene/SKILL.md` end to
end: copied the starter, wrote a one-sentence promise and a validated contract,
blocked out, composed, art-directed, added story, then ran the mandatory
render-repair loop. An independent reviewer — who read the frames before any
builder narrative — scored against the skill's weighted rubric, with
calibration anchors from ~15 previously scored scenes.

## Scores across three review rounds

| Category (weight) | R1 | R2 | R3 |
|---|---|---|---|
| Composition (.22) | 0.72 | 0.75 | 0.77 |
| Sense of place (.18) | 0.72 | 0.74 | 0.76 |
| Art direction (.16) | 0.73 | 0.76 | 0.78 |
| Exploration/story (.14) | 0.74 | 0.75 | 0.76 |
| Runtime (.12) | 0.78 | 0.78 | 0.78 |
| Maintainability (.10) | 0.82 | 0.82 | 0.82 |
| Performance (.08) | 0.80 | 0.80 | 0.80 |
| **Overall** | **0.748** | **0.764** | **0.777** |

Bar: 0.78 overall. Prior one-shot baselines with the earlier long-form skill:
0.58–0.69. Each round the reviewer named exactly one highest-impact defect;
each repair pass verifiably fixed it. The final margin (−0.003) is inside the
review's resolving power.

What the loop caught along the way — all invisible in the hero frames:

- a genuinely sealed route (mislabeled collider), found by the flood fill;
- byte-identical "before/after" interaction captures (frames render before any
  animation tick — the capture needed an explicit update step);
- the reviewer's "ambiguous pole pile" complaint, which turned out to be a real
  bug: fence rails rotated 90° off, lying across a bank.

## The free-exploration hardening rounds

A human then *walked* the scene and found what six review cameras never see:
broken roof planes (hand-placed, guessed rotations), bushes floating off a
bank, see-through terrace joins; later, wall runs grounded at one end and
hovering elsewhere, and a bare support box poking through its own ramp.

Each finding became a permanent mechanism rather than a patch:

1. the **architecture kit** — roof planes derived from ridge/eave joints,
   closed bank wedges, slope-refusing prop seating;
2. the **spatial audit** — which, once extended with linear-run sampling and
   unexplained-mass detection, found every human-reported defect *plus* nine
   more nobody had noticed (a fence floating 2.2 m, decals sunk inside slabs,
   a bargeboard inside a gate tower);
3. **mandatory sweep evidence** — orbit, route-with-look-backs, and low
   roofline frames, the viewpoints a player reaches and hero cameras avoid.

After the repairs: spatial audit 0 findings, all camera gates green, flood
fill 16/16 waypoints, draw calls unchanged (max 214 of a 300 budget).

## What the result means

- The engineering scaffold (traversal, determinism, colliders, budgets) is
  reliable on the first pass. Composition converges only through read renders,
  at roughly +0.01–0.02 per targeted pass at this quality level.
- The remaining gap to a hand-authored reference scene (~0.9+) is not defects
  but **specificity**: named places, owned props, per-shot lighting, surface
  patterning at every scale. That is the pipeline's current frontier.
