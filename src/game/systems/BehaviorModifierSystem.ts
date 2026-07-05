import Phaser from 'phaser';
import type { BallStats, BehaviorModifier } from '../types/BallTypes';

export class BehaviorModifierSystem {
  activeModifier: BehaviorModifier | null = null;
  modifierTicks = 0;
  outburstLabel: string | null = null;
  private readonly DURATION = 150;

  setModifier(modifier: BehaviorModifier | undefined, label?: string): void {
    if (!modifier) return;
    this.activeModifier = modifier;
    this.modifierTicks = this.DURATION;
    this.outburstLabel = label ?? OUTBURST_LABELS[modifier] ?? null;
  }

  tick(): void {
    if (this.modifierTicks > 0) {
      this.modifierTicks--;
      if (this.modifierTicks === 0) {
        this.activeModifier = null;
        this.outburstLabel = null;
      }
    }
  }

  hasModifier(): boolean {
    return this.activeModifier !== null;
  }

  reset(): void {
    this.activeModifier = null;
    this.modifierTicks = 0;
    this.outburstLabel = null;
  }
}

const OUTBURST_LABELS: Partial<Record<BehaviorModifier, string>> = {
  helpfulCurve: 'Helpful curve!',
  hostileFakeOut: 'Hostile fake-out!',
  erraticBounce: 'Erratic bounce!',
  speedSpike: 'Speed spike!',
  slowDown: 'Dramatic slowdown...',
  fakeOut: 'Fake-out!',
  gentleReturn: 'Gentle return.',
  dramaticPause: 'Dramatic pause...',
  clingyDrift: 'Clingy drift.',
  resentmentShot: 'Resentment shot!',
  chaosWobble: 'Chaos wobble!',
  speedUp: 'Speed surge!',
};

const BASE_SPEED = 280;

export function applyBehaviorToVelocity(
  body: Phaser.Physics.Arcade.Body,
  modifier: BehaviorModifier | null,
  paddleX: number,
  paddleY: number,
  chaosMultiplier: number,
  stats?: BallStats
): void {
  if (!body.velocity) return;

  let vx = body.velocity.x;
  let vy = body.velocity.y;

  switch (modifier) {
    case 'helpfulCurve': {
      const dir = paddleX > body.x ? 1 : -1;
      vx += dir * 22;
      vy += body.y > paddleY ? -8 : 0;
      break;
    }
    case 'clingyDrift': {
      vx += (paddleX - body.x) * 0.04;
      vy += (paddleY - 80 - body.y) * 0.02;
      break;
    }
    case 'erraticBounce':
    case 'chaosWobble':
      vx += (Math.random() - 0.5) * 160 * chaosMultiplier;
      vy += (Math.random() - 0.5) * 120 * chaosMultiplier;
      break;
    case 'speedSpike':
    case 'speedUp': {
      const mult = modifier === 'speedSpike' ? 1.55 : 1.35;
      vx *= mult;
      vy *= mult;
      break;
    }
    case 'slowDown':
    case 'dramaticPause': {
      const mult = modifier === 'dramaticPause' ? 0.55 : 0.75;
      vx *= mult;
      vy *= mult;
      break;
    }
    case 'fakeOut':
      vx = -vx * 0.75;
      break;
    case 'hostileFakeOut':
      vx = -vx * 1.1;
      vy = Math.abs(vy) * 0.6;
      break;
    case 'resentmentShot':
      vx += (body.x - paddleX) * 0.15;
      vy = -Math.abs(vy) * 1.25;
      break;
    case 'gentleReturn':
      vx *= 0.82;
      vy = -Math.abs(vy) * 0.88;
      break;
  }

  // Passive stat-driven drift (always active)
  if (stats) {
    if (stats.trust > 60 && !modifier) {
      const dir = paddleX > body.x ? 1 : -1;
      vx += dir * 6;
    }
    if (stats.resentment > 70 && Math.random() < 0.08) {
      vx += (Math.random() - 0.5) * 80;
    }
    if (stats.chaos > 70) {
      vx += (Math.random() - 0.5) * 14 * chaosMultiplier;
      vy += (Math.random() - 0.5) * 10 * chaosMultiplier;
    }
    if (stats.attachment > 80 && body.y > paddleY - 150) {
      vx += (paddleX - body.x) * 0.025;
    }
  }

  const newSpeed = Math.sqrt(vx * vx + vy * vy);
  const minSpeed = BASE_SPEED * 0.55;
  const maxSpeed = BASE_SPEED * (stats && stats.chaos > 75 ? 2.0 : 1.85);
  const clampedSpeed = Phaser.Math.Clamp(newSpeed || BASE_SPEED, minSpeed, maxSpeed);
  if (newSpeed > 0) {
    vx = (vx / newSpeed) * clampedSpeed;
    vy = (vy / newSpeed) * clampedSpeed;
  }

  if (Math.abs(vy) < 80) {
    vy = vy >= 0 ? 100 : -100;
  }

  body.setVelocity(vx, vy);
}

export function launchBall(
  body: Phaser.Physics.Arcade.Body,
  speedMultiplier: number,
  towardPaddle?: number
): void {
  let angle = Phaser.Math.Between(-60, 60) - 90;
  if (towardPaddle !== undefined) {
    angle = Phaser.Math.RadToDeg(Math.atan2(1, (towardPaddle - body.x) * 0.01)) - 90;
    angle = Phaser.Math.Clamp(angle, -120, -60);
  }
  const rad = Phaser.Math.DegToRad(angle);
  const speed = BASE_SPEED * speedMultiplier;
  body.setVelocity(Math.cos(rad) * speed, Math.sin(rad) * speed);
}

export function reflectPaddle(
  body: Phaser.Physics.Arcade.Body,
  paddleX: number,
  paddleWidth: number,
  gentleReturn: boolean,
  stats?: BallStats
): void {
  const hitPos = (body.x - paddleX) / (paddleWidth / 2);
  const clampedHit = Phaser.Math.Clamp(hitPos, -1, 1);
  let bounceAngle = clampedHit * (gentleReturn ? 50 : 70);

  if (stats && stats.resentment > 70 && Math.random() < 0.35) {
    bounceAngle += (Math.random() - 0.5) * 40;
  }

  const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) || BASE_SPEED;
  const rad = Phaser.Math.DegToRad(bounceAngle - 90);
  body.setVelocity(Math.cos(rad) * speed, -Math.abs(Math.sin(rad) * speed));
}

export { BASE_SPEED, OUTBURST_LABELS };
