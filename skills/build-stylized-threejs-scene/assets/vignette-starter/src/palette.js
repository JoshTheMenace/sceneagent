/**
 * Role-based palette. Every colour in the scene comes from here, keyed by
 * role rather than by hue, so the whole grade can be retuned in one place.
 * The values below are neutral-but-pleasant placeholders: replace them from
 * the filled scene contract's `art_direction.palette_roles` before building.
 *
 * Value-ladder rules — these are what make the 2D look, not the shaders:
 *
 * - The whole scene lives in a NARROW value range. Ink is the darkest thing
 *   in the frame and it is not black; paper is the lightest and it is not
 *   white. Everything else sits between them, which is why a frame reads as
 *   painted rather than rendered.
 * - Large shaded areas must stay above ~0.30 relative luminance AFTER the
 *   cel ramp's bottom band (~0.36x) is applied. A "dark green" wall reads as
 *   black on its shadow side; lift the base colour instead of trusting the
 *   lights. The flagship lifted its forest greens and bottle greens for
 *   exactly this.
 * - Shadow is a HUE shift (toward the violet shadowTint), never just a darker
 *   copy of the base colour. Choosing a lighter colour does not help a
 *   surface that gets no direct light at all — that surface sits on the
 *   ramp's bottom band no matter what; keep its base value high.
 * - ONE saturated accent per area. The accent is loud precisely because
 *   nothing else is; a second one in the same frame halves both.
 * - Ground uses a ladder of 3-4 steps of the same hue family, light to dark,
 *   so wear, edges, and depth read without any texture detail.
 */
export const PAL = Object.freeze({
  // --- ink & paper: the two ends of the value range ---
  ink: 0x3a3450, // outlines + darkest structural tone; desaturated blue-violet, never black
  paper: 0xf5efe4, // the lightest large surface; warm off-white, never pure white

  // --- sky trio: top of frame -> horizon -> warm haze at the ground line ---
  sky: { top: 0x93b8e4, mid: 0xd3e4f5, haze: 0xf0e7e2 },
  fog: 0xe4e9f2, // atmospheric fade; keep near the sky's horizon tone

  // --- light rig (see the RIG table in main.js) ---
  sun: 0xfff0d6, // warm quantised key
  fill: 0xa8bcf0, // cool bounce from the opposite quarter; carries the shadow side
  bounce: 0xd6cae6, // weak below-front bounce so undersides never go flat black
  hemiSky: 0xdaeafc,
  hemiGround: 0xb4a6c4, // VIOLET ground hemisphere: nothing in shadow ever goes black

  // --- shadow tints ---
  shadowTint: 0x6c5f8c, // material-level: cel ramp's dark bands lean toward this
  gradeShadow: 0xaca7ce, // grade pass split-tone, darks
  gradeLight: 0xfff6e6, // grade pass split-tone, lights

  // --- ground ladder, light -> dark ---
  ground: 0xd8d4de,
  groundMid: 0xb6b1c0,
  groundDark: 0x8c889a,
  groundDeep: 0x6c677a,

  // --- built masses ---
  primary: 0xe8e1d2, // hero structure walls
  secondary: 0xa9afb9, // supporting masses, trim, furniture
  trim: 0x8a8496,
  glass: 0x9dc0d4,

  // --- accents: spend sparingly, one per area ---
  accent: 0xd94f42, // the warm one
  accentCool: 0x2f9c9a, // the cool one
  warmLight: 0xffc875, // practical / emissive light sources
});
