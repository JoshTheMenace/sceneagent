# Evaluation rubric

## Contents

- Evaluation integrity
- Required evidence
- Hard gates
- Weighted visual/product rubric
- Decision protocol
- Skill-iteration protocol
- Review JSON shape

## Evaluation integrity

Keep the builder and final evaluator independent when possible. Give the builder
the scene brief, skill, and public quality contract. Keep benchmark holdouts,
prior failure diagnoses, and expected fixes out of builder context.

Freeze one skill version across a batch. Do not edit the skill after every scene.
Aggregate repeated failures, propose one focused revision, and rerun development
briefs plus unseen holdouts.

Never let a scalar score replace visual inspection. Use deterministic tools to
establish facts and an evaluator to judge composition, story, and coherence.

## Required evidence

Require:

- source revision or artifact identity;
- validated `scene-contract.json`;
- build/type/syntax results available in the project;
- arrival render at delivery aspect ratio;
- context render showing the footprint;
- detail render showing story/material quality;
- reverse or route-beat render exposing non-hero surfaces;
- interaction/motion evidence when present;
- renderer and performance statistics;
- known limitations and unverified claims.

Open every primary artifact before judging it. Record which artifacts were
actually inspected.

## Hard gates

Fail regardless of aesthetic score when any applicable gate is false:

- project builds and the scene initializes;
- required artifacts exist and were opened;
- multiple useful viewpoints are present;
- spawn and primary route are traversable;
- no blocking console/runtime/render errors;
- controls, reset, and resize remain usable;
- asset policy and provenance are satisfied;
- no severe accessibility failure;
- performance stays within the declared minimum;
- evaluation is tied to the exact submitted source/artifacts.

When browser tooling is unavailable, mark visual and interaction gates unverified,
not passed.

## Weighted rubric

Score each category from 0 to 1 using evidence. The initial weights encode the
agreed quality hierarchy:

| Category | Weight | What to judge |
|---|---:|---|
| Composition | 0.22 | Arrival hierarchy, depth, negative space, landmark framing, multi-view integrity |
| Sense of place | 0.18 | Specificity, emotional promise, cultural/functional coherence, memorability |
| Art direction | 0.16 | Palette, lighting, silhouettes, materials, atmosphere, stylistic unity |
| Exploration and story | 0.14 | Route beats, reveals, story clues, reverse-view quality, interaction meaning |
| Runtime and traversal | 0.12 | Controls, collision, reachability, lifecycle, interaction behavior |
| Maintainability | 0.10 | Deterministic data, reusable builders, clear ownership, asset provenance |
| Performance | 0.08 | Measured stability, batching/reuse, pixel/shadow bounds, lack of regressions |

Do not award points for raw object count, footprint, realism, or feature quantity.
Complexity only matters when it improves a weighted category.

### Score anchors

- **0.9–1.0:** unusually intentional; evidence shows no meaningful weakness for
  the requested scope.
- **0.75–0.89:** strong and coherent; weaknesses are localized and non-blocking.
- **0.6–0.74:** competent but generic, uneven, or visibly under-resolved.
- **0.4–0.59:** major layer is weak or contradictory; revision required.
- **0–0.39:** absent, broken, or fundamentally misaligned.

Require an overall score of at least 0.78, no category below 0.55, and
composition, sense of place, and art direction each at least 0.70 for an initial
pass. Treat these as a starting benchmark to calibrate with human judgments.

## Review method

For each category:

1. State the score.
2. Cite visible or structural evidence.
3. Name the highest-impact defect.
4. Propose the smallest correction that addresses its cause.
5. State confidence and missing evidence.

Compare views as a set. A hero view can pass while context/reverse views expose a
stage set. Do not compare nonmatching cameras with pixel difference metrics.

Use pairwise comparison against the prior accepted version when revising. Ask
which version better fulfills the same scene contract before looking at absolute
scores.

## Decision protocol

Choose one:

- `continue`: all gates pass and the current stage meets its threshold.
- `revise-contract`: the premise, route, composition, or art rules are wrong.
- `revise-code`: the contract is sound but implementation is deficient.
- `request-input`: missing authority, reference, or product choice changes scope.
- `stop`: correction budget is exhausted, requirements conflict, or the target
  cannot be reached honestly.

Limit corrections to three per stage and eight total by default. Stop early on
repeated defects, oscillation, or plateau. Do not conceal a plateau by adding
unrelated detail.

## Skill-iteration protocol

Use an outer loop:

1. Freeze skill version N.
2. Run a diverse batch with isolated builders.
3. Evaluate independently using identical public criteria.
4. Cluster failures by root cause.
5. Propose the smallest skill/reference/script change covering repeated failures.
6. Create version N+1.
7. Rerun prior scenes, adversarial briefs, and unseen holdouts.
8. Promote only when aggregate quality improves without material regressions or
   excessive token/runtime cost.

Keep the evaluator rubric versioned separately. Retain raw prompts, source,
renders, reports, timings, model identifiers, and skill hashes.

## Review JSON shape

Use this structure with `scripts/score_scene_review.py`:

```json
{
  "scene": "rain-cleared-tram-stop",
  "skill_version": "0.1.0",
  "artifacts_opened": ["arrival.png", "context.png", "detail.png", "reverse.png"],
  "gates": {
    "build": true,
    "artifacts": true,
    "multi_view": true,
    "traversal": true,
    "runtime": true,
    "asset_policy": true,
    "accessibility": true,
    "performance": true,
    "provenance": true
  },
  "scores": {
    "composition": 0.82,
    "sense_of_place": 0.80,
    "art_direction": 0.84,
    "exploration_story": 0.76,
    "runtime_traversal": 0.88,
    "maintainability": 0.83,
    "performance": 0.86
  },
  "evidence": {
    "composition": "Arrival view has foreground scale, clear route, and landmark reveal.",
    "sense_of_place": "Wet rails, a closed kiosk, and the last timetable imply a specific recent departure.",
    "art_direction": "Cool rain light and one warm practical preserve the declared palette hierarchy.",
    "exploration_story": "The route moves from shelter to platform reveal and ends on the empty track.",
    "runtime_traversal": "All route beats were walked; collision, pause, resize, and interaction remained stable.",
    "maintainability": "Builders share named materials, seeded placement, and explicit ownership.",
    "performance": "Measured renderer statistics and frame timing remain within the declared budget."
  },
  "highest_impact_defect": "The reverse route loses the palette hierarchy.",
  "decision": "continue",
  "confidence": 0.82,
  "limitations": []
}
```
