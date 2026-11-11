import { MIN_DRIFT_SPEED, WALL_BOUNCE, WORLD_H, WORLD_W } from './config.ts';
import type { Planet } from './types.ts';

export interface Body {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Advance a free-flying body by one step. This is the single source of truth for
 * unlatched motion: the game and the trajectory preview both call it, so the
 * preview is exact.
 */
export function stepFree(b: Body, planets: Planet[], dt: number): void {
  let ax = 0;
  let ay = 0;
  for (const p of planets) {
    const dx = p.x - b.x;
    const dy = p.y - b.y;
    const d2 = dx * dx + dy * dy;
    if (d2 >= p.well * p.well || d2 < 1) continue;
    const d = Math.sqrt(d2);
    // Inverse-square pull that fades to zero at the edge of the well.
    const a = (p.mu / d2) * (1 - d / p.well);
    ax += (dx / d) * a;
    ay += (dy / d) * a;
  }
  b.vx += ax * dt;
  b.vy += ay * dt;

  const speed = Math.hypot(b.vx, b.vy);
  if (speed < MIN_DRIFT_SPEED && speed > 0.001) {
    const boosted = Math.min(MIN_DRIFT_SPEED, speed + 60 * dt);
    b.vx *= boosted / speed;
    b.vy *= boosted / speed;
  }

  b.x += b.vx * dt;
  b.y += b.vy * dt;

  if (b.x < 0) {
    b.x = 0;
    b.vx = Math.abs(b.vx) * WALL_BOUNCE;
  } else if (b.x > WORLD_W) {
    b.x = WORLD_W;
    b.vx = -Math.abs(b.vx) * WALL_BOUNCE;
  }
  if (b.y < 0) {
    b.y = 0;
    b.vy = Math.abs(b.vy) * WALL_BOUNCE;
  } else if (b.y > WORLD_H) {
    b.y = WORLD_H;
    b.vy = -Math.abs(b.vy) * WALL_BOUNCE;
  }
}

/** Index of the planet whose solid body contains the point, or -1. */
export function planetAt(planets: Planet[], x: number, y: number): number {
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    if (Math.hypot(p.x - x, p.y - y) < p.r) return i;
  }
  return -1;
}

/** Index of the nearest planet whose gravity well contains the point, or -1. */
export function wellAt(planets: Planet[], x: number, y: number): number {
  let best = -1;
  let bestD = Infinity;
  for (let i = 0; i < planets.length; i++) {
    const p = planets[i];
    const d = Math.hypot(p.x - x, p.y - y);
    if (d < p.well && d < bestD) {
      best = i;
      bestD = d;
    }
  }
  return best;
}
