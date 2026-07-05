import Phaser from 'phaser';
import type { PaddleSide } from '../settings/PlayerSettings';
import type { OpponentGameplayModifier } from '../types/OpponentTypes';

export type OpponentDifficultyTier = 'easy' | 'normal' | 'hard';

export type OpponentDifficulty = {
  reactionDelayMs: number;
  reactionDelayJitterMs: number;
  maxMoveSpeed: number;
  baseTrackingError: number;
  mistakeChanceLowSpeed: number;
  mistakeChanceMediumSpeed: number;
  mistakeChanceHighSpeed: number;
  speedMediumThreshold: number;
  speedHighThreshold: number;
  longRallyMistakeBonusMid: number;
  longRallyMistakeBonusHigh: number;
  longRallyMidHits: number;
  longRallyHighHits: number;
  chaosMistakeBonusHigh: number;
  chaosMistakeBonusMid: number;
  sharpAngleMistakeBonus: number;
  overCorrectionChance: number;
  mistakeErrorMin: number;
  mistakeErrorMax: number;
  mistakeDurationMin: number;
  mistakeDurationMax: number;
};

/** Readable tuning presets — adjust here for future balance passes. */
export const OPPONENT_DIFFICULTY: Record<OpponentDifficultyTier, OpponentDifficulty> = {
  easy: {
    reactionDelayMs: 150,
    reactionDelayJitterMs: 55,
    maxMoveSpeed: 325,
    baseTrackingError: 36,
    mistakeChanceLowSpeed: 0.07,
    mistakeChanceMediumSpeed: 0.11,
    mistakeChanceHighSpeed: 0.2,
    speedMediumThreshold: 450,
    speedHighThreshold: 650,
    longRallyMistakeBonusMid: 0.04,
    longRallyMistakeBonusHigh: 0.06,
    longRallyMidHits: 10,
    longRallyHighHits: 18,
    chaosMistakeBonusHigh: 0.05,
    chaosMistakeBonusMid: 0.025,
    sharpAngleMistakeBonus: 0.04,
    overCorrectionChance: 0.1,
    mistakeErrorMin: 34,
    mistakeErrorMax: 68,
    mistakeDurationMin: 350,
    mistakeDurationMax: 900,
  },
  normal: {
    reactionDelayMs: 115,
    reactionDelayJitterMs: 45,
    maxMoveSpeed: 375,
    baseTrackingError: 28,
    mistakeChanceLowSpeed: 0.04,
    mistakeChanceMediumSpeed: 0.08,
    mistakeChanceHighSpeed: 0.15,
    speedMediumThreshold: 450,
    speedHighThreshold: 650,
    longRallyMistakeBonusMid: 0.03,
    longRallyMistakeBonusHigh: 0.05,
    longRallyMidHits: 10,
    longRallyHighHits: 18,
    chaosMistakeBonusHigh: 0.04,
    chaosMistakeBonusMid: 0.02,
    sharpAngleMistakeBonus: 0.03,
    overCorrectionChance: 0.08,
    mistakeErrorMin: 30,
    mistakeErrorMax: 58,
    mistakeDurationMin: 300,
    mistakeDurationMax: 900,
  },
  hard: {
    reactionDelayMs: 90,
    reactionDelayJitterMs: 35,
    maxMoveSpeed: 415,
    baseTrackingError: 18,
    mistakeChanceLowSpeed: 0.025,
    mistakeChanceMediumSpeed: 0.055,
    mistakeChanceHighSpeed: 0.11,
    speedMediumThreshold: 450,
    speedHighThreshold: 650,
    longRallyMistakeBonusMid: 0.02,
    longRallyMistakeBonusHigh: 0.04,
    longRallyMidHits: 10,
    longRallyHighHits: 18,
    chaosMistakeBonusHigh: 0.03,
    chaosMistakeBonusMid: 0.015,
    sharpAngleMistakeBonus: 0.02,
    overCorrectionChance: 0.06,
    mistakeErrorMin: 24,
    mistakeErrorMax: 48,
    mistakeDurationMin: 280,
    mistakeDurationMax: 750,
  },
};

const MODIFIER_DURATION_MS = 3200;
const DIFFICULTY_TIERS: OpponentDifficultyTier[] = ['easy', 'normal', 'hard'];

function computeMistakeChance(
  ballSpeed: number,
  rallyHits: number,
  chaos: number,
  ballVx: number,
  ballVy: number,
  config: OpponentDifficulty
): number {
  let chance: number;
  if (ballSpeed < config.speedMediumThreshold) {
    chance = config.mistakeChanceLowSpeed;
  } else if (ballSpeed <= config.speedHighThreshold) {
    chance = config.mistakeChanceMediumSpeed;
  } else {
    chance = config.mistakeChanceHighSpeed;
  }

  if (rallyHits >= config.longRallyHighHits) {
    chance += config.longRallyMistakeBonusHigh;
  } else if (rallyHits >= config.longRallyMidHits) {
    chance += config.longRallyMistakeBonusMid;
  }

  if (chaos >= 75) chance += config.chaosMistakeBonusHigh;
  else if (chaos >= 55) chance += config.chaosMistakeBonusMid;

  const angleRatio = Math.abs(ballVy / (Math.abs(ballVx) + 0.001));
  if (angleRatio > 0.55) chance += config.sharpAngleMistakeBonus;

  return Phaser.Math.Clamp(chance, 0, 0.38);
}

export class OpponentPaddleAI {
  private config!: OpponentDifficulty;
  private baseConfig!: OpponentDifficulty;
  private difficultyTier: OpponentDifficultyTier = 'normal';
  private reactionTimer = 0;
  private targetY = 0;
  private activeModifier: OpponentGameplayModifier = 'none';
  private modifierUntil = 0;
  private trackingErrorOffset = 0;
  private trackingErrorUntil = 0;
  private overcorrectUntil = 0;
  private mistakeLabel = '';

  constructor(tier: OpponentDifficultyTier = 'normal') {
    this.setDifficultyTier(tier);
  }

  getDifficultyTier(): OpponentDifficultyTier {
    return this.difficultyTier;
  }

  setDifficultyTier(tier: OpponentDifficultyTier): void {
    this.difficultyTier = tier;
    this.baseConfig = { ...OPPONENT_DIFFICULTY[tier] };
    this.config = { ...this.baseConfig };
  }

  adjustDifficulty(direction: -1 | 1): void {
    const idx = DIFFICULTY_TIERS.indexOf(this.difficultyTier);
    const next = Phaser.Math.Clamp(idx + direction, 0, DIFFICULTY_TIERS.length - 1);
    this.setDifficultyTier(DIFFICULTY_TIERS[next]);
    console.log(`[Opponent Difficulty] ${direction < 0 ? 'easier' : 'harder'} → ${this.difficultyTier}`);
  }

  reset(paddleY: number): void {
    this.reactionTimer = 0;
    this.targetY = paddleY;
    this.activeModifier = 'none';
    this.modifierUntil = 0;
    this.trackingErrorOffset = 0;
    this.trackingErrorUntil = 0;
    this.overcorrectUntil = 0;
    this.mistakeLabel = '';
    this.config = { ...this.baseConfig };
  }

  beginRally(): void {
    this.trackingErrorOffset = 0;
    this.trackingErrorUntil = 0;
    this.overcorrectUntil = 0;
    this.mistakeLabel = '';
    this.reactionTimer = 0;
  }

  applyModifier(modifier: OpponentGameplayModifier): void {
    if (modifier === 'none') return;

    this.activeModifier = modifier;
    this.modifierUntil = performance.now() + MODIFIER_DURATION_MS;
    this.config = { ...this.baseConfig };

    switch (modifier) {
      case 'opponentFocus':
        this.config.baseTrackingError *= 0.65;
        this.config.maxMoveSpeed *= 1.08;
        break;
      case 'opponentTilt':
        this.config.baseTrackingError *= 1.35;
        break;
      case 'opponentPanic':
        this.config.baseTrackingError *= 1.2;
        break;
      case 'opponentShowoff':
        this.config.maxMoveSpeed *= 1.1;
        break;
      case 'opponentChoke':
        this.config.baseTrackingError *= 1.45;
        this.config.reactionDelayMs *= 1.15;
        break;
      case 'opponentSpeedUp':
        this.config.maxMoveSpeed *= 1.14;
        break;
      case 'opponentSlowDown':
        this.config.maxMoveSpeed *= 0.84;
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
    ballVy: number,
    opponentSide: PaddleSide,
    minY: number,
    maxY: number,
    ballSpeed: number,
    rallyHits: number,
    chaos = 0
  ): void {
    if (this.modifierUntil > 0 && performance.now() > this.modifierUntil) {
      this.activeModifier = 'none';
      this.modifierUntil = 0;
      this.config = { ...this.baseConfig };
    }

    const now = performance.now();
    const approaching = opponentSide === 'left' ? ballVx < 0 : ballVx > 0;

    if (!approaching) {
      const center = (minY + maxY) / 2;
      this.targetY = Phaser.Math.Linear(this.targetY, center, 0.03);
      this.trackingErrorOffset = Phaser.Math.Linear(this.trackingErrorOffset, 0, 0.05);
      this.mistakeLabel = '';
    } else {
      this.reactionTimer -= delta;

      if (now < this.trackingErrorUntil || now < this.overcorrectUntil) {
        if (now >= this.trackingErrorUntil && now < this.overcorrectUntil) {
          this.trackingErrorOffset = Phaser.Math.Linear(
            this.trackingErrorOffset,
            (ballY - paddle.y) * 0.35,
            0.12
          );
        }
        this.targetY = ballY + this.trackingErrorOffset;
      } else if (this.reactionTimer <= 0) {
        this.reactionTimer =
          this.config.reactionDelayMs + Phaser.Math.Between(0, this.config.reactionDelayJitterMs);

        const missChance = computeMistakeChance(
          ballSpeed,
          rallyHits,
          chaos,
          ballVx,
          ballVy,
          this.config
        );

        if (Math.random() < missChance) {
          const errorMag = Phaser.Math.Between(
            this.config.mistakeErrorMin,
            this.config.mistakeErrorMax
          );
          this.trackingErrorOffset = (Math.random() < 0.5 ? -1 : 1) * errorMag;
          const durationMs = Phaser.Math.Between(
            this.config.mistakeDurationMin,
            this.config.mistakeDurationMax
          );
          this.trackingErrorUntil = now + durationMs;
          this.mistakeLabel = 'misread';
          console.log(
            `[AI Mistake] trackingError=${errorMag} duration=${durationMs}ms speed=${Math.round(ballSpeed)} rally=${rallyHits}`
          );
        } else if (Math.random() < this.config.overCorrectionChance && ballSpeed > 420) {
          this.overcorrectUntil = now + Phaser.Math.Between(320, 720);
          this.trackingErrorOffset = (ballY - paddle.y) * Phaser.Math.Between(45, 62) * 0.01;
          this.mistakeLabel = 'overCorrection';
          console.log('[AI Mistake] overCorrection');
        } else {
          const drift = (Math.random() - 0.5) * this.config.baseTrackingError;
          this.trackingErrorOffset = Phaser.Math.Linear(this.trackingErrorOffset, drift, 0.22);
          this.mistakeLabel = '';
        }

        if (this.activeModifier === 'opponentPanic' && this.mistakeLabel) {
          this.trackingErrorOffset += (Math.random() - 0.5) * 12;
        }

        this.targetY = ballY + this.trackingErrorOffset;
      } else {
        this.targetY = Phaser.Math.Linear(this.targetY, ballY + this.trackingErrorOffset, 0.35);
      }
    }

    const clampedTarget = Phaser.Math.Clamp(this.targetY, minY, maxY);
    const maxStep = (this.config.maxMoveSpeed * delta) / 1000;
    const dist = Math.abs(clampedTarget - paddle.y);
    const lerp = dist > 0 ? Math.min(1, maxStep / Math.max(dist, 1)) : 0;
    const nextY = Phaser.Math.Linear(paddle.y, clampedTarget, lerp);

    paddle.y = Phaser.Math.Clamp(nextY, minY, maxY);
    paddleBody.reset(paddle.x, paddle.y);
  }
}
