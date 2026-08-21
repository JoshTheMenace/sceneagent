# Sallowport — the city-scale shakedown

**Prompt:** a coordinator-written city plan for a 4-district coastal fishing
town (~25 buildings), built by four agents working **in isolation** from
parcel contracts alone — they never saw each other's work.

The question it existed to answer: **does decomposition hold quality flat, or
dilute it?** A single agent spending its entire context on one alley had
previously scored 0.801.

## Result

Four districts merged with **zero integration conflicts** — all 5 seams green,
all 14 waypoints reachable, no spatial defects, 751 meshes, the whole gate
suite in 0.4 s.

| | composition | place | art | story | runtime | maint | perf | overall |
|---|---|---|---|---|---|---|---|---|
| quay | 0.66 | 0.76 | 0.68 | 0.66 | 0.60 | 0.82 | 0.85 | 0.705 |
| market-row | 0.66 | 0.80 | 0.72 | 0.72 | 0.62 | 0.80 | 0.85 | 0.728 |
| net-lofts | 0.68 | 0.82 | 0.70 | 0.78 | 0.62 | 0.86 | 0.86 | 0.748 |
| headland | 0.68 | 0.78 | 0.76 | 0.76 | 0.68 | 0.86 | 0.84 | 0.753 |
| **city** | seams 0.72 · skyline 0.66 · coherence 0.80 · route 0.70 | | | | | | | **0.721** |

**Overall 0.729 against a 0.78 bar — fail.**

## What it proved

**Decomposition diluted quality by ~0.07, and diluted exactly one thing.**
Sense of place (0.76–0.82), maintainability (0.80–0.86) and performance all
held at or above the single-agent reference. Art direction held within a few
points. **Composition alone collapsed, identically, in all four districts.**

The reviewer's diagnosis: *"An agent that cannot see its neighbours composes
its interior well and composes its edges against nothing."*

The named highest-impact city defect was one line in the contract: **ground
was a per-district responsibility.** Disjoint envelopes, each district
platforming its own rectangle, nothing owning what lay between or beyond —
which produced floating slabs in every overhead frame, a headland whose rock
ended in mid-air over the water, a void behind a boundary wall, and blank
planes at the foot of two seam descents. **No district agent could have fixed
it from inside its parcel.**

Meanwhile the shared kit worked: cross-district coherence at 0.80 was the best
city score. Four isolated agents produced one town, with no accent leaks.

## What the shakedown changed

Every finding became a contract or a gate, which is what a shakedown is for:

- **Terrain is coordinator-owned and built first** — one continuous surface
  over the whole footprint including the surrounds, with both halves of every
  crossing made by construction. Districts dress it.
- **Neighbour stub massing** so an isolated agent composes against something,
  and a per-socket frame shot **from the neighbour's side** as an acceptance
  artefact.
- **Sight corridors** put a cross-district requirement in every crossed
  district's brief. The first city told the *headland* its lighthouse "must
  read from the row" — a fact about the row's massing.
- **Boundary features and surrounds get owners.** Two districts each raised a
  wall on the same line and composed correctly only by luck.
- **Compass and sun in the plan, rig derived from them.** A palette note
  promising south-east light against a rig aimed south-west is a bug nobody
  owns.
- **Landmarks got a reader; every district must contribute an interaction.**
  The first city shipped zero interactables and its whole interaction runtime
  was dead code, because no brief asked.
- Budgets moved to **meshes** (districts finished at 218/220 meshes while using
  12–24% of their triangle allowance).

Convergent evidence is the strongest signal here: **three of four agents
independently hand-patched the same two kit defects**, and two or more
independently wrote `stairRail`, `wallRun`, `pier`, `bench` and `leanTo` — all
now in the shared kit, and the kit stage is gated before districts start.

## Honest trade

One agent spent its whole context on one alley for 0.801 and produced no
reusable tooling. This spent five agents for 0.73 across four districts and
produced a kit, a terrain stage, a seam skeleton and a gate suite that
survive. That trade is bad for a hero vignette and good for a city — provided
the contract stops making composition the one thing nobody owns.
