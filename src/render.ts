import {
  CATCH_RADIUS,
  GATE_RADIUS,
  ORBIT_MAX_SPEED,
  ORBIT_MIN_SPEED,
  VIEW_H,
  VIEW_MIN_W,
  WORLD_H,
  WORLD_W,
} from './config.ts';
import type { Game } from './game.ts';
import { mulberry32 } from './level.ts';
import { planetAt, stepFree, wellAt } from './physics.ts';
import type { Level, Planet } from './types.ts';

type Ctx = CanvasRenderingContext2D;

const UI_FONT = '"Segoe UI", system-ui, -apple-system, "Helvetica Neue", sans-serif';
const CYAN = '127,233,255';
const GOLD = '255,216,102';
const RED = '255,85,102';
const GREEN = '141,255,176';
const TAU = Math.PI * 2;

// ---------------------------------------------------------------------------
// Camera. Follows the ship; lives here because it is purely presentational.
// ---------------------------------------------------------------------------

const cam = { x: 0, y: 0, zoom: 1, level: null as Level | null };

function updateCamera(g: Game, dt: number): void {
  const ship = g.ship;
  const planets = g.level.planets;
  let tx = ship.x;
  let ty = ship.y;
  let tz = 1;

  if (g.phase === 'title') {
    const p = planets[g.level.start];
    // Frame the start planet below the title text.
    tx = p.x;
    ty = p.y - 250;
    tz = 1.2;
  } else if (g.phase !== 'dead') {
    if (ship.latched >= 0) {
      // Sit between ship and planet so the view stays calm while orbiting.
      const p = planets[ship.latched];
      tx = (ship.x + p.x) / 2;
      ty = (ship.y + p.y) / 2;
    } else {
      // Look ahead in the direction of travel.
      tx += ship.vx * 0.35;
      ty += ship.vy * 0.35;
    }
    const fast = clamp01((ship.speed - ORBIT_MIN_SPEED) / (ORBIT_MAX_SPEED - ORBIT_MIN_SPEED));
    tz = 1 - 0.2 * fast;
  }

  if (cam.level !== g.level) {
    cam.level = g.level;
    cam.x = tx;
    cam.y = ty;
    cam.zoom = tz;
    return;
  }
  const k = 1 - Math.exp(-3.2 * dt);
  cam.x += (tx - cam.x) * k;
  cam.y += (ty - cam.y) * k;
  cam.zoom += (tz - cam.zoom) * (1 - Math.exp(-1.6 * dt));
}

// ---------------------------------------------------------------------------
// Pre-rendered sprites
// ---------------------------------------------------------------------------

function makeCanvas(w: number, h: number): [HTMLCanvasElement, Ctx] {
  const c = document.createElement('canvas');
  c.width = Math.ceil(w);
  c.height = Math.ceil(h);
  return [c, c.getContext('2d')!];
}

const glowCache = new Map<string, HTMLCanvasElement>();

/** Soft radial blob, drawn additively wherever something should glow. */
function drawGlow(ctx: Ctx, x: number, y: number, radius: number, rgb: string, alpha = 1): void {
  let sprite = glowCache.get(rgb);
  if (!sprite) {
    const [c, g] = makeCanvas(64, 64);
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, `rgba(${rgb},1)`);
    grad.addColorStop(0.25, `rgba(${rgb},0.45)`);
    grad.addColorStop(1, `rgba(${rgb},0)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, 64, 64);
    glowCache.set(rgb, c);
    sprite = c;
  }
  ctx.globalAlpha = alpha;
  ctx.drawImage(sprite, x - radius, y - radius, radius * 2, radius * 2);
  ctx.globalAlpha = 1;
}

function makeStarTile(count: number, maxSize: number): HTMLCanvasElement {
  const size = 512;
  const [c, g] = makeCanvas(size, size);
  const tints = ['255,255,255', '190,210,255', '255,225,190', '200,255,250'];
  for (let i = 0; i < count; i++) {
    const x = 6 + Math.random() * (size - 12);
    const y = 6 + Math.random() * (size - 12);
    const s = 0.4 + Math.random() ** 3 * maxSize;
    const tint = tints[Math.floor(Math.random() * tints.length)];
    g.fillStyle = `rgba(${tint},${0.35 + Math.random() * 0.65})`;
    g.beginPath();
    g.arc(x, y, s, 0, TAU);
    g.fill();
    if (s > maxSize * 0.6) {
      const grad = g.createRadialGradient(x, y, 0, x, y, s * 4);
      grad.addColorStop(0, `rgba(${tint},0.35)`);
      grad.addColorStop(1, `rgba(${tint},0)`);
      g.fillStyle = grad;
      g.fillRect(x - s * 4, y - s * 4, s * 8, s * 8);
    }
  }
  return c;
}

const starLayers = [
  { tile: makeStarTile(110, 0.9), parallax: 0.04, alpha: 0.7 },
  { tile: makeStarTile(60, 1.3), parallax: 0.1, alpha: 0.85 },
  { tile: makeStarTile(22, 2.1), parallax: 0.2, alpha: 1 },
];

/** Tileable cloud of colored gas. Each level gets its own palette. */
function makeNebulaTile(seed: number): HTMLCanvasElement {
  const size = 1024;
  const [c, g] = makeCanvas(size, size);
  const rnd = mulberry32(seed);
  const baseHue = rnd() * 360;
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 9; i++) {
    const x = rnd() * size;
    const y = rnd() * size;
    const r = 180 + rnd() * 260;
    const hue = baseHue + (rnd() - 0.5) * 110;
    const alpha = 0.07 + rnd() * 0.09;
    // Draw at every wrap offset so the tile repeats without seams.
    for (let ox = -1; ox <= 1; ox++) {
      for (let oy = -1; oy <= 1; oy++) {
        const cx = x + ox * size;
        const cy = y + oy * size;
        const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
        grad.addColorStop(0, `hsla(${hue},75%,55%,${alpha})`);
        grad.addColorStop(1, `hsla(${hue},75%,40%,0)`);
        g.fillStyle = grad;
        g.fillRect(cx - r, cy - r, r * 2, r * 2);
      }
    }
  }
  return c;
}

/** Half-size of a planet sprite, in units of the planet radius. */
const PLANET_SPRITE_HALF = 2.2;

function makePlanetSprite(p: Planet): HTMLCanvasElement {
  const res = 2;
  const half = p.r * PLANET_SPRITE_HALF;
  const [c, g] = makeCanvas(half * 2 * res, half * 2 * res);
  const rnd = mulberry32(Math.floor(p.x * 31 + p.y * 17 + p.hue));
  const r = p.r;
  const h = p.hue;
  g.translate(half * res, half * res);
  g.scale(res, res);

  const kind = rnd() < 0.4 ? 'gas' : rnd() < 0.6 ? 'rock' : 'ocean';
  const ringed = kind === 'gas' && rnd() < 0.65;
  const tilt = (rnd() - 0.5) * 0.9;

  const ring = (front: boolean): void => {
    g.save();
    g.rotate(tilt);
    g.scale(1, 0.3);
    for (let k = 0; k < 4; k++) {
      g.beginPath();
      g.arc(0, 0, r * (1.45 + k * 0.14), front ? 0 : Math.PI, front ? Math.PI : TAU);
      g.strokeStyle = `hsla(${h + 25 + k * 8},55%,${78 - k * 6}%,${0.6 - k * 0.1})`;
      g.lineWidth = r * 0.1;
      g.stroke();
    }
    g.restore();
  };

  // Atmosphere halo
  const halo = g.createRadialGradient(0, 0, r * 0.85, 0, 0, r * 1.45);
  halo.addColorStop(0, `hsla(${h},95%,68%,0.5)`);
  halo.addColorStop(1, `hsla(${h},95%,60%,0)`);
  g.fillStyle = halo;
  g.beginPath();
  g.arc(0, 0, r * 1.45, 0, TAU);
  g.fill();

  if (ringed) ring(false);

  g.save();
  g.beginPath();
  g.arc(0, 0, r, 0, TAU);
  g.clip();

  if (kind === 'gas') {
    g.fillStyle = `hsl(${h},55%,48%)`;
    g.fillRect(-r, -r, r * 2, r * 2);
    g.save();
    g.rotate(tilt);
    for (let y = -r * 1.5; y < r * 1.5; ) {
      const bandH = r * (0.08 + rnd() * 0.2);
      g.fillStyle = `hsla(${h + (rnd() - 0.5) * 50},${50 + rnd() * 25}%,${30 + rnd() * 38}%,0.85)`;
      g.fillRect(-r * 1.5, y, r * 3, bandH);
      y += bandH;
    }
    // A storm spot
    g.fillStyle = `hsla(${h + 30},70%,72%,0.7)`;
    g.beginPath();
    g.ellipse((rnd() - 0.5) * r, (rnd() - 0.5) * r, r * 0.22, r * 0.11, 0, 0, TAU);
    g.fill();
    g.restore();
  } else if (kind === 'rock') {
    g.fillStyle = `hsl(${h},22%,42%)`;
    g.fillRect(-r, -r, r * 2, r * 2);
    for (let i = 0; i < 16; i++) {
      g.fillStyle = `hsla(${h + (rnd() - 0.5) * 30},20%,${26 + rnd() * 28}%,0.5)`;
      g.beginPath();
      g.arc((rnd() - 0.5) * 2 * r, (rnd() - 0.5) * 2 * r, r * (0.12 + rnd() * 0.38), 0, TAU);
      g.fill();
    }
    for (let i = 0; i < 9; i++) {
      const cx = (rnd() - 0.5) * 1.7 * r;
      const cy = (rnd() - 0.5) * 1.7 * r;
      const cr = r * (0.05 + rnd() * 0.13);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.beginPath();
      g.arc(cx, cy, cr, 0, TAU);
      g.fill();
      g.strokeStyle = 'rgba(255,255,255,0.22)';
      g.lineWidth = Math.max(1, cr * 0.25);
      g.beginPath();
      g.arc(cx, cy, cr, 0.3, 2.2);
      g.stroke();
    }
  } else {
    g.fillStyle = `hsl(${h},62%,40%)`;
    g.fillRect(-r, -r, r * 2, r * 2);
    for (let i = 0; i < 7; i++) {
      const cx = (rnd() - 0.5) * 1.8 * r;
      const cy = (rnd() - 0.5) * 1.8 * r;
      g.fillStyle = `hsla(${h + 95 + rnd() * 30},42%,${36 + rnd() * 14}%,0.9)`;
      for (let k = 0; k < 6; k++) {
        g.beginPath();
        g.arc(
          cx + (rnd() - 0.5) * r * 0.5,
          cy + (rnd() - 0.5) * r * 0.5,
          r * (0.08 + rnd() * 0.2),
          0,
          TAU,
        );
        g.fill();
      }
    }
    g.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = 0; i < 9; i++) {
      g.beginPath();
      g.ellipse(
        (rnd() - 0.5) * 2 * r,
        (rnd() - 0.5) * 2 * r,
        r * (0.2 + rnd() * 0.35),
        r * (0.03 + rnd() * 0.06),
        tilt,
        0,
        TAU,
      );
      g.fill();
    }
  }

  // Day/night shading: lit from the upper left.
  const shade = g.createRadialGradient(-r * 0.45, -r * 0.45, r * 0.15, -r * 0.2, -r * 0.2, r * 1.5);
  shade.addColorStop(0, 'rgba(255,255,255,0.22)');
  shade.addColorStop(0.35, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(2,3,14,0.9)');
  g.fillStyle = shade;
  g.fillRect(-r, -r, r * 2, r * 2);
  g.restore();

  g.strokeStyle = `hsla(${h},100%,88%,0.55)`;
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(0, 0, r - 0.75, Math.PI * 0.85, Math.PI * 1.65);
  g.stroke();

  if (ringed) ring(true);
  return c;
}

let planetSprites: HTMLCanvasElement[] = [];
let nebula: HTMLCanvasElement | null = null;
let spritesFor: Level | null = null;

function ensureSprites(level: Level): void {
  if (spritesFor === level) return;
  spritesFor = level;
  planetSprites = level.planets.map(makePlanetSprite);
  nebula = makeNebulaTile(Math.floor(level.planets[0].x * 7 + level.planets[0].y));
}

// ---------------------------------------------------------------------------
// Frame
// ---------------------------------------------------------------------------

export function render(ctx: Ctx, g: Game, now: number, dt: number): void {
  const W = ctx.canvas.width;
  const H = ctx.canvas.height;
  ensureSprites(g.level);
  updateCamera(g, dt);

  const base = Math.min(H / VIEW_H, W / VIEW_MIN_W);
  const scale = base * cam.zoom;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = 1;
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, '#04050f');
  sky.addColorStop(1, '#0a0716');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, H);

  drawBackdrop(ctx, W, H, base, scale);

  const shakeX = (Math.random() - 0.5) * g.shake * base;
  const shakeY = (Math.random() - 0.5) * g.shake * base;
  ctx.setTransform(
    scale,
    0,
    0,
    scale,
    W / 2 - cam.x * scale + shakeX,
    H / 2 - cam.y * scale + shakeY,
  );
  drawWorld(ctx, g, now);

  // HUD is laid out in a virtual space roughly 720 units tall.
  const ui = Math.max(Math.min(W / 1280, H / 720), 0.5);
  const vw = W / ui;
  const vh = H / ui;
  ctx.setTransform(ui, 0, 0, ui, 0, 0);
  drawScreenFx(ctx, g, vw, vh, now);
  if (g.phase !== 'title') {
    const toHud = (wx: number, wy: number): [number, number] => [
      ((wx - cam.x) * scale + W / 2) / ui,
      ((wy - cam.y) * scale + H / 2) / ui,
    ];
    if (g.phase === 'playing') drawIndicators(ctx, g, vw, vh, now, toHud);
    drawHud(ctx, g, vw, vh, now);
    drawMinimap(ctx, g, vw, vh, now, W / scale, H / scale);
  }
  drawOverlay(ctx, g, vw, vh, now);
}

function drawTiled(
  ctx: Ctx,
  tile: HTMLCanvasElement,
  rawSize: number,
  offX: number,
  offY: number,
  W: number,
  H: number,
): void {
  // Whole-pixel tiles: fractional edges would overlap and show as bright seams.
  const size = Math.max(1, Math.round(rawSize));
  const sx = Math.round((((-offX % size) + size) % size) - size);
  const sy = Math.round((((-offY % size) + size) % size) - size);
  for (let x = sx; x < W; x += size) {
    for (let y = sy; y < H; y += size) ctx.drawImage(tile, x, y, size, size);
  }
}

function drawBackdrop(ctx: Ctx, W: number, H: number, base: number, scale: number): void {
  ctx.globalCompositeOperation = 'lighter';
  if (nebula) drawTiled(ctx, nebula, 2048 * base, cam.x * scale * 0.06, cam.y * scale * 0.06, W, H);
  for (const layer of starLayers) {
    ctx.globalAlpha = layer.alpha;
    drawTiled(
      ctx,
      layer.tile,
      640 * base,
      cam.x * scale * layer.parallax,
      cam.y * scale * layer.parallax,
      W,
      H,
    );
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawWorld(ctx: Ctx, g: Game, now: number): void {
  const { planets, stations, gate } = g.level;
  const ship = g.ship;
  const alive = g.phase !== 'dead';

  // Sector boundary
  ctx.strokeStyle = 'rgba(120,140,220,0.22)';
  ctx.lineWidth = 2;
  ctx.setLineDash([18, 22]);
  ctx.lineDashOffset = now * 10;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);
  ctx.setLineDash([]);

  // Gravity wells
  const inWell = ship.latched >= 0 ? ship.latched : wellAt(planets, ship.x, ship.y);
  planets.forEach((p, i) => {
    const active = alive && i === inWell;
    const grad = ctx.createRadialGradient(p.x, p.y, p.r, p.x, p.y, p.well);
    grad.addColorStop(0, `hsla(${p.hue},80%,60%,${active ? 0.2 : 0.1})`);
    grad.addColorStop(0.7, `hsla(${p.hue},80%,60%,${active ? 0.07 : 0.035})`);
    grad.addColorStop(1, `hsla(${p.hue},80%,60%,0)`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.well, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = `hsla(${p.hue},85%,75%,${active ? 0.75 : 0.22})`;
    ctx.lineWidth = active ? 2.2 : 1.2;
    ctx.setLineDash([3, 11]);
    ctx.lineDashOffset = -now * 14;
    ctx.stroke();
    ctx.setLineDash([]);
  });

  // Exit gate
  ctx.save();
  ctx.translate(gate.x, gate.y);
  if (g.gateOpen) {
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, GATE_RADIUS * 2.6, GREEN, 0.45 + 0.15 * Math.sin(now * 4));
    ctx.lineCap = 'round';
    for (let i = 0; i < 4; i++) {
      const rr = GATE_RADIUS - 4 - i * 7;
      const a = now * (1.6 + i * 0.7) * (i % 2 ? -1 : 1) + i;
      ctx.strokeStyle = `rgba(${GREEN},${0.9 - i * 0.15})`;
      ctx.lineWidth = 3.5 - i * 0.6;
      for (let k = 0; k < 3; k++) {
        ctx.beginPath();
        ctx.arc(0, 0, rr, a + (k * TAU) / 3, a + (k * TAU) / 3 + 1.3);
        ctx.stroke();
      }
    }
    // Motes spiralling inward
    for (let i = 0; i < 14; i++) {
      const t = (now * 0.5 + i / 14) % 1;
      const a = i * 2.4 + t * 5;
      const d = (1 - t) * GATE_RADIUS * 1.9;
      drawGlow(ctx, Math.cos(a) * d, Math.sin(a) * d, 5, GREEN, t);
    }
  } else {
    ctx.strokeStyle = 'rgba(130,145,190,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 9]);
    ctx.lineDashOffset = now * 6;
    ctx.beginPath();
    ctx.arc(0, 0, GATE_RADIUS - 4, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = 'rgba(130,145,190,0.75)';
    ctx.font = `600 12px ${UI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('LOCKED', 0, 0);
  }
  ctx.restore();

  // Planets
  planets.forEach((p, i) => {
    const half = p.r * PLANET_SPRITE_HALF;
    ctx.drawImage(planetSprites[i], p.x - half, p.y - half, half * 2, half * 2);
  });

  // Stations
  for (const s of stations) {
    ctx.save();
    ctx.translate(s.x, s.y);
    if (s.hasCargo) {
      ctx.globalCompositeOperation = 'lighter';
      drawGlow(ctx, 0, 0, 44 + 6 * Math.sin(now * 5), GOLD, 0.5);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.rotate(s.angle * 1.5);
    // Solar panels
    ctx.fillStyle = s.hasCargo ? '#2a4a8f' : '#1c2740';
    ctx.strokeStyle = s.hasCargo ? '#7fa6ff' : '#3a4666';
    ctx.lineWidth = 1;
    for (const side of [-1, 1]) {
      ctx.fillRect(side * 12 - (side < 0 ? 14 : 0), -7, 14, 14);
      ctx.strokeRect(side * 12 - (side < 0 ? 14 : 0), -7, 14, 14);
      ctx.beginPath();
      ctx.moveTo(side * 19, -7);
      ctx.lineTo(side * 19, 7);
      ctx.stroke();
    }
    // Hub
    ctx.fillStyle = s.hasCargo ? '#b9c3de' : '#4a5470';
    ctx.beginPath();
    for (let k = 0; k < 6; k++) {
      const a = (k * TAU) / 6;
      ctx.lineTo(Math.cos(a) * 11, Math.sin(a) * 11);
    }
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = s.hasCargo ? `rgb(${GOLD})` : '#232a3d';
    ctx.fillRect(-5, -5, 10, 10);
    ctx.restore();
  }

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  if (alive) {
    ctx.globalCompositeOperation = 'lighter';

    // Predicted path if the ship were flying free from this instant.
    if (g.phase === 'playing') {
      const ghost = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
      const dots = 48;
      const strength = ship.latched >= 0 ? 1 : 0.5;
      for (let i = 1; i <= dots; i++) {
        for (let k = 0; k < 4; k++) stepFree(ghost, planets, 1 / 60);
        const fade = 1 - i / dots;
        if (planetAt(planets, ghost.x, ghost.y) >= 0) {
          drawGlow(ctx, ghost.x, ghost.y, 18, RED, 0.9);
          break;
        }
        drawGlow(ctx, ghost.x, ghost.y, 3 + 4 * fade, CYAN, fade * strength);
      }
    }

    // Trail
    const fast = clamp01((ship.speed - ORBIT_MIN_SPEED) / (ORBIT_MAX_SPEED - ORBIT_MIN_SPEED));
    const trail = ship.trail;
    for (let i = 1; i < trail.length; i++) {
      const f = i / trail.length;
      ctx.strokeStyle = `rgba(${Math.round(127 + 128 * fast)},${Math.round(233 - 60 * fast)},255,${f * 0.6})`;
      ctx.lineWidth = f * (4 + 4 * fast);
      ctx.beginPath();
      ctx.moveTo(trail[i - 1].x, trail[i - 1].y);
      ctx.lineTo(trail[i].x, trail[i].y);
      ctx.stroke();
    }

    // Tether
    if (ship.latched >= 0) {
      const p = planets[ship.latched];
      ctx.strokeStyle = `rgba(${CYAN},0.25)`;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ship.x, ship.y);
      ctx.stroke();
      ctx.strokeStyle = `rgba(${CYAN},0.9)`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([10, 8]);
      ctx.lineDashOffset = now * 60;
      ctx.stroke();
      ctx.setLineDash([]);

      // Charge ring: how wound-up the slingshot is.
      ctx.strokeStyle = fast >= 1 ? `rgba(${GOLD},0.95)` : `rgba(${CYAN},0.85)`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ship.x, ship.y, 22, -Math.PI / 2, -Math.PI / 2 + TAU * Math.max(fast, 0.02));
      ctx.stroke();
    }

    drawGlow(ctx, ship.x, ship.y, 30 + 14 * fast, CYAN, 0.75);
    ctx.globalCompositeOperation = 'source-over';

    // Ship
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(Math.atan2(ship.vy, ship.vx));
    ctx.fillStyle = '#0d2530';
    ctx.strokeStyle = '#eafcff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-9, 9);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-9, -9);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = `rgb(${CYAN})`;
    ctx.beginPath();
    ctx.arc(2, 0, 2.6, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Patrols
  for (const pt of g.patrols) {
    const heading = Math.atan2(pt.vy, pt.vx);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, pt.x, pt.y, 34, RED, 0.6);
    ctx.globalCompositeOperation = 'source-over';
    ctx.strokeStyle = `rgba(${RED},${0.3 + 0.25 * Math.sin(now * 8)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, CATCH_RADIUS + 4, 0, TAU);
    ctx.stroke();

    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.rotate(heading);
    // Engine flame: patrols have what the thief lacks.
    ctx.fillStyle = 'rgba(255,190,110,0.9)';
    ctx.beginPath();
    ctx.moveTo(-8, 4);
    ctx.lineTo(-14 - Math.random() * 12, 0);
    ctx.lineTo(-8, -4);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a0d14';
    ctx.strokeStyle = `rgb(${RED})`;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(13, 0);
    ctx.lineTo(-2, 10);
    ctx.lineTo(-9, 6);
    ctx.lineTo(-9, -6);
    ctx.lineTo(-2, -10);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Siren
    ctx.fillStyle = Math.sin(now * 14) > 0 ? '#ff5566' : '#5a8dff';
    ctx.beginPath();
    ctx.arc(0, 0, 3, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  // Particles
  ctx.globalCompositeOperation = 'lighter';
  for (const p of g.particles) {
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';

  // Score popups
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 24px ${UI_FONT}`;
  for (const f of g.floaters) {
    const t = 1 - f.life / f.max;
    ctx.globalAlpha = Math.min(1, (1 - t) * 2);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y - 20 - t * 50);
  }
  ctx.globalAlpha = 1;
}

function drawScreenFx(ctx: Ctx, g: Game, vw: number, vh: number, now: number): void {
  const r = Math.hypot(vw, vh) / 2;
  const vignette = ctx.createRadialGradient(vw / 2, vh / 2, r * 0.55, vw / 2, vh / 2, r);
  vignette.addColorStop(0, 'rgba(0,0,0,0)');
  vignette.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, vw, vh);

  if (g.alarm && g.phase === 'playing') {
    const pulse = 0.14 + 0.1 * Math.sin(now * 5);
    const red = ctx.createRadialGradient(vw / 2, vh / 2, r * 0.6, vw / 2, vh / 2, r);
    red.addColorStop(0, `rgba(${RED},0)`);
    red.addColorStop(1, `rgba(${RED},${pulse})`);
    ctx.fillStyle = red;
    ctx.fillRect(0, 0, vw, vh);
  }
  if (g.phase === 'dead' && g.phaseTime < 0.3) {
    ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - g.phaseTime / 0.3)})`;
    ctx.fillRect(0, 0, vw, vh);
  }
}

function panel(ctx: Ctx, x: number, y: number, w: number, h: number): void {
  ctx.fillStyle = 'rgba(8,12,28,0.62)';
  ctx.strokeStyle = 'rgba(140,165,255,0.25)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, 10);
  ctx.fill();
  ctx.stroke();
}

function label(ctx: Ctx, text: string, x: number, y: number): void {
  ctx.font = `700 11px ${UI_FONT}`;
  ctx.letterSpacing = '2px';
  ctx.fillStyle = 'rgba(150,165,210,0.85)';
  ctx.fillText(text, x, y);
  ctx.letterSpacing = '0px';
}

function drawHud(ctx: Ctx, g: Game, vw: number, vh: number, now: number): void {
  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  // Left panel: level, cargo, score
  const pipW = 16;
  const cargoW = g.total * pipW;
  const w = 250 + cargoW;
  panel(ctx, 18, 18, w, 62);
  label(ctx, 'LEVEL', 34, 40);
  label(ctx, 'CARGO', 104, 40);
  label(ctx, 'SCORE', 124 + cargoW, 40);
  label(ctx, 'BEST', 204 + cargoW, 40);
  ctx.font = `700 22px ${UI_FONT}`;
  ctx.fillStyle = '#eef2ff';
  ctx.fillText(String(g.levelNum).padStart(2, '0'), 34, 66);
  ctx.fillText(String(g.score), 124 + cargoW, 66);
  ctx.fillStyle = 'rgba(150,165,210,0.9)';
  ctx.fillText(String(g.best), 204 + cargoW, 66);
  for (let i = 0; i < g.total; i++) {
    const x = 104 + i * pipW;
    if (i < g.stolen) {
      ctx.fillStyle = `rgb(${g.gateOpen ? GREEN : GOLD})`;
      ctx.fillRect(x, 52, 11, 14);
    } else {
      ctx.strokeStyle = 'rgba(255,216,102,0.55)';
      ctx.lineWidth = 1.2;
      ctx.strokeRect(x + 0.5, 52.5, 10, 13);
    }
  }

  // Right panel: alarm status
  ctx.textAlign = 'right';
  panel(ctx, vw - 228, 18, 210, 62);
  if (g.alarm) {
    const on = Math.sin(now * 10) > 0;
    ctx.fillStyle = on ? `rgb(${RED})` : 'rgba(255,85,102,0.45)';
    ctx.beginPath();
    ctx.arc(vw - 208, 49, 7, 0, TAU);
    ctx.fill();
    ctx.textAlign = 'right';
    label(ctx, 'ALARM', vw - 34, 40);
    ctx.font = `700 22px ${UI_FONT}`;
    ctx.fillStyle = `rgb(${RED})`;
    ctx.fillText(`${g.patrols.length}/${g.patrolTarget} PATROLS`, vw - 34, 66);
  } else {
    label(ctx, 'STATUS', vw - 34, 40);
    ctx.font = `700 22px ${UI_FONT}`;
    ctx.fillStyle = `rgb(${GREEN})`;
    ctx.fillText('UNDETECTED', vw - 34, 66);
  }

  // Bottom hint
  if (g.phase !== 'playing') return;
  const ship = g.ship;
  let hint = '';
  let color = 'rgba(200,212,245,0.9)';
  if (ship.x < 0 || ship.x > WORLD_W || ship.y < 0 || ship.y > WORLD_H) {
    hint = 'LEAVING THE SECTOR — THE TIDE WILL SWING YOU BACK';
    color = `rgba(${GOLD},0.95)`;
  } else if (g.gateOpen) {
    hint = 'ALL CARGO STOLEN — GET TO THE EXIT';
    color = `rgb(${GREEN})`;
  } else if (g.levelNum === 1 && g.stolen === 0) {
    hint = 'HOLD to orbit and build speed  ·  RELEASE to slingshot  ·  fly through stations to steal';
  }
  if (!hint) return;
  ctx.font = `600 15px ${UI_FONT}`;
  ctx.letterSpacing = '1px';
  ctx.textAlign = 'center';
  const tw = ctx.measureText(hint).width + 40;
  panel(ctx, vw / 2 - tw / 2, vh - 62, tw, 36);
  ctx.fillStyle = color;
  ctx.fillText(hint, vw / 2, vh - 38);
  ctx.letterSpacing = '0px';
}

/** Arrows at the screen edge pointing to things that are out of view. */
function drawIndicators(
  ctx: Ctx,
  g: Game,
  vw: number,
  vh: number,
  now: number,
  toHud: (x: number, y: number) => [number, number],
): void {
  const margin = 34;
  const cx = vw / 2;
  const cy = vh / 2;
  const arrow = (wx: number, wy: number, rgb: string, size: number, alpha: number): void => {
    const [sx, sy] = toHud(wx, wy);
    if (sx > margin && sx < vw - margin && sy > margin && sy < vh - margin) return;
    const dx = sx - cx;
    const dy = sy - cy;
    const t = Math.min(
      (cx - margin) / Math.max(Math.abs(dx), 0.001),
      (cy - margin) / Math.max(Math.abs(dy), 0.001),
    );
    ctx.save();
    ctx.translate(cx + dx * t, cy + dy * t);
    ctx.globalCompositeOperation = 'lighter';
    drawGlow(ctx, 0, 0, size * 2.2, rgb, alpha * 0.5);
    ctx.globalCompositeOperation = 'source-over';
    ctx.rotate(Math.atan2(dy, dx));
    ctx.globalAlpha = alpha;
    ctx.fillStyle = `rgb(${rgb})`;
    ctx.beginPath();
    ctx.moveTo(size, 0);
    ctx.lineTo(-size * 0.7, size * 0.75);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.7, -size * 0.75);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  for (const s of g.level.stations) if (s.hasCargo) arrow(s.x, s.y, GOLD, 9, 0.85);
  if (g.gateOpen) {
    arrow(g.level.gate.x, g.level.gate.y, GREEN, 13, 0.75 + 0.25 * Math.sin(now * 6));
  }
  for (const pt of g.patrols) arrow(pt.x, pt.y, RED, 11, 0.7 + 0.3 * Math.sin(now * 10));
}

function drawMinimap(
  ctx: Ctx,
  g: Game,
  vw: number,
  vh: number,
  now: number,
  viewW: number,
  viewH: number,
): void {
  const pad = 60; // world units of space shown around the sector
  const mw = 220;
  const k = mw / (WORLD_W + pad * 2);
  const mh = (WORLD_H + pad * 2) * k;
  const x0 = vw - mw - 18;
  const y0 = vh - mh - 18;
  panel(ctx, x0, y0, mw, mh);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(x0, y0, mw, mh, 10);
  ctx.clip();
  const mx = (wx: number): number => x0 + (wx + pad) * k;
  const my = (wy: number): number => y0 + (wy + pad) * k;
  const dot = (wx: number, wy: number, r: number, color: string): void => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(
      Math.min(Math.max(mx(wx), x0 + 3), x0 + mw - 3),
      Math.min(Math.max(my(wy), y0 + 3), y0 + mh - 3),
      r,
      0,
      TAU,
    );
    ctx.fill();
  };

  ctx.strokeStyle = 'rgba(120,140,220,0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mx(0), my(0), WORLD_W * k, WORLD_H * k);
  for (const p of g.level.planets) {
    dot(p.x, p.y, p.well * k, `hsla(${p.hue},70%,60%,0.14)`);
    dot(p.x, p.y, Math.max(p.r * k, 2.2), `hsl(${p.hue},65%,62%)`);
  }
  for (const s of g.level.stations) if (s.hasCargo) dot(s.x, s.y, 2.2, `rgb(${GOLD})`);
  const gate = g.level.gate;
  if (g.gateOpen) {
    dot(gate.x, gate.y, 3.5 + Math.sin(now * 6), `rgb(${GREEN})`);
  } else {
    ctx.strokeStyle = 'rgba(130,145,190,0.8)';
    ctx.beginPath();
    ctx.arc(mx(gate.x), my(gate.y), 3, 0, TAU);
    ctx.stroke();
  }
  for (const pt of g.patrols) dot(pt.x, pt.y, 2.6, `rgb(${RED})`);

  // What the main view currently shows
  ctx.strokeStyle = 'rgba(255,255,255,0.3)';
  ctx.strokeRect(mx(cam.x - viewW / 2), my(cam.y - viewH / 2), viewW * k, viewH * k);
  if (g.phase !== 'dead') dot(g.ship.x, g.ship.y, 3, '#ffffff');
  ctx.restore();
}

function drawOverlay(ctx: Ctx, g: Game, vw: number, vh: number, now: number): void {
  let title = '';
  let rgb = CYAN;
  const lines: string[] = [];
  let prompt = '';

  if (g.paused) {
    title = 'PAUSED';
    prompt = 'Press P to resume';
  } else if (g.phase === 'title') {
    title = 'ORBIT THIEF';
    lines.push(
      'Your ship has no engine. Latch onto a planet’s gravity, wind up, and let go.',
      'Fly through stations to steal their cargo, then escape through the exit gate.',
      'The first theft raises the alarm. Patrols will hunt you — or follow you into a planet.',
      '',
      'HOLD  Space / mouse / touch  to latch   ·   RELEASE  to slingshot',
      'R  retry   ·   P  pause   ·   M  mute',
    );
    prompt = 'Press Space or click to start';
  } else if (g.phase === 'dead') {
    title = g.deathReason;
    rgb = RED;
    lines.push(`Level ${g.levelNum}  ·  ${g.stolen}/${g.total} cargo`);
    prompt = 'Press Space or click to retry';
  } else if (g.phase === 'cleared') {
    title = 'CLEAN GETAWAY';
    rgb = GREEN;
    lines.push(
      `Level ${g.levelNum} cleared in ${g.time.toFixed(1)}s`,
      `Speed bonus  +${g.clearBonus}`,
      `Score  ${g.score}`,
    );
    prompt = 'Press Space or click for the next job';
  } else {
    return;
  }

  // Fade in, and keep the world visible behind the text.
  const fade = g.paused ? 1 : Math.min(1, g.phaseTime / (g.phase === 'title' ? 0.01 : 0.5));
  ctx.globalAlpha = fade;
  const dim = ctx.createLinearGradient(0, 0, 0, vh);
  dim.addColorStop(0, 'rgba(4,5,14,0.35)');
  dim.addColorStop(0.5, 'rgba(4,5,14,0.8)');
  dim.addColorStop(1, 'rgba(4,5,14,0.35)');
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, vw, vh);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  const top = vh / 2 - 40 - lines.length * 13;

  // letterSpacing adds a trailing gap; nudge right to keep the title centered.
  const big = Math.min(84, (vw - 60) / (title.length * 0.78));
  const spacing = big * 0.16;
  ctx.font = `800 ${big}px ${UI_FONT}`;
  ctx.letterSpacing = `${spacing}px`;
  ctx.shadowColor = `rgba(${rgb},0.9)`;
  ctx.shadowBlur = 36;
  const grad = ctx.createLinearGradient(0, top - big, 0, top);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(1, `rgb(${rgb})`);
  ctx.fillStyle = grad;
  ctx.fillText(title, vw / 2 + spacing / 2, top);
  ctx.shadowBlur = 0;
  ctx.letterSpacing = '0px';

  ctx.fillStyle = `rgba(${rgb},0.6)`;
  ctx.fillRect(vw / 2 - 90, top + 22, 180, 2);

  ctx.font = `500 18px ${UI_FONT}`;
  ctx.fillStyle = 'rgba(214,223,250,0.95)';
  lines.forEach((line, i) => ctx.fillText(line, vw / 2, top + 64 + i * 28));

  ctx.font = `700 19px ${UI_FONT}`;
  ctx.letterSpacing = '2px';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = fade * (0.55 + 0.45 * Math.sin(now * 4));
  ctx.fillText(prompt.toUpperCase(), vw / 2, top + 96 + lines.length * 28);
  ctx.letterSpacing = '0px';
  ctx.globalAlpha = 1;
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}
