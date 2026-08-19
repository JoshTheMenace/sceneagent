# Runtime, traversal, and performance

## Contents

- Runtime contract
- Traversal
- Interaction
- Animation lifecycle
- Accessibility and failure handling
- Performance budgets
- Measurement
- Failure patterns

## Runtime contract

Define the supported browser/input path, renderer, camera, movement model, pause
behavior, reset behavior, and resize lifecycle before adding scene-specific code.
Keep the composition root responsible for construction and orchestration; keep
builders independent from global browser state where practical.

Expose a small scene API for evaluation:

```js
{
  scene,
  camera,
  renderer,
  update(dt),
  dispose(),
  reviewCameras,
  diagnostics,
}
```

Stable review cameras and diagnostics make autonomous evaluation substantially
more reliable than asking an evaluator to discover the scene blindly.

## Traversal

Set physical constants in world units: eye height, body radius, step height,
walk/run speed, interaction distance, and slope limit if applicable.

Keep routes legible and physically passable. Verify:

- spawn is supported, unobstructed, and facing useful content;
- doors, gaps, paths, stairs, ramps, and bridges meet the player envelope;
- colliders match visible obstacles and do not create invisible walls;
- elevated platforms do not teleport visitors from below;
- moving barriers update collision state coherently;
- reset returns to a valid state;
- visitors cannot fall into unfinished voids without a designed response.

Substep fast movement or use swept tests where thin obstacles matter. Do not add
a full physics engine unless scene behavior justifies its cost.

## Interaction

An interaction should reveal character, state, or place. Define:

- target and hit area;
- readable prompt or affordance;
- verb;
- immediate response;
- persistent state, reset, and repeated-use behavior;
- audio/visual feedback;
- meaning within the scene promise.

Prefer one memorable interaction over five identical toggles. Keep hit areas
forgiving and within the declared interaction distance. Prevent one object from
capturing input intended for global movement or pause behavior.

## Animation lifecycle

Use one frame loop. Cap or stabilize large delta times. Batch similar updates.
Pause or reduce work when the page is hidden. Separate object placement from the
animated pivot so motion does not corrupt world transforms.

Handle:

- start before user gesture;
- pointer-lock acquire/release;
- hidden tab and resumed tab;
- resize and device-pixel-ratio changes;
- repeated interaction during an active animation;
- reset while animation is active;
- cleanup of listeners, timers, materials, targets, and textures when owned.

## Accessibility and failure handling

Provide keyboard operation and visible focus for non-pointer-lock controls. Keep
prompts readable against the scene. Respect reduced-motion preferences for HUD
and nonessential camera effects. Avoid flashing or high-frequency luminance
changes. Provide a clear message when WebGL or a required graphics capability is
unavailable.

Treat blocked autoplay and clipboard access as normal browser conditions. Keep
the world usable in silence. Do not make critical information depend only on
color or audio.

## Performance budgets

Set budgets in the scene contract. Default desktop targets for a small vignette:

- stable 60 FPS aspiration, with no sustained frame worse than 33 ms;
- bounded pixel ratio or internal pixel budget;
- at most one primary directional shadow map plus justified local shadows;
- no unbounded per-frame allocations;
- repeated static geometry merged or instanced;
- texture sizes proportional to delivery resolution;
- no asset or shader compilation errors;
- load and first-interaction behavior that does not appear frozen.

Do not enforce universal triangle or draw-call numbers without measuring the
target device and material/shader costs. Record scene statistics so regressions
are visible.

## Measurement

Distinguish evidence levels:

1. Syntax/type/build checks.
2. HTTP/application readiness.
3. Renderer capability and console-error checks.
4. Deterministic scene statistics and traversal probes.
5. Browser interaction and camera-state checks.
6. Opened visual artifacts from required views.
7. Human or independent-model aesthetic judgment.

A passing level never proves the levels after it.

Measure at arrival and the heaviest route view. Record render size, backend,
frame timing, draw calls, triangles, textures, programs, and shadow configuration
when available. Compare against the prior accepted version, not a remembered
number.

## Failure patterns

- Equating a successful build with a functioning scene.
- Designing collision after visual placement is complete.
- One updater or material instance per tiny repeated object.
- Unbounded device pixel ratio or shadow camera.
- Capturing performance only from an empty arrival view.
- Adding controls without pause, reset, or pointer-lock-loss behavior.
- Animating global transforms that also encode placement.
- Claiming visual quality without opening rendered artifacts.
