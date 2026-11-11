import {
  CATCH_RADIUS,
  GATE_RADIUS,
  ORBIT_BOOST,
  ORBIT_CLEARANCE,
  ORBIT_MAX_SPEED,
  ORBIT_MIN_SPEED,
  PATROL_ACCEL,
  PATROL_BASE_SPEED,
  PATROL_MAX_COUNT,
  PATROL_MAX_SPEED,
  PATROL_SPAWN_DELAY,
  PATROL_SPEED_PER_LEVEL,
  PICKUP_RADIUS,
  WORLD_H,
  WORLD_W,
} from './config.ts';
import { makeLevel } from './level.ts';
import { planetAt, stepFree, wellAt } from './physics.ts';
import type { Level, Particle, Patrol, Ship } from './types.ts';

export type Phase = 'title' | 'playing' | 'dead' | 'cleared';

/** Sound hooks. The game only announces events; it knows nothing about audio. */
export interface Sfx {
  latch(): void;
  release(): void;
  pickup(): void;
  alarm(): void;
  gateOpen(): void;
  boom(): void;
  dead(): void;
  win(): void;
}

export class Game {
  phase: Phase = 'title';
  /** Seconds since the current phase began. */
  phaseTime = 0;
  paused = false;

  levelNum = 1;
  level: Level;
  ship: Ship;
  patrols: Patrol[] = [];
  particles: Particle[] = [];

  /** True while the latch button is held. Set by the input layer. */
  held = false;

  score = 0;
  best: number;
  stolen = 0;
  /** Seconds spent on the current level. */
  time = 0;
  alarm = false;
  deathReason = '';
  clearBonus = 0;
  shake = 0;

  private levelStartScore = 0;
  private spawnTimer = 0;
  private trailTick = 0;
  private sfx: Sfx;

  constructor(sfx: Sfx, best = 0) {
    this.sfx = sfx;
    this.best = best;
    this.level = makeLevel(1);
    this.ship = this.spawnShip();
  }

  get total(): number {
    return this.level.stations.length;
  }

  get gateOpen(): boolean {
    return this.stolen >= this.total;
  }

  /** How many patrols the current alarm level calls for. */
  get patrolTarget(): number {
    if (!this.alarm) return 0;
    return Math.min(1 + Math.floor(this.stolen / 2) + Math.floor(this.levelNum / 2), PATROL_MAX_COUNT);
  }

  /** A fresh press of the latch button: advances menus. */
  press(): void {
    if (this.phase === 'title') {
      this.setPhase('playing');
    } else if (this.phase === 'dead' && this.phaseTime > 0.5) {
      this.retry();
    } else if (this.phase === 'cleared' && this.phaseTime > 0.5) {
      this.levelStartScore = this.score;
      this.loadLevel(this.levelNum + 1);
    }
  }

  /** Restart the current level, forfeiting anything scored on it. */
  retry(): void {
    if (this.phase === 'title') return;
    this.score = this.levelStartScore;
    this.loadLevel(this.levelNum);
  }

  update(dt: number): void {
    this.phaseTime += dt;
    this.shake = Math.max(0, this.shake - 40 * dt);
    this.updateParticles(dt);

    const { planets, stations } = this.level;
    for (const s of stations) {
      const p = planets[s.planet];
      s.angle += s.angVel * dt;
      s.x = p.x + Math.cos(s.angle) * s.orbitR;
      s.y = p.y + Math.sin(s.angle) * s.orbitR;
    }

    if (this.phase === 'dead' || this.phase === 'cleared') return;
    if (this.phase === 'playing') this.time += dt;

    this.updateShip(dt);
    if (this.phase !== 'playing') return;

    this.checkPickups();
    if (this.gateOpen && this.dist(this.ship, this.level.gate) < GATE_RADIUS) {
      this.clearLevel();
      return;
    }
    this.updatePatrols(dt);
  }

  private setPhase(p: Phase): void {
    this.phase = p;
    this.phaseTime = 0;
  }

  private loadLevel(n: number): void {
    this.levelNum = n;
    this.level = makeLevel(n);
    this.ship = this.spawnShip();
    this.patrols = [];
    this.particles = [];
    this.stolen = 0;
    this.time = 0;
    this.alarm = false;
    this.spawnTimer = 0;
    this.setPhase('playing');
  }

  private spawnShip(): Ship {
    const p = this.level.planets[this.level.start];
    const orbitR = p.r + 40;
    const angle = Math.PI;
    return {
      x: p.x + Math.cos(angle) * orbitR,
      y: p.y + Math.sin(angle) * orbitR,
      vx: 0,
      vy: ORBIT_MIN_SPEED,
      latched: this.level.start,
      orbitR,
      orbitDir: -1,
      orbitAngle: angle,
      speed: ORBIT_MIN_SPEED,
      trail: [],
    };
  }

  private updateShip(dt: number): void {
    const ship = this.ship;
    const planets = this.level.planets;
    // On the title screen the ship just idles in orbit.
    const held = this.phase === 'title' || this.held;

    if (ship.latched >= 0 && !held) {
      ship.latched = -1;
      this.sfx.release();
    } else if (ship.latched < 0 && held) {
      const i = wellAt(planets, ship.x, ship.y);
      if (i >= 0) this.latch(i);
    }

    if (ship.latched >= 0) {
      const p = planets[ship.latched];
      const target = Math.min(Math.max(ship.orbitR, p.r + ORBIT_CLEARANCE), p.well);
      ship.orbitR += (target - ship.orbitR) * Math.min(1, 8 * dt);
      ship.speed = Math.min(ORBIT_MAX_SPEED, ship.speed + ORBIT_BOOST * dt);
      ship.orbitAngle += ((ship.orbitDir * ship.speed) / ship.orbitR) * dt;
      const c = Math.cos(ship.orbitAngle);
      const s = Math.sin(ship.orbitAngle);
      ship.x = p.x + c * ship.orbitR;
      ship.y = p.y + s * ship.orbitR;
      ship.vx = -s * ship.speed * ship.orbitDir;
      ship.vy = c * ship.speed * ship.orbitDir;
    } else {
      stepFree(ship, planets, dt);
      ship.speed = Math.hypot(ship.vx, ship.vy);
      if (planetAt(planets, ship.x, ship.y) >= 0) {
        this.die('BURNED UP');
        return;
      }
    }

    this.trailTick += dt;
    if (this.trailTick >= 1 / 40) {
      this.trailTick = 0;
      ship.trail.push({ x: ship.x, y: ship.y });
      if (ship.trail.length > 36) ship.trail.shift();
    }
  }

  private latch(i: number): void {
    const ship = this.ship;
    const p = this.level.planets[i];
    const rx = ship.x - p.x;
    const ry = ship.y - p.y;
    ship.latched = i;
    ship.orbitR = Math.hypot(rx, ry);
    ship.orbitAngle = Math.atan2(ry, rx);
    // Keep circling the way the ship was already heading.
    ship.orbitDir = rx * ship.vy - ry * ship.vx >= 0 ? 1 : -1;
    ship.speed = Math.max(Math.hypot(ship.vx, ship.vy), ORBIT_MIN_SPEED);
    this.sfx.latch();
  }

  private checkPickups(): void {
    for (const s of this.level.stations) {
      if (!s.hasCargo || this.dist(this.ship, s) > PICKUP_RADIUS) continue;
      s.hasCargo = false;
      this.stolen++;
      this.addScore(100 * this.levelNum);
      this.burst(s.x, s.y, '#ffd866', 18, 160);
      this.sfx.pickup();
      if (!this.alarm) {
        this.alarm = true;
        this.spawnTimer = 1.5;
        this.sfx.alarm();
      }
      if (this.gateOpen) this.sfx.gateOpen();
    }
  }

  private updatePatrols(dt: number): void {
    const ship = this.ship;
    const planets = this.level.planets;

    if (this.patrols.length < this.patrolTarget) {
      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnPatrol();
        this.spawnTimer = PATROL_SPAWN_DELAY;
      }
    }

    const maxSpeed = Math.min(
      PATROL_BASE_SPEED + PATROL_SPEED_PER_LEVEL * this.levelNum,
      PATROL_MAX_SPEED,
    );
    for (let i = this.patrols.length - 1; i >= 0; i--) {
      const pt = this.patrols[i];

      // Steer toward where the ship is about to be.
      const tx = ship.x + ship.vx * 0.4 - pt.x;
      const ty = ship.y + ship.vy * 0.4 - pt.y;
      const td = Math.hypot(tx, ty) || 1;
      let sx = (tx / td) * maxSpeed - pt.vx;
      let sy = (ty / td) * maxSpeed - pt.vy;
      const sd = Math.hypot(sx, sy) || 1;
      sx = (sx / sd) * PATROL_ACCEL;
      sy = (sy / sd) * PATROL_ACCEL;

      // Swerve around planets. Not perfect on purpose: a fast patrol can be baited into one.
      for (const p of planets) {
        const dx = pt.x - p.x;
        const dy = pt.y - p.y;
        const d = Math.hypot(dx, dy) || 1;
        const gap = d - p.r;
        if (gap < 45) {
          const push = PATROL_ACCEL * 2 * (1 - gap / 45);
          sx += (dx / d) * push;
          sy += (dy / d) * push;
        }
      }
      // Keep patrols from stacking on top of each other.
      for (const other of this.patrols) {
        if (other === pt) continue;
        const dx = pt.x - other.x;
        const dy = pt.y - other.y;
        const d = Math.hypot(dx, dy) || 1;
        if (d < 40) {
          sx += (dx / d) * 120;
          sy += (dy / d) * 120;
        }
      }

      pt.vx += sx * dt;
      pt.vy += sy * dt;
      const v = Math.hypot(pt.vx, pt.vy);
      if (v > maxSpeed) {
        pt.vx *= maxSpeed / v;
        pt.vy *= maxSpeed / v;
      }
      pt.x += pt.vx * dt;
      pt.y += pt.vy * dt;

      if (planetAt(planets, pt.x, pt.y) >= 0) {
        this.patrols.splice(i, 1);
        this.burst(pt.x, pt.y, '#ff5566', 22, 200);
        this.addScore(50 * this.levelNum);
        this.shake = Math.max(this.shake, 6);
        this.spawnTimer = PATROL_SPAWN_DELAY;
        this.sfx.boom();
        continue;
      }
      if (this.dist(pt, ship) < CATCH_RADIUS) {
        this.die('BUSTED');
        return;
      }
    }
  }

  private spawnPatrol(): void {
    // Arrive from whichever sampled edge point is farthest from the ship.
    let bx = 0;
    let by = 0;
    let bd = -1;
    for (let i = 0; i < 8; i++) {
      const t = Math.random();
      const side = Math.floor(Math.random() * 4);
      const x = side === 0 ? 0 : side === 1 ? WORLD_W : t * WORLD_W;
      const y = side === 2 ? 0 : side === 3 ? WORLD_H : t * WORLD_H;
      const d = Math.hypot(x - this.ship.x, y - this.ship.y);
      if (d > bd) {
        bd = d;
        bx = x;
        by = y;
      }
    }
    this.patrols.push({ x: bx, y: by, vx: 0, vy: 0 });
  }

  private die(reason: string): void {
    this.deathReason = reason;
    this.burst(this.ship.x, this.ship.y, '#7fe9ff', 30, 240);
    this.shake = 14;
    this.sfx.dead();
    this.setPhase('dead');
  }

  private clearLevel(): void {
    this.clearBonus = Math.max(0, Math.round((45 + this.total * 12 - this.time) * 10));
    this.addScore(this.clearBonus);
    this.burst(this.level.gate.x, this.level.gate.y, '#8dffb0', 30, 220);
    this.sfx.win();
    this.setPhase('cleared');
  }

  private addScore(n: number): void {
    this.score += n;
    if (this.score > this.best) this.best = this.score;
  }

  private burst(x: number, y: number, color: string, count: number, speed: number): void {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = speed * (0.25 + Math.random() * 0.75);
      const max = 0.4 + Math.random() * 0.5;
      this.particles.push({
        x,
        y,
        vx: Math.cos(a) * v,
        vy: Math.sin(a) * v,
        life: max,
        max,
        size: 1.5 + Math.random() * 2.5,
        color,
      });
    }
  }

  private updateParticles(dt: number): void {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 1 - 1.5 * dt;
      p.vy *= 1 - 1.5 * dt;
    }
  }

  private dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
    return Math.hypot(a.x - b.x, a.y - b.y);
  }
}
