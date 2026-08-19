# Rendering and art direction

## Contents

- Style contract
- Palette
- Materials
- Lighting
- Silhouette and line
- Atmosphere and depth
- Post-processing
- Review and failure patterns

## Style contract

Express the visual direction as operational rules, not adjectives. Define:

- geometry language: planar, rounded, chunky, cut-paper, miniature, painterly;
- value structure: high-key, nocturnal, graphic, hazy, high-contrast;
- palette roles and allowed saturation range;
- material response: matte, stepped toon, restrained PBR, emissive accents;
- edge treatment: clean silhouettes, selective outlines, screen-space ink;
- atmosphere: clear, mist, rain-cleared, dusty, dusk, interior glow;
- forbidden drift: photoreal textures, neon-everywhere, excessive bloom, etc.

Keep one visual thesis. A scene that mixes incompatible shading conventions
looks generated even when individual assets are attractive.

## Palette

Define semantic roles before individual colors:

- sky/fog/background;
- ground and path;
- primary architecture;
- secondary architecture;
- vegetation or natural mass;
- dark structural/ink tone;
- warm and cool light colors;
- one or two accents;
- emissive/signage colors.

Use value and temperature to organize space. Reserve the strongest saturation or
value contrast for landmarks, route invitations, or interaction states. Test the
palette under the actual lighting; raw hex values do not predict shaded output.

Centralize colors and material recipes. Avoid one-off near-duplicates that make
the scene visually noisy and increase draw calls.

## Materials

Use a small family of shared materials with intentional differences. For
stylized scenes, shape readability matters more than physically exact parameters.

Useful families:

- stepped/toon-lit matte solids;
- unlit printed surfaces and graphic signs;
- translucent glass/plastic with controlled depth writes;
- emissive windows or practical lights;
- water/wet ground with restrained view-dependent response;
- foliage materials that preserve lightness and mass.

Tint shadow bands rather than merely darkening them. Keep pale hero masses from
collapsing into muddy ambient shadow. Use roughness/specular variation to clarify
material class, not to decorate every surface.

## Lighting

Start with a readable key direction. Add fill only to preserve the chosen visual
language and shadow color. Use practical lights to explain local brightness, not
as arbitrary decoration.

For a stylized exterior, a reliable base is:

- one directional key with intentional color and shadow map;
- a cooler opposing fill or hemisphere contribution;
- restrained ambient/upward support;
- a fog/sky color coordinated with distant values;
- limited local emissive or point-light accents.

Tune shadows from the actual route. Follow or bound the shadow camera when the
scene is larger than one fixed high-resolution region. Prevent large closed
surfaces from casting nonsensical global shadows.

## Silhouette and line

Prioritize silhouette at three scales: skyline/landform, landmark, and prop.
Break long straight runs with meaningful height or depth changes. Preserve gaps
between overlapping important forms.

Use outlines selectively. Inverted hulls suit hero objects with a stable contour;
screen-space depth/normal lines suit broad scene coherence; geometry trim suits
edges that must exist from every view. Outlining every edge creates noise and
destroys atmospheric depth.

## Atmosphere and depth

Separate foreground, middle ground, and background using:

- scale and overlap;
- value compression with distance;
- reduced saturation/contrast;
- fog or aerial perspective;
- lower line/detail density;
- warmer/cooler temperature shifts when appropriate.

Do not use fog as a wall that hides unfinished geometry. Ensure the route and
landmarks remain readable throughout the intended viewing range.

## Post-processing

Add passes only when they serve the style contract. A restrained stack might
include color grade, selective ink, anti-aliasing, and a small vignette. Bloom,
depth of field, chromatic aberration, and film effects are not automatic quality.

Bound internal resolution by a pixel budget. Expose diagnostic toggles for
stylistic passes and verify they actually alter the pipeline. Keep color-space
conversion and tone mapping explicit.

## Review

Inspect:

- ungraded and graded views;
- with/without lines when applicable;
- thumbnail and delivery resolution;
- arrival, context, reverse, and detail cameras;
- darkest and brightest material families;
- motion/interaction states that change light or visibility.

Ask whether the image would still have hierarchy as flat shapes. If not, more
shader complexity will rarely save it.

## Failure patterns

- Choosing many attractive colors without semantic roles.
- Building lighting after materials and composition are already locked.
- Using bloom/fog/grade to manufacture mood without spatial support.
- Full-scene outlines at one strength and distance.
- Making every surface equally rough, reflective, or saturated.
- Evaluating materials in isolation rather than within the final light rig.
- Allowing a hero landmark to merge with the sky or neighboring mass.
- Treating transparent overlays as ordinary opaque meshes.
