# Compact Scene Skill Results

## Result

The short skills preserved the engineering scaffold but not yet the target visual quality. All six agents produced valid, deterministic, buildable Three.js projects from 226–282 words of guidance. None reached the `0.78` acceptance score on its raw first attempt.

The scorecard variant had the highest mean. The workflow variant won two of the three direct scene comparisons and was more consistent. This is a small balanced-incomplete experiment, so the useful conclusion is the shape of the next skill—not a permanent winner.

| Skill | Words | Context reduction | Scene 1 | Scene 2 | Mean | Range |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Principles | 226 | 96.2% | Snow `0.5928` | Coast `0.5832` | `0.5880` | `0.0096` |
| Workflow | 282 | 95.2% | Coast `0.5870` | Desert `0.6196` | `0.6033` | `0.0326` |
| Scorecard | 266 | 95.5% | Desert `0.5894` | Snow `0.6872` | **`0.6383`** | `0.0978` |

The comparison baseline contains 5,893 words across its entrypoint and six references. Context reduction is measured against that package.

## Pairwise results

| Scene | Preferred build | Difference | Reason |
| --- | --- | ---: | --- |
| Snowbound bus stop | Scorecard over principles | `+0.0944` | Clearer route, stronger place specificity, and more cohesive art direction. |
| Fisherman's courtyard | Workflow over principles | `+0.0038` | Nearly tied; more usable cameras outweighed the principles build's stronger single arrival. |
| Radio outpost | Workflow over scorecard | `+0.0302` | Better arrival framing, palette hierarchy, silhouettes, and visible operational story. |

## What transferred through tiny context

- Six of six contracts validated and six of six production builds passed when rerun centrally.
- Every project replaced the starter subject, used generated/code-native assets, exposed five named cameras, included one reversible interaction, supported reset, and reported diagnostics.
- The scenes were specific rather than generic: schedules and snow-clearing evidence, net-mending and hull repair, and radio-maintenance systems all survived the compression.
- Fixed-camera performance samples initialized cleanly and generally reported 120 average FPS with roughly 8.4–9.3 ms p95 frame times. These are short review-camera samples, not sustained traversal proof.

## What did not transfer reliably

Composition was the repeated failure. Oversized foreground snow, blank walls, a dish filling the detail frame, and near geometry blocking reverse cameras made several authored landmarks and story clues invisible. All three compact skills explicitly asked for finished review views, so adding more prose about composition is unlikely to solve this alone.

The decisive missing mechanism was visual feedback. Builders were intentionally forbidden from opening browsers so the test could use one centrally managed tab without orphaned processes. That made this a clean test of first-pass generation, but it also overrode each skill's render-and-inspect step. The low camera scores show that actual renders are not replaceable by a longer instruction file.

Traversal, live interaction, accessibility, and exact-source provenance remained unverified in the evaluator reviews. Static hooks and fixed-camera initialization are not evidence that a visitor can complete the route.

## Recommendation

Use a roughly 275-word scorecard/workflow hybrid as the next candidate:

1. Keep the scorecard's weighted outcomes and hard thresholds; they produced the highest mean and the best individual scene.
2. Keep the workflow's ordered `promise → contract → blockout → compose → art-direct → story → prove` sequence; it generalized more consistently across two scene types.
3. Add one mechanical camera assertion: every review frame must show its named subject, contain no accidental near-plane obstruction, and retain a readable foreground/midground/background. A failed frame blocks handoff.
4. Give the builder the five renders back as context and allow one repair pass. This is higher-value context than hundreds of additional guidance words.
5. Keep runtime/accessibility requirements as gates, not long tutorials; the shared starter already carries most implementation knowledge.

The next meaningful test is not another longer skill. It is the same compact skill with a controlled screenshot-feedback loop, one browser tab, and one corrective pass per agent.

## Evidence boundary

This experiment used six builders and three independent paired evaluators. Each compact skill was tested on two scenes; each scene was built with two skills. Because every skill did not build every scene and there are only two samples per skill, differences should be treated as directional evidence. No tested skill should replace the baseline solely on these scores yet.
