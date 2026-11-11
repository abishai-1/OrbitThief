import { Synth } from './audio.ts';
import { STEP, WORLD_H, WORLD_W } from './config.ts';
import { Game } from './game.ts';
import { render, type View } from './render.ts';

const BEST_KEY = 'orbit-thief-best';

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

const canvas = document.getElementById('game') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
const synth = new Synth();
const game = new Game(synth, loadBest());
let savedBest = game.best;

const view: View = { scale: 1, ox: 0, oy: 0 };

function resize(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  // Fit the whole sector on screen with a small margin, letterboxed.
  view.scale = Math.min(canvas.width / WORLD_W, canvas.height / WORLD_H) * 0.97;
  view.ox = (canvas.width - WORLD_W * view.scale) / 2;
  view.oy = (canvas.height - WORLD_H * view.scale) / 2;
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
  acc += Math.min((t - last) / 1000, 0.1);
  last = t;
  while (acc >= STEP) {
    if (!game.paused) game.update(STEP);
    acc -= STEP;
  }
  if (game.best !== savedBest) {
    savedBest = game.best;
    saveBest(savedBest);
  }
  render(ctx, game, view, t / 1000);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
