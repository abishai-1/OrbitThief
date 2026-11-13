// All tunable gameplay numbers live here. Units: world pixels and seconds.

/** Size of the sector that planets are placed in. Ships may fly beyond it. */
export const WORLD_W = 3200;
export const WORLD_H = 2000;

/** World units visible top to bottom at normal zoom. */
export const VIEW_H = 1050;
/** Narrow windows zoom out so at least this many world units fit across. */
export const VIEW_MIN_W = 1300;

/** Fixed physics timestep. Rendering interpolation is not needed at 120 Hz. */
export const STEP = 1 / 120;

/** Planet gravitational parameter is GRAVITY * radius^2. */
export const GRAVITY = 700;
/** Free-flying ships are nudged up to this speed so they can never stall in open space. */
export const MIN_DRIFT_SPEED = 90;
/** Spring strength of the tide that pulls ships back once they leave the sector. */
export const EDGE_PULL = 1.4;

/** Latching never leaves you slower than this. */
export const ORBIT_MIN_SPEED = 170;
/** Orbiting keeps winding the ship up until it reaches this speed. */
export const ORBIT_MAX_SPEED = 540;
/** Speed gained per second while latched. */
export const ORBIT_BOOST = 85;
/** Closest a latched orbit may sit above a planet's surface. */
export const ORBIT_CLEARANCE = 14;

export const PICKUP_RADIUS = 24;
export const GATE_RADIUS = 38;
export const CATCH_RADIUS = 15;

export const PATROL_ACCEL = 230;
export const PATROL_BASE_SPEED = 150;
export const PATROL_SPEED_PER_LEVEL = 10;
export const PATROL_MAX_SPEED = 250;
export const PATROL_MAX_COUNT = 6;
/** Seconds between patrol arrivals once the alarm is raised. */
export const PATROL_SPAWN_DELAY = 4;

/**
 * Ship paint jobs the player can cycle through. `accent` paints the fins, nose and hull
 * band; `glow` is the "r,g,b" used for the ship's glow, trail, tether and path preview.
 * Red, gold and green are left out: they mean patrols, cargo and the exit.
 */
export const SHIP_COLORS = [
  { name: 'Cyan', accent: '#2fb4d8', glow: '127,233,255' },
  { name: 'Violet', accent: '#8a5cf0', glow: '190,160,255' },
  { name: 'Magenta', accent: '#e04fb8', glow: '255,140,225' },
  { name: 'Orange', accent: '#f08a2c', glow: '255,180,110' },
  { name: 'Azure', accent: '#3d74f2', glow: '120,170,255' },
  { name: 'Silver', accent: '#aab6cc', glow: '225,235,255' },
];
