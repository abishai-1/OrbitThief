import { EDGE_PULL, MIN_DRIFT_SPEED, WORLD_H, WORLD_W } from './config.ts';
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
  // Outside the sector there are no walls, only a tide that grows with distance
  // and swings the ship back in.
  if (b.x < 0) ax -= b.x * EDGE_PULL;
  else if (b.x > WORLD_W) ax -= (b.x - WORLD_W) * EDGE_PULL;
  if (b.y < 0) ay -= b.y * EDGE_PULL;
  else if (b.y > WORLD_H) ay -= (b.y - WORLD_H) * EDGE_PULL;

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
