import { Synth } from './audio.ts';
import { SHIP_COLORS, STEP } from './config.ts';
import { Game } from './game.ts';
import { render } from './render.ts';

const BEST_KEY = 'orbit-thief-best';
const COLOR_KEY = 'orbit-thief-ship-color';

function loadBest(): number {
  try {
    return Number(localStorage.getItem(BEST_KEY)) || 0;
  } catch {
    return 0;
  }
}

function saveBest(n: number): void {
  try {
    localStorage.setItem(BEST_KEY, String(n));
  } catch {
    // Storage can be unavailable (private windows); the game works without it.
  }
}

function loadShipColor(): number {
  try {
    const n = Number(localStorage.getItem(COLOR_KEY));
    return Number.isInteger(n) && n >= 0 && n < SHIP_COLORS.length ? n : 0;
  } catch {
    return 0;
  }
}

function saveShipColor(n: number): void {
  try {
    localStorage.setItem(COLOR_KEY, String(n));
  } catch {
    // Same as saveBest: the choice just won't persist.
  }
}

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const synth = new Synth();
const game = new Game(synth, loadBest());
game.shipColor = loadShipColor();
let savedBest = game.best;

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
}
window.addEventListener('resize', resize);
resize();

function down(): void {
  synth.unlock();
  if (game.paused) return;
  if (!game.held) game.press();
  game.held = true;
}

function up(): void {
  game.held = false;
}

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    if (!e.repeat) down();
  } else if (e.code === 'KeyR') {
    game.retry();
  } else if (e.code === 'KeyP') {
    if (game.phase === 'playing') game.paused = !game.paused;
  } else if (e.code === 'KeyM') {
    synth.muted = !synth.muted;
  } else if (e.code === 'KeyC') {
    if (e.repeat) return;
    game.shipColor = (game.shipColor + (e.shiftKey ? SHIP_COLORS.length - 1 : 1)) % SHIP_COLORS.length;
    saveShipColor(game.shipColor);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') up();
});
canvas.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  down();
});
window.addEventListener('pointerup', up);
window.addEventListener('pointercancel', up);
window.addEventListener('blur', () => {
  up();
  if (game.phase === 'playing') game.paused = true;
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

let last = performance.now();
let acc = 0;

function frame(t: number): void {
  // Cap the frame delta so a background tab doesn't cause a huge catch-up.
  const dt = Math.min((t - last) / 1000, 0.1);
  acc += dt;
  last = t;
  while (acc >= STEP) {
    if (!game.paused) game.update(STEP);
    acc -= STEP;
  }
  if (game.best !== savedBest) {
    savedBest = game.best;
    saveBest(savedBest);
  }
  render(ctx, game, t / 1000, dt);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
