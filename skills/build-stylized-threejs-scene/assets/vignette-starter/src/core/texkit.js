import * as THREE from 'three';

/* ------------------------------------------------------------------ *
 * Signage kit: procedural Canvas2D textures for signs, boards and
 * banners.  Ported from the Sakura Crossing flagship's texture kernel.
 *
 * Everything here is flat and low-frequency on purpose -- crisp shapes
 * and type, never photographic noise -- which is what survives the cel
 * ramp and the ink pass.  Named tenants and owners on generated signage
 * are the cheapest specificity lever a scene has: invent names, never
 * real brands, and never depict people.
 *
 * THE ASPECT RULE.  Every composite has a native aspect (w/h of its
 * canvas), and the face it lands on must match it.  A 4:1 plate mapped
 * onto a 1:6 post face is a 24-fold crush that renders as an unreadable
 * smear, not as an error -- if a sign is a blur, compare the two aspect
 * ratios before touching anything else.  Each generator's JSDoc states
 * its default aspect; size the geometry to it (e.g. a 512x128 plate on
 * a 1.6 x 0.4 m board).
 * ------------------------------------------------------------------ */

/** Font stack with JP fallbacks -- every generator uses it, so CJK text
 *  renders on any platform without shipping a font file. */
export const JP_FONT = `'Yu Gothic', 'Yu Gothic UI', 'Meiryo', 'MS Gothic', 'Hiragino Kaku Gothic ProN', sans-serif`;

const cache = new Map();

/** `0x20509e` -> `'#20509e'`. */
export const hex = (n) => '#' + n.toString(16).padStart(6, '0');

/** Accept either a palette number or a css color string. */
export const col = (v) => (typeof v === 'number' ? hex(v) : v);

/**
 * Draw once, get a THREE.CanvasTexture back.  sRGB color space (signs are
 * authored in display color) and anisotropy 4 (a fascia is almost always
 * seen at a grazing angle; without it the type dissolves ten metres out).
 *
 * @param {number} w canvas width in px
 * @param {number} h canvas height in px
 * @param {(c: CanvasRenderingContext2D, w: number, h: number) => void} draw
 * @param {{srgb?: boolean, repeat?: [number, number]|null, aniso?: number}} [opts]
 */
export function make(w, h, draw, { srgb = true, repeat = null, aniso = 4 } = {}) {
  const cv = document.createElement('canvas');
  cv.width = w;
  cv.height = h;
  const c = cv.getContext('2d');
  c.imageSmoothingEnabled = true;
  draw(c, w, h);
  const tex = new THREE.CanvasTexture(cv);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = aniso;
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
  }
  tex.needsUpdate = true;
  return tex;
}

/** Memoized `make` -- same texture object back for the same key, so a
 *  dozen identical plates cost one canvas. */
export function cached(key, w, h, draw, opts) {
  if (!cache.has(key)) cache.set(key, make(w, h, draw, opts));
  return cache.get(key);
}

/**
 * Shrink-to-fit: sets the context font at the largest size (stepping down
 * from `size`) at which `text` fits in `maxW`, and returns that size.
 * The context is left with the font set, ready to draw.
 */
export function fitText(c, text, maxW, size, font = JP_FONT, weight = 'bold') {
  let s = size;
  do {
    c.font = `${weight} ${s}px ${font}`;
    if (c.measureText(text).width <= maxW) break;
    s -= 2;
  } while (s > 6);
  return s;
}

/**
 * Fitted, centered text at (x, y).  `spacing` > 0 adds letterspacing --
 * the single cheapest way to make a shop title read as *designed* rather
 * than merely typed.  Returns the size actually used.
 */
export function centered(c, text, x, y, maxW, size, color, weight = 'bold', spacing = 0) {
  /* Fit with the letterspacing *included* -- fitting the raw string and then
   * spacing it out overflows by (chars - 1) x spacing, which on a long title
   * is the whole right column of the board.  `spacing` is nominal at `size`
   * and scales down with the fit, or a fixed gap dominates a long title and
   * drives the type to nothing. */
  const chars = [...text];
  let s = size;
  const gap = () => (spacing * s) / size;
  const total = () => chars.reduce((a, ch) => a + c.measureText(ch).width + gap(), -gap());
  do {
    c.font = `${weight} ${s}px ${JP_FONT}`;
    if (total() <= maxW) break;
    s -= 2;
  } while (s > 6);
  c.fillStyle = col(color);
  c.textAlign = spacing ? 'left' : 'center';
  c.textBaseline = 'middle';
  if (spacing) {
    let cx = x - total() / 2;
    for (const ch of chars) {
      c.fillText(ch, cx, y);
      cx += c.measureText(ch).width + gap();
    }
  } else {
    c.fillText(text, x, y);
  }
  return s;
}

/**
 * Vertical CJK stacking: one character per step down from (x, y0).
 * Latin text does not stack -- use it for kana/kanji only.
 */
export function vertical(c, text, x, y0, { step = 96, size = 76, color = '#3c3a46', weight = 'bold' } = {}) {
  c.font = `${weight} ${size}px ${JP_FONT}`;
  c.fillStyle = col(color);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  [...text].forEach((ch, i) => c.fillText(ch, x, y0 + i * step));
}

/** A thin rule, the workhorse of Japanese signage layout. */
export function rule(c, x, y, w, h, color) {
  c.fillStyle = col(color);
  c.fillRect(x, y, w, h);
}

/* ----------------------------- composites -----------------------------
 * The four forms below are the ones a scene brief reliably fills as
 * data: give each tenant a name, two colors and a sub-line, and the
 * street stops being anonymous.  All are cached on their own options.
 * --------------------------------------------------------------------- */

const key = (name, o) => name + JSON.stringify(o, (k, v) => (typeof v === 'function' ? undefined : v));

/**
 * A shop plate: bordered board with a fitted title, an optional smaller
 * sub-line and an optional accent tab down the left edge.
 *
 * Native aspect 4:1 (512x128) -- land it on a face 4x wider than tall,
 * e.g. 1.6 x 0.4 m.
 *
 * @param {{w?: number, h?: number, bg?: string|number, ink?: string|number,
 *   title?: string, sub?: string, accent?: string|number, border?: boolean}} o
 */
export function signPlate({ w = 512, h = 128, bg = '#f6f3ea', ink = '#2e3440', title = '', sub = '', accent = null, border = true } = {}) {
  return cached(key('signPlate', { w, h, bg, ink, title, sub, accent, border }), w, h, (c) => {
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    if (border) {
      c.strokeStyle = col(ink);
      c.lineWidth = Math.max(3, h * 0.03);
      c.strokeRect(c.lineWidth * 1.6, c.lineWidth * 1.6, w - c.lineWidth * 3.2, h - c.lineWidth * 3.2);
    }
    let x0 = h * 0.14;
    if (accent != null) {
      // accent tab inside the border, the way a municipal plate carries its color
      rule(c, x0, h * 0.16, h * 0.18, h * 0.68, accent);
      x0 += h * 0.34;
    }
    const cx = (x0 + w - h * 0.14) / 2;
    const maxW = w - x0 - h * 0.28;
    if (sub) {
      centered(c, title, cx, h * 0.40, maxW, h * 0.42, ink, 'bold', 4);
      centered(c, sub, cx, h * 0.76, maxW, h * 0.2, ink, '500');
    } else {
      centered(c, title, cx, h * 0.52, maxW, h * 0.5, ink, 'bold', 6);
    }
  });
}

/**
 * A frontage fascia: full-width board with top and bottom bar rules, the
 * title fitted in the left two-thirds, the sub-line in a quiet right
 * column, and optional visible panel joints (a long real fascia is bolted
 * up in sheets, and the seams are what make it read as built).
 *
 * Native aspect 6.4:1 (1024x160) -- e.g. a 6.4 x 1.0 m band over the doors.
 *
 * @param {{w?: number, h?: number, bg?: string|number, ink?: string|number,
 *   title?: string, sub?: string, panelJoints?: number}} o
 */
export function fascia({ w = 1024, h = 160, bg = '#fbfaf6', ink = '#20509e', title = '', sub = '', panelJoints = 0 } = {}) {
  return cached(key('fascia', { w, h, bg, ink, title, sub, panelJoints }), w, h, (c) => {
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    rule(c, 0, 0, w, h * 0.05, ink);
    rule(c, 0, h - h * 0.09, w, h * 0.09, ink);
    if (panelJoints > 0) {
      // seams first, so the type prints over them the way paint does
      c.globalAlpha = 0.18;
      for (let i = 1; i <= panelJoints; i++) rule(c, (w * i) / (panelJoints + 1) - 2, 0, 4, h, ink);
      c.globalAlpha = 1;
    }
    if (sub) {
      centered(c, title, w * 0.38, h * 0.5, w * 0.6, h * 0.62, ink, 'bold', 8);
      c.font = `500 ${Math.round(h * 0.2)}px ${JP_FONT}`;
      c.fillStyle = col(ink);
      c.globalAlpha = 0.6;
      c.textAlign = 'left';
      c.textBaseline = 'middle';
      c.fillText(sub, w * 0.74, h * 0.5);
      c.globalAlpha = 1;
    } else {
      centered(c, title, w * 0.5, h * 0.5, w * 0.8, h * 0.62, ink, 'bold', 10);
    }
  });
}

/**
 * A pinned paper notice: 2-6 short lines under a header bar, corner pins
 * optional.  First line is the heading and is set larger.
 *
 * Native aspect 3:4 portrait (384x512) -- e.g. a 0.3 x 0.4 m sheet on a
 * board or a wall.
 *
 * @param {{lines?: string[], bg?: string|number, ink?: string|number,
 *   pin?: boolean, w?: number, h?: number}} o
 */
export function noticeBoard({ lines = [], bg = '#fdf7e8', ink = '#4b4757', pin = true, w = 384, h = 512 } = {}) {
  return cached(key('noticeBoard', { lines, bg, ink, pin, w, h }), w, h, (c) => {
    c.fillStyle = col(bg);
    c.fillRect(0, 0, w, h);
    rule(c, 0, 0, w, h * 0.045, ink);
    const [head, ...rest] = lines.length ? lines : ['お知らせ'];
    centered(c, head, w / 2, h * 0.16, w - 60, h * 0.11, ink, 'bold', 4);
    rule(c, w * 0.14, h * 0.235, w * 0.72, 3, ink);
    const body = rest.slice(0, 5);
    const step = h * 0.55 / Math.max(body.length, 3);
    body.forEach((line, i) => centered(c, line, w / 2, h * 0.33 + i * step, w - 70, h * 0.068, ink, '500'));
    if (pin) {
      c.fillStyle = '#b8452f';
      for (const [px, py] of [[w * 0.09, h * 0.085], [w * 0.91, h * 0.085]]) {
        c.beginPath();
        c.arc(px, py, w * 0.022, 0, Math.PI * 2);
        c.fill();
      }
    }
  });
}

/**
 * A hanging cloth panel.  Horizontal mode is a noren: the text fitted in
 * the middle and two slits cut through with `destination-out`, so the
 * gaps are genuinely transparent -- use a transparent material.  Vertical
 * mode is a nobori-style banner that stacks CJK top to bottom.
 *
 * Native aspect: horizontal 2:1 (512x256), vertical 1:4 (192x768) --
 * e.g. 1.6 x 0.8 m over a doorway, or 0.45 x 1.8 m beside it.
 *
 * @param {{text?: string, bg?: string|number, ink?: string|number,
 *   vertical?: boolean, w?: number, h?: number}} o
 */
export function banner({ text = '', bg = '#b8452f', ink = '#f6ecdc', vertical: vert = false, w, h } = {}) {
  const W = w ?? (vert ? 192 : 512);
  const H = h ?? (vert ? 768 : 256);
  return cached(key('banner', { text, bg, ink, vert, W, H }), W, H, (c) => {
    c.fillStyle = col(bg);
    c.fillRect(0, 0, W, H);
    if (vert) {
      // inset border, then stack -- a nobori is a framed column of type
      c.strokeStyle = col(ink);
      c.lineWidth = 6;
      c.strokeRect(12, 12, W - 24, H - 24);
      const chars = [...text];
      const step = Math.min(W * 0.62, (H - 120) / Math.max(chars.length, 1));
      const y0 = H / 2 - ((chars.length - 1) * step) / 2;
      vertical(c, text, W / 2, y0, { step, size: Math.min(W * 0.56, step * 0.86), color: ink });
    } else {
      /* A noren is split into hanging panels and the slits go through
       * whatever is printed on it.  A single character sits inside one
       * panel; longer labels get sliced, which is what real ones do. */
      const chars = [...text];
      if (chars.length === 1) centered(c, text, W / 2, H * 0.46, W / 3 - 20, H * 0.5, ink, 'bold');
      else centered(c, text, W / 2, H * 0.46, W - 90, H * 0.46, ink, 'bold', 8);
      c.globalCompositeOperation = 'destination-out';
      for (const x of [W * 0.33, W * 0.66]) c.fillRect(x - 4, H * 0.3, 8, H);
      c.globalCompositeOperation = 'source-over';
    }
  });
}
