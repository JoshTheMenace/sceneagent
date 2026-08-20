# Yoimachi Yokochō — the pipeline's first clear pass

**Prompt (the entire user input):** "Create a Tokyo scene — explorable,
stylized, beautiful."

Second full-pipeline run, different builder model from the first
(Ferrun Hollow), same skill, same gates, same frozen independent-review
protocol and calibration anchors — so the two runs measure the *pipeline*
across models.

The scene: 宵待横丁, a dead-end drinking alley ten minutes after rain at
19:05 — eight shophouses in four front states (open, shut, shut-for-good,
glazed), a brick railway viaduct closing the lane with a standing bar and a
fox shrine in its arches, a train crossing every 23 s, and one interaction
that lights the alley in a staggered ramp. All signage Canvas2D-generated,
named tenants throughout, no people anywhere.

## Scores

| Category (weight) | Round 1 | Round 2 |
|---|---|---|
| Composition (.22) | 0.74 | 0.79 |
| Sense of place (.18) | 0.80 | 0.81 |
| Art direction (.16) | 0.75 | 0.78 |
| Exploration/story (.14) | 0.72 | 0.78 |
| Runtime (.12) | 0.80 | 0.80 |
| Maintainability (.10) | 0.86 | 0.87 |
| Performance (.08) | 0.78 | 0.80 |
| **Overall** | **0.772** | **0.801 — PASS** |

Bar: 0.78. Cross-run: 0.801 in two rounds versus Ferrun Hollow's 0.777 in
three — and the first legitimate pass above the previous best (0.784) in
roughly fifteen scored scenes.

## What made the difference

- **The repair pass was diagnostic, not additive.** The builder measured
  the reviewer's own prescriptions before applying them: a raycast sweep
  proved the contract's closing view was geometrically impossible (20 m of
  party wall), so the contract was revised to record the measurement and
  the shot composed where the view actually exists — which the reviewer
  independently re-derived and upheld as legitimate. The prescribed "~10%"
  value lift was overridden to 20% because 6.9 luma of separation
  quantises to zero under a cel band step; the reviewer conceded the
  override was correct.
- **Both full runs plateaued on the same defect before repair** — an
  uncomposed closing look-back exposing blank flats. That is a pipeline
  property, not a model property, and it is now structurally blocked: the
  skill requires every contracted route beat, especially the ending, to be
  a gated camera with a subject.
- **Specificity carried sense-of-place to 0.81** — the highest visual
  score either run produced — almost entirely through generated signage
  and named, owned story clusters. Graphic specificity is cheap for a
  model and reads as authorship; it is the most transferable lesson here.

## Residual gap to the ~0.9 hand-authored reference

Craft depth only: prop sculpt at close range (the stone foxes), and
incident on the last mute surfaces (a shutter run in the arrival frame).
Not structure, story, or discipline.
