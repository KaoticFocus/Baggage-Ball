import Phaser from 'phaser';
import type { PaddleSide } from '../settings/PlayerSettings';
import type { OpponentGameplayModifier } from '../types/OpponentTypes';

export type OpponentAiConfig = {
  maxMoveSpeed: number;
  trackingError: number;
  reactionDelay: number;
};

const DEFAULT_CONFIG: OpponentAiConfig = {
  maxMoveSpeed: 320,
  trackingError: 18,
  reactionDelay: 120,
};

const MODIFIER_DURATION_MS = 3200;

export class OpponentPaddleAI {
  private config: OpponentAiConfig;
  private baseConfig: OpponentAiConfig;
  private reactionTimer = 0;
  private targetY = 0;
  private activeModifier: OpponentGameplayModifier = 'none';
  private modifierUntil = 0;
  private panicJitter = 0;

  constructor(config: Partial<OpponentAiConfig> = {}) {
    this.baseConfig = { ...DEFAULT_CONFIG, ...config };
    this.config = { ...this.baseConfig };
  }

  reset(paddleY: number): void {
    this.reactionTimer = 0;
    this.targetY = paddleY;
    this.activeModifier = 'none';
    this.modifierUntil = 0;
    this.config = { ...this.baseConfig };
  }

  applyModifier(modifier: OpponentGameplayModifier): void {
    if (modifier === 'none') return;

    this.activeModifier = modifier;
    this.modifierUntil = performance.now() + MODIFIER_DURATION_MS;
    this.config = { ...this.baseConfig };

    switch (modifier) {
      case 'opponentFocus':
        this.config.trackingError *= 0.65;
        this.config.maxMoveSpeed *= 1.08;
        break;
      case 'opponentTilt':
        this.config.trackingError *= 1.45;
        break;
      case 'opponentPanic':
        this.config.trackingError *= 1.25;
        break;
      case 'opponentShowoff':
        this.config.maxMoveSpeed *= 1.12;
        break;
      case 'opponentChoke':
        this.config.trackingError *= 1.55;
        this.config.reactionDelay *= 1.2;
        break;
      case 'opponentSpeedUp':
        this.config.maxMoveSpeed *= 1.18;
        break;
      case 'opponentSlowDown':
        this.config.maxMoveSpeed *= 0.82;
        break;
    }

    console.log('[Opponent Modifier]', modifier, 'for', MODIFIER_DURATION_MS, 'ms');
  }

  update(
    delta: number,
    paddle: Phaser.GameObjects.Rectangle,
    paddleBody: Phaser.Physics.Arcade.Body,
    _ballX: number,
    ballY: number,
    ballVx: number,
    opponentSide: PaddleSide,
    minY: number,
    maxY: number
  ): void {
    if (this.modifierUntil > 0 && performance.now() > this.modifierUntil) {
      this.activeModifier = 'none';
      this.modifierUntil = 0;
      this.config = { ...this.baseConfig };
    }

    const approaching = opponentSide === 'left' ? ballVx < 0 : ballVx > 0;

    if (!approaching) {
      const center = (minY + maxY) / 2;
      this.targetY = Phaser.Math.Linear(this.targetY, center, 0.02);
    } else {
      this.reactionTimer -= delta;
      if (this.reactionTimer <= 0) {
        let error = (Math.random() - 0.5) * this.config.trackingError * 2;
        if (this.activeModifier === 'opponentPanic') {
          this.panicJitter = (Math.random() - 0.5) * 24;
          error += this.panicJitter;
        }
        this.targetY = ballY + error;
        this.reactionTimer = this.config.reactionDelay;
      }
    }

    const clampedTarget = Phaser.Math.Clamp(this.targetY, minY, maxY);
    const maxStep = (this.config.maxMoveSpeed * delta) / 1000;
    const nextY = Phaser.Math.Linear(paddle.y, clampedTarget, Math.min(1, maxStep / 40));

    paddle.y = Phaser.Math.Clamp(nextY, minY, maxY);
    paddleBody.reset(paddle.x, paddle.y);
  }
}
