# SDK comparison results

Evaluated 2026-08-06 at 1440×900 against the same scene contract, cameras, controls, and runtime probes. The custom source identity is `047b20ea…da1ab`; Babylon is `f0fd6a12…54f3d`.

## Outcome

**Use the narrow custom SDK over Three.js as the primary scene-generation substrate for this repository.** It reached the stronger combined score, had simpler predictable traversal semantics, rendered in fewer calls, and shipped less JavaScript. Babylon remains a credible alternative for a game that needs more built-in engine systems, but agents should receive a locked scaffold that hides its coordinate, collision, shadow, import-side-effect, and instrumentation footguns.

Both implementations passed the `0.78` weighted scene threshold. This is a directional result from one scene—not enough to make Babylon a permanent rejection.

| Result | Custom Three SDK | Babylon.js |
|---|---:|---:|
| Weighted scene score | **0.8176** | 0.7840 |
| Static/framework assertions | 9/9 | 12/12 |
| Browser console/runtime errors | 0 | 0 |
| Continuous ascent after 4.5 s | y 2.974 / surface 2.974 | y 2.695 / surface 2.681 |
| Moving lower route under deck | y 0.150 | y 0.158 |
| Gate collider + courier pause/resume | pass | pass |
| Meshes | 98 | 135 |
| Triangles | 7,304 | 8,266 |
| Draw calls, arrival | **56** | 121 |
| p95 frame time, sampled browser | 9.7 ms | **9.3 ms** |
| Main JS, raw | **538 KB** | 1,303 KB |
| Main JS, gzip | **141 KB** | 318 KB |
| Installed dependencies | **54 MB** | 134 MB |
| Implementation JS/MJS | 666 lines | **593 lines** |

The browser frame samples came from the same local machine and viewport, not a controlled hardware lab. Bundle values are from final Vite production builds.

## Evaluator breakdown

| Category | Weight | Custom | Babylon | Evidence summary |
|---|---:|---:|---:|---|
| Composition | .22 | .78 | .77 | Both establish cart → bridge → teahouse depth; the near tower remains heavy. |
| Sense of place | .18 | .77 | .74 | Custom has the clearer bell, warmer material contrast, and stronger mill/cart read. |
| Art direction | .16 | .77 | .75 | Both are coherent; Babylon required explicit light/shadow calibration and remains flatter. |
| Exploration/story | .14 | .76 | .74 | Elevated and lower routes, courier, gate, mill, and repair clues work; the underpass is sparse. |
| Runtime/traversal | .12 | .93 | .89 | Both pass; custom height semantics were easier to make deterministic. |
| Maintainability | .10 | .91 | .83 | Custom centralizes game concepts; Babylon removes SDK code but leaks more engine-specific setup. |
| Performance | .08 | .94 | .85 | Both are stable; custom uses half the draw calls and less than half the compressed main bundle. |

The scorer was the same agent that built the scenes, so the absolute visual numbers are not independent. Matched images and deterministic gates carry more weight than the small score difference.

## What the test taught us

### Custom SDK

The custom layer needed 166 lines for surfaces, vertical collider envelopes, walking, diagnostics, lifecycle, and batching. That investment paid off when the bridge had to support two valid heights at the same X/Z position: a low player stayed beneath it while an elevated player stayed on its deck. The first live image caught a cart wheel rotated into the ground; the assembly was repaired and recaptured. Static compilation then reduced draw calls from 243 to 56 without changing the authoring model.

The main risk is ownership. Streaming, animation graphs, physics, save state, navmeshes, NPC scheduling, and editing would all need deliberate additions. The right strategy is a small declarative SDK, not recreating a general game engine.

### Babylon.js

Babylon produced the test with 73 fewer implementation lines because camera collision, gravity, picking, shadows, instrumentation, and mesh merging already exist. That supports the hypothesis that agents can assemble a useful game slice quickly from well-known APIs.

The framework did not eliminate integration work. The initial pass exposed left- versus right-handed view mirroring, shadow acne, excessive light intensity, an incorrect ellipsoid-origin assumption, gravity tunneling, canvas focus requirements, cumulative draw-call instrumentation, merge settings that preserved too many draws, and a required shadow scene-component side-effect. A wildcard or named barrel import produced 6.01 MB of JavaScript; granular imports plus the required shadow component reduced the main chunk to 1.30 MB.

Babylon becomes more attractive as requirements move toward skeletal animation, physics, asset pipelines, a formal editor, or broader engine integrations. If selected, put those engine details in a tested scaffold so scene-building agents see stable verbs instead of raw configuration.

## Remaining limitations

- This is one code-native outdoor hamlet, built and judged by the same agent.
- Neither project tests streaming districts, persistence, combat, skeletal animation, audio, mobile input, or multiplayer.
- The lower route is mechanically correct but visually under-detailed compared with Sakura Crossing.
- Performance was sampled locally in a browser; no low-end GPU or mobile profile ran.
- No external asset pipeline was tested, so Babylon's broader asset tooling received little opportunity to help.

Before making an irreversible engine choice, run three isolated holdouts: an interior with doors and inventory, a physics-heavy market scene, and a streamed multi-district town. Freeze each scaffold, use separate builders, and evaluate with the same public rubric.
