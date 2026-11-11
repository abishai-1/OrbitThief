import { CATCH_RADIUS, GATE_RADIUS, WORLD_H, WORLD_W } from './config.ts';
import type { Game } from './game.ts';
import { planetAt, stepFree, wellAt } from './physics.ts';

/** Maps world coordinates onto the canvas: screen = world * scale + offset. */
export interface View {
  scale: number;
  ox: number;
  oy: number;
}

const FONT = 'ui-monospace, Consolas, "Courier New", monospace';

const stars = Array.from({ length: 160 }, () => ({
  x: Math.random() * WORLD_W,
  y: Math.random() * WORLD_H,
  size: 0.6 + Math.random() * 1.4,
  phase: Math.random() * Math.PI * 2,
}));

export function render(ctx: CanvasRenderingContext2D, g: Game, view: View, now: number): void {
  const { planets, stations, gate } = g.level;
  const ship = g.ship;

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#05060d';
  ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);

  const shakeX = (Math.random() - 0.5) * g.shake;
  const shakeY = (Math.random() - 0.5) * g.shake;
  ctx.setTransform(
    view.scale,
    0,
    0,
    view.scale,
    view.ox + shakeX * view.scale,
    view.oy + shakeY * view.scale,
  );

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, WORLD_W, WORLD_H);
  ctx.clip();
  ctx.fillStyle = '#080a16';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);

  for (const s of stars) {
    ctx.globalAlpha = 0.35 + 0.3 * Math.sin(now * 1.5 + s.phase);
    ctx.fillStyle = '#cfd8ff';
    ctx.fillRect(s.x, s.y, s.size, s.size);
  }
  ctx.globalAlpha = 1;

  // Exit gate
  ctx.save();
  ctx.translate(gate.x, gate.y);
  ctx.textAlign = 'center';
  ctx.font = `12px ${FONT}`;
  if (g.gateOpen) {
    ctx.strokeStyle = '#8dffb0';
    ctx.shadowColor = '#8dffb0';
    ctx.shadowBlur = 18;
    ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const a = now * 2.2 + (i * Math.PI * 2) / 3;
      ctx.beginPath();
      ctx.arc(0, 0, GATE_RADIUS - 6, a, a + 1.4);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.25 + 0.15 * Math.sin(now * 5);
    ctx.fillStyle = '#8dffb0';
    ctx.beginPath();
    ctx.arc(0, 0, GATE_RADIUS - 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillText('EXIT', 0, GATE_RADIUS + 16);
  } else {
    ctx.strokeStyle = '#56607f';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 8]);
    ctx.beginPath();
    ctx.arc(0, 0, GATE_RADIUS - 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#56607f';
    ctx.fillText('LOCKED', 0, GATE_RADIUS + 16);
  }
  ctx.restore();

  // Planets and their gravity wells
  const inWell = ship.latched >= 0 ? ship.latched : wellAt(planets, ship.x, ship.y);
  planets.forEach((p, i) => {
    const active = i === inWell && g.phase !== 'dead';
    ctx.fillStyle = `hsla(${p.hue}, 70%, 60%, ${active ? 0.09 : 0.04})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.well, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `hsla(${p.hue}, 70%, 70%, ${active ? 0.7 : 0.22})`;
    ctx.lineWidth = active ? 2 : 1;
    ctx.setLineDash([4, 10]);
    ctx.lineDashOffset = -now * 12;
    ctx.stroke();
    ctx.setLineDash([]);

    const grad = ctx.createRadialGradient(
      p.x - p.r * 0.35,
      p.y - p.r * 0.35,
      p.r * 0.1,
      p.x,
      p.y,
      p.r,
    );
    grad.addColorStop(0, `hsl(${p.hue}, 75%, 72%)`);
    grad.addColorStop(1, `hsl(${p.hue}, 60%, 24%)`);
    ctx.fillStyle = grad;
    ctx.shadowColor = `hsl(${p.hue}, 80%, 55%)`;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  });

  // Stations
  for (const s of stations) {
    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.rotate(s.angle * 2);
    ctx.fillStyle = s.hasCargo ? '#9aa6c8' : '#3d4560';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.fillRect(-15, -2, 30, 4);
    if (s.hasCargo) {
      ctx.fillStyle = '#ffd866';
      ctx.shadowColor = '#ffd866';
      ctx.shadowBlur = 14;
      ctx.fillRect(-4, -4, 8, 8);
      ctx.shadowBlur = 0;
      ctx.strokeStyle = `rgba(255, 216, 102, ${0.5 + 0.3 * Math.sin(now * 5)})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(0, 0, 18 + 2 * Math.sin(now * 5), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (g.phase !== 'dead') {
    // Where the ship would go if it were flying free from this instant.
    if (g.phase === 'playing') {
      const ghost = { x: ship.x, y: ship.y, vx: ship.vx, vy: ship.vy };
      const dots = 40;
      for (let i = 1; i <= dots; i++) {
        for (let k = 0; k < 4; k++) stepFree(ghost, planets, 1 / 60);
        const crash = planetAt(planets, ghost.x, ghost.y) >= 0;
        ctx.globalAlpha = (1 - i / dots) * (ship.latched >= 0 ? 0.8 : 0.4);
        ctx.fillStyle = crash ? '#ff5566' : '#7fe9ff';
        ctx.beginPath();
        ctx.arc(ghost.x, ghost.y, crash ? 5 : 1.8, 0, Math.PI * 2);
        ctx.fill();
        if (crash) break;
      }
      ctx.globalAlpha = 1;
    }

    // Trail
    ctx.strokeStyle = '#7fe9ff';
    ctx.lineCap = 'round';
    for (let i = 1; i < ship.trail.length; i++) {
      const a = ship.trail[i - 1];
      const b = ship.trail[i];
      ctx.globalAlpha = (i / ship.trail.length) * 0.5;
      ctx.lineWidth = (i / ship.trail.length) * 4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Tether
    if (ship.latched >= 0) {
      const p = planets[ship.latched];
      ctx.strokeStyle = 'rgba(127, 233, 255, 0.55)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(ship.x, ship.y);
      ctx.stroke();
    }

    // Ship
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(Math.atan2(ship.vy, ship.vx));
    ctx.fillStyle = '#e8fbff';
    ctx.shadowColor = '#7fe9ff';
    ctx.shadowBlur = 16;
    ctx.beginPath();
    ctx.moveTo(12, 0);
    ctx.lineTo(-8, 7);
    ctx.lineTo(-4, 0);
    ctx.lineTo(-8, -7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  // Patrols
  for (const pt of g.patrols) {
    ctx.save();
    ctx.translate(pt.x, pt.y);
    ctx.strokeStyle = `rgba(255, 85, 102, ${0.35 + 0.25 * Math.sin(now * 8)})`;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(0, 0, CATCH_RADIUS + 3, 0, Math.PI * 2);
    ctx.stroke();
    ctx.rotate(Math.atan2(pt.vy, pt.vx));
    ctx.fillStyle = '#ff5566';
    ctx.shadowColor = '#ff5566';
    ctx.shadowBlur = 14;
    ctx.beginPath();
    ctx.moveTo(11, 0);
    ctx.lineTo(-7, 8);
    ctx.lineTo(-7, -8);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  for (const p of g.particles) {
    ctx.globalAlpha = p.life / p.max;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  ctx.strokeStyle = g.alarm && g.phase === 'playing' ? 'rgba(255, 85, 102, 0.6)' : '#232a45';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, WORLD_W, WORLD_H);

  drawHud(ctx, g, now);
  drawOverlay(ctx, g, now);
}

function drawHud(ctx: CanvasRenderingContext2D, g: Game, now: number): void {
  if (g.phase === 'title') return;
  ctx.font = `bold 20px ${FONT}`;
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#cfd8ff';
  ctx.fillText(`LEVEL ${g.levelNum}`, 24, 20);
  ctx.fillStyle = g.gateOpen ? '#8dffb0' : '#ffd866';
  ctx.fillText(`CARGO ${g.stolen}/${g.total}`, 160, 20);
  ctx.fillStyle = '#cfd8ff';
  ctx.fillText(`SCORE ${g.score}`, 330, 20);
  ctx.fillStyle = '#6b7699';
  ctx.fillText(`BEST ${g.best}`, 530, 20);

  ctx.textAlign = 'right';
  if (g.alarm) {
    ctx.fillStyle = Math.sin(now * 10) > 0 ? '#ff5566' : '#a8323f';
    ctx.fillText(`ALARM  ${g.patrols.length}/${g.patrolTarget} PATROLS`, WORLD_W - 24, 20);
  } else {
    ctx.fillStyle = '#6b7699';
    ctx.fillText('UNDETECTED', WORLD_W - 24, 20);
  }

  ctx.textAlign = 'center';
  ctx.font = `16px ${FONT}`;
  if (g.phase === 'playing' && g.gateOpen) {
    ctx.fillStyle = '#8dffb0';
    ctx.fillText('ALL CARGO STOLEN — GET TO THE EXIT', WORLD_W / 2, WORLD_H - 40);
  } else if (g.phase === 'playing' && g.levelNum === 1 && g.stolen === 0) {
    ctx.fillStyle = '#8f9bc4';
    ctx.fillText(
      'HOLD to orbit and build speed · RELEASE to slingshot · fly through stations to steal',
      WORLD_W / 2,
      WORLD_H - 40,
    );
  }
  ctx.textBaseline = 'alphabetic';
}

function drawOverlay(ctx: CanvasRenderingContext2D, g: Game, now: number): void {
  let title = '';
  let color = '#7fe9ff';
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
      'HOLD Space / mouse / touch to latch · RELEASE to slingshot',
      'R retry · P pause · M mute',
    );
    prompt = 'Press Space or click to start';
  } else if (g.phase === 'dead') {
    title = g.deathReason;
    color = '#ff5566';
    lines.push(`Level ${g.levelNum} · ${g.stolen}/${g.total} cargo`);
    prompt = 'Press Space or click to retry';
  } else if (g.phase === 'cleared') {
    title = 'CLEAN GETAWAY';
    color = '#8dffb0';
    lines.push(
      `Level ${g.levelNum} cleared in ${g.time.toFixed(1)}s`,
      `Speed bonus +${g.clearBonus}`,
      `Score ${g.score}`,
    );
    prompt = 'Press Space or click for the next job';
  } else {
    return;
  }

  ctx.fillStyle = 'rgba(5, 6, 13, 0.72)';
  ctx.fillRect(0, 0, WORLD_W, WORLD_H);
  ctx.textAlign = 'center';
  const top = WORLD_H / 2 - 60 - lines.length * 14;
  ctx.font = `bold 72px ${FONT}`;
  ctx.fillStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 30;
  ctx.fillText(title, WORLD_W / 2, top);
  ctx.shadowBlur = 0;

  ctx.font = `20px ${FONT}`;
  ctx.fillStyle = '#cfd8ff';
  lines.forEach((line, i) => ctx.fillText(line, WORLD_W / 2, top + 60 + i * 30));

  ctx.font = `bold 22px ${FONT}`;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.6 + 0.4 * Math.sin(now * 4);
  ctx.fillText(prompt, WORLD_W / 2, top + 90 + lines.length * 30);
  ctx.globalAlpha = 1;
}
