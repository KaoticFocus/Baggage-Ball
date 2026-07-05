import Phaser from 'phaser';
import type { BallStats, BehaviorModifier } from '../types/BallTypes';
import type { PaddleSide } from '../settings/PlayerSettings';

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
  playerPaddleX: number,
  playerPaddleY: number,
  playerSide: PaddleSide,
  chaosMultiplier: number,
  stats?: BallStats
): void {
  if (!body.velocity) return;

  let vx = body.velocity.x;
  let vy = body.velocity.y;
  const towardPlayer = playerSide === 'left' ? -1 : 1;
  const awayFromPlayer = -towardPlayer;

  switch (modifier) {
    case 'helpfulCurve': {
      vx += awayFromPlayer * 22;
      vy += body.y > playerPaddleY ? 8 : -8;
      break;
    }
    case 'clingyDrift': {
      vx += (playerPaddleX - body.x) * 0.04;
      vy += (playerPaddleY - body.y) * 0.02;
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
      vy = Math.abs(vy) * 0.6 * (vy >= 0 ? 1 : -1);
      break;
    case 'resentmentShot':
      vx += (body.x - playerPaddleX) * 0.12 + awayFromPlayer * 40;
      vy += (Math.random() - 0.5) * 80;
      break;
    case 'gentleReturn':
      vx *= 0.82;
      vy *= 0.88;
      break;
  }

  if (stats) {
    if (stats.trust > 60 && !modifier) {
      vx += awayFromPlayer * 6;
    }
    if (stats.resentment > 70 && Math.random() < 0.08) {
      vx += (Math.random() - 0.5) * 80;
    }
    if (stats.chaos > 70) {
      vx += (Math.random() - 0.5) * 14 * chaosMultiplier;
      vy += (Math.random() - 0.5) * 10 * chaosMultiplier;
    }
    if (stats.attachment > 80 && Math.abs(body.x - playerPaddleX) < 120) {
      vx += (playerPaddleX - body.x) * 0.025;
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

  if (Math.abs(vx) < 80) {
    vx = vx >= 0 ? 100 : -100;
  }
  if (Math.abs(vy) < 60) {
    vy = vy >= 0 ? 70 : -70;
  }

  body.setVelocity(vx, vy);
}

export function launchBall(
  body: Phaser.Physics.Arcade.Body,
  speedMultiplier: number,
  options?: { toward?: PaddleSide; serve?: boolean }
): void {
  const toward = options?.toward ?? (Math.random() < 0.5 ? 'left' : 'right');
  const dir = toward === 'right' ? 1 : -1;
  const angleDeg = Phaser.Math.Between(options?.serve ? -22 : -32, options?.serve ? 22 : 32);
  const rad = Phaser.Math.DegToRad(angleDeg);
  const speed = BASE_SPEED * speedMultiplier * (options?.serve ? 0.78 : 1);

  body.setVelocity(Math.cos(rad) * speed * dir, Math.sin(rad) * speed);
}

export function reflectVerticalPaddle(
  body: Phaser.Physics.Arcade.Body,
  paddleY: number,
  paddleLength: number,
  paddleSide: PaddleSide,
  gentleReturn: boolean,
  stats?: BallStats
): void {
  const hitPos = (body.y - paddleY) / (paddleLength / 2);
  const clampedHit = Phaser.Math.Clamp(hitPos, -1, 1);
  let angleDeg = clampedHit * (gentleReturn ? 42 : 58);

  if (stats && stats.resentment > 70 && Math.random() < 0.35) {
    angleDeg += (Math.random() - 0.5) * 36;
  }

  const speed = Math.sqrt(body.velocity.x ** 2 + body.velocity.y ** 2) || BASE_SPEED;
  const awaySign = paddleSide === 'left' ? 1 : -1;
  const rad = Phaser.Math.DegToRad(angleDeg);
  const vx = Math.abs(Math.cos(rad) * speed) * awaySign;
  const vy = Math.sin(rad) * speed;

  body.setVelocity(vx, vy);
}

/** @deprecated Use reflectVerticalPaddle for side-paddle layout. */
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
