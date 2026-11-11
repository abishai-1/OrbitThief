export interface Vec {
  x: number;
  y: number;
}

export interface Planet {
  x: number;
  y: number;
  /** Solid radius: touching it destroys a ship. */
  r: number;
  /** Gravity well radius: gravity acts and latching is possible inside it. */
  well: number;
  /** Gravitational parameter. */
  mu: number;
  hue: number;
}

export interface Station {
  planet: number;
  orbitR: number;
  angle: number;
  angVel: number;
  x: number;
  y: number;
  hasCargo: boolean;
}

export interface Level {
  planets: Planet[];
  stations: Station[];
  gate: Vec;
  /** Index of the planet the ship starts latched to. */
  start: number;
}

export interface Ship {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Index of the planet the ship is latched to, or -1 in free flight. */
  latched: number;
  orbitR: number;
  /** +1 or -1: direction of travel around the latched planet. */
  orbitDir: number;
  orbitAngle: number;
  speed: number;
  trail: Vec[];
}

export interface Patrol {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  size: number;
  color: string;
}
