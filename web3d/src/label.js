// Draws a Fizzbok can label on a 2D canvas. The label wraps the can, so
// x = width / 2 is the front of the can and x = 0 / x = width is the back seam.
const BRAND = 'FIZZBOK';
const FONT = '"Segoe UI", "Helvetica Neue", Helvetica, Arial, sans-serif';
// Label cylinder: radius 1.006, height 2.62, so circumference / height = 2.4126.
export const LABEL_ASPECT = 2.4126;

// Small deterministic random, so every render of a flavor looks the same.
function seeded(seed) {
  let s = seed >>> 0;
  return function () {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function measureSpaced(ctx, text, spacing) {
  const chars = Array.from(text);
  if (!chars.length) return 0;
  return chars.reduce((sum, c) => sum + ctx.measureText(c).width, 0) + spacing * (chars.length - 1);
}

function spacedText(ctx, text, x, y, spacing, mode) {
  const chars = Array.from(text);
  const widths = chars.map((c) => ctx.measureText(c).width);
  const total = measureSpaced(ctx, text, spacing);
  let cx = x - total / 2;
  chars.forEach((c, i) => {
    if (mode === 'stroke') ctx.strokeText(c, cx, y);
    else ctx.fillText(c, cx, y);
    cx += widths[i] + spacing;
  });
  return total;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function peach(ctx, x, y, r, f) {
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, '#ffe2b8');
  g.addColorStop(0.55, f.fruit);
  g.addColorStop(1, f.bottom);
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x - r * 0.18, y, r, 0, Math.PI * 2);
  ctx.arc(x + r * 0.18, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(160, 40, 40, 0.25)';
  ctx.lineWidth = r * 0.06;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 0.85);
  ctx.quadraticCurveTo(x - r * 0.12, y, x, y + r * 0.8);
  ctx.stroke();
  leaf(ctx, x + r * 0.35, y - r * 1.02, r * 0.55, -0.6, f.leaf);
}

function lime(ctx, x, y, r, f) {
  ctx.fillStyle = f.leaf;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#f4ffd8';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.88, 0, Math.PI * 2);
  ctx.fill();
  const g = ctx.createRadialGradient(x, y, r * 0.1, x, y, r * 0.8);
  g.addColorStop(0, '#f6ffc2');
  g.addColorStop(1, f.fruit);
  for (let i = 0; i < 8; i++) {
    const a0 = (i / 8) * Math.PI * 2 + 0.06;
    const a1 = ((i + 1) / 8) * Math.PI * 2 - 0.06;
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x + Math.cos((a0 + a1) / 2) * r * 0.1, y + Math.sin((a0 + a1) / 2) * r * 0.1);
    ctx.arc(x, y, r * 0.8, a0, a1);
    ctx.closePath();
    ctx.fill();
  }
}

function berries(ctx, x, y, r, f) {
  const rnd = seeded(7);
  const spots = [[0, 0], [-0.62, -0.35], [0.6, -0.4], [-0.5, 0.5], [0.55, 0.45], [0, -0.85], [0.05, 0.85]];
  spots.forEach(([dx, dy], i) => {
    const cx = x + dx * r;
    const cy = y + dy * r;
    const rr = r * (0.42 + rnd() * 0.12);
    const g = ctx.createRadialGradient(cx - rr * 0.35, cy - rr * 0.35, rr * 0.1, cx, cy, rr);
    g.addColorStop(0, '#ffd1ea');
    g.addColorStop(0.5, i % 2 ? f.fruit : '#ff3d8b');
    g.addColorStop(1, '#7a1f6e');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, rr, 0, Math.PI * 2);
    ctx.fill();
  });
  leaf(ctx, x - r * 0.2, y - r * 1.35, r * 0.6, -1.1, f.leaf);
}

function leaf(ctx, x, y, len, angle, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(len * 0.5, -len * 0.45, len, 0);
  ctx.quadraticCurveTo(len * 0.5, len * 0.45, 0, 0);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = len * 0.04;
  ctx.beginPath();
  ctx.moveTo(len * 0.05, 0);
  ctx.lineTo(len * 0.9, 0);
  ctx.stroke();
  ctx.restore();
}

const FRUIT = { peach, lime, berry: berries };

function backPanel(ctx, cx, W, H, f) {
  const w = W * 0.22;
  const h = H * 0.5;
  ctx.save();
  ctx.translate(cx, H * 0.5);
  roundRect(ctx, -w / 2, -h / 2, w, h, H * 0.04);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
  ctx.fill();
  ctx.lineWidth = H * 0.006;
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.stroke();
  ctx.fillStyle = f.ink;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${Math.round(H * 0.05)}px ${FONT}`;
  spacedText(ctx, 'DEMO PRODUCT', 0, -h * 0.3, H * 0.006);
  ctx.font = `600 ${Math.round(H * 0.036)}px ${FONT}`;
  const lines = ['Made up by', 'Sam Squared Softwares', 'to show what your', '3D website can do.'];
  lines.forEach((line, i) => spacedText(ctx, line, 0, -h * 0.08 + i * H * 0.058, 0));
  ctx.restore();
}

/**
 * Returns a canvas with the label for one flavor.
 * @param {object} f flavor from FLAVORS
 * @param {number} W canvas width in pixels (height follows the label aspect)
 */
export function drawLabel(f, W) {
  const H = Math.round(W / LABEL_ASPECT);
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');

  // ground
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, f.top);
  bg.addColorStop(1, f.bottom);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // soft diagonal bands
  ctx.save();
  ctx.globalAlpha = 0.06;
  ctx.fillStyle = '#ffffff';
  for (let x = -H; x < W + H; x += H * 0.42) {
    ctx.beginPath();
    ctx.moveTo(x, H);
    ctx.lineTo(x + H * 0.16, H);
    ctx.lineTo(x + H * 0.16 + H * 0.7, 0);
    ctx.lineTo(x + H * 0.7, 0);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // halo behind the wordmark
  const halo = ctx.createRadialGradient(W / 2, H * 0.47, 0, W / 2, H * 0.47, H * 0.42);
  halo.addColorStop(0, 'rgba(255,255,255,0.2)');
  halo.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = halo;
  ctx.fillRect(0, 0, W, H);

  // bubbles
  const rnd = seeded(f.id.length * 97 + 13);
  for (let i = 0; i < 70; i++) {
    const r = H * (0.006 + rnd() * 0.022);
    ctx.globalAlpha = 0.12 + rnd() * 0.22;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(1, r * 0.25);
    ctx.beginPath();
    ctx.arc(rnd() * W, rnd() * H, r, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // fruit, both sides of the front
  const art = FRUIT[f.id];
  art(ctx, W / 2 - W * 0.255, H * 0.5, H * 0.17, f);
  art(ctx, W / 2 + W * 0.255, H * 0.46, H * 0.15, f);

  // printed bands near the rims
  ctx.fillStyle = 'rgba(0, 0, 0, 0.16)';
  ctx.fillRect(0, 0, W, H * 0.03);
  ctx.fillRect(0, H * 0.97, W, H * 0.03);

  // wordmark
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = f.ink;
  ctx.font = `700 ${Math.round(H * 0.036)}px ${FONT}`;
  spacedText(ctx, 'SPARKLING CRAFT SODA', W / 2, H * 0.15, H * 0.007);

  ctx.save();
  ctx.shadowColor = 'rgba(40, 0, 30, 0.28)';
  ctx.shadowOffsetY = H * 0.012;
  ctx.font = `900 ${Math.round(H * 0.28)}px ${FONT}`;
  spacedText(ctx, BRAND.slice(0, 4), W / 2, H * 0.43, H * 0.004);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = H * 0.012;
  ctx.strokeStyle = f.ink;
  ctx.font = `900 ${Math.round(H * 0.28)}px ${FONT}`;
  spacedText(ctx, BRAND.slice(4), W / 2, H * 0.69, H * 0.02, 'stroke');
  ctx.restore();

  // flavor pill
  ctx.font = `800 ${Math.round(H * 0.055)}px ${FONT}`;
  const label = f.name.toUpperCase();
  const tw = measureSpaced(ctx, label, H * 0.008);
  const pw = tw + H * 0.12;
  const ph = H * 0.095;
  roundRect(ctx, W / 2 - pw / 2, H * 0.755, pw, ph, ph / 2);
  ctx.fillStyle = f.ink;
  ctx.fill();
  ctx.fillStyle = f.bottom;
  ctx.textBaseline = 'middle';
  spacedText(ctx, label, W / 2, H * 0.755 + ph / 2 + H * 0.004, H * 0.008);

  ctx.fillStyle = f.ink;
  ctx.font = `700 ${Math.round(H * 0.034)}px ${FONT}`;
  spacedText(ctx, '330 ML', W / 2, H * 0.915, H * 0.01);

  // the back of the can says what this is
  backPanel(ctx, 0, W, H, f);
  backPanel(ctx, W, W, H, f);

  return canvas;
}
