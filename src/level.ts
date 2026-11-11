import { GRAVITY, WORLD_H, WORLD_W } from './config.ts';
import type { Level, Planet, Station, Vec } from './types.ts';

/** Small seeded PRNG so every level number always produces the same layout. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeLevel(n: number): Level {
  const rnd = mulberry32(n * 7919 + 13);

  const wanted = Math.min(5 + n, 11);
  const planets: Planet[] = [];
  for (let tries = 0; tries < 4000 && planets.length < wanted; tries++) {
    const r = 28 + rnd() * 40;
    const well = r * 2.1 + 75;
    const margin = well + 40;
    const x = margin + rnd() * (WORLD_W - margin * 2);
    const y = margin + rnd() * (WORLD_H - margin * 2);
    const clear = planets.every((q) => Math.hypot(q.x - x, q.y - y) >= (well + q.well) * 1.05);
    if (clear) planets.push({ x, y, r, well, mu: GRAVITY * r * r, hue: Math.floor(rnd() * 360) });
  }

  // Start on the leftmost planet.
  let start = 0;
  for (let i = 1; i < planets.length; i++) if (planets[i].x < planets[start].x) start = i;

  // First pass gives every other planet a station; later passes double up.
  const cargo = Math.min(2 + n, 9, planets.length * 2);
  const order: number[] = [];
  for (let i = 0; i < planets.length; i++) if (i !== start) order.push(i);
  for (let i = 0; i < planets.length; i++) order.push(i);

  const spin = planets.map(() => (rnd() < 0.5 ? -1 : 1) * (0.45 + rnd() * 0.45));
  const phase = planets.map(() => rnd() * Math.PI * 2);
  const used = planets.map(() => 0);
  const stations: Station[] = [];
  for (const pi of order) {
    if (stations.length >= cargo) break;
    if (used[pi] >= 2) continue;
    const p = planets[pi];
    const orbitR = p.r + (p.well - p.r) * 0.55;
    const angle = phase[pi] + used[pi] * Math.PI;
    used[pi]++;
    stations.push({
      planet: pi,
      orbitR,
      angle,
      angVel: spin[pi],
      x: p.x + Math.cos(angle) * orbitR,
      y: p.y + Math.sin(angle) * orbitR,
      hasCargo: true,
    });
  }

  // Exit gate: the open-space spot farthest from the start planet.
  const s = planets[start];
  let gate: Vec = { x: WORLD_W - 100, y: WORLD_H / 2 };
  let gateD = -1;
  for (let i = 0; i < 60; i++) {
    const x = 100 + rnd() * (WORLD_W - 200);
    const y = 100 + rnd() * (WORLD_H - 200);
    if (planets.some((p) => Math.hypot(p.x - x, p.y - y) < p.well + 50)) continue;
    const d = Math.hypot(s.x - x, s.y - y);
    if (d > gateD) {
      gateD = d;
      gate = { x, y };
    }
  }

  return { planets, stations, gate, start };
}
