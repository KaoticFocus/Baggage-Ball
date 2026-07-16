/**
 * Reusable speaker waveform drawn with Phaser Graphics.
 * Vertical = paddle oscilloscope; horizontal = ball mouth.
 */

import Phaser from 'phaser';

export type WaveformOrientation = 'vertical' | 'horizontal';

export interface SpeakerWaveformConfig {
  orientation: WaveformOrientation;
  sampleCount: number;
  length: number;
  amplitude: number;
  lineWidth: number;
  followTarget: Phaser.GameObjects.GameObject & {
    x: number;
    y: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
  };
  offsetX?: number;
  offsetY?: number;
  clipInsideTarget?: boolean;
  ignoreTargetRotation?: boolean;
  color?: number;
  alpha?: number;
}

const FADE_IN_MS = 70;
const FADE_OUT_MS = 110;
const SMOOTH = 0.35;

export class SpeakerWaveform {
  readonly sampleCount: number;

  private readonly graphics: Phaser.GameObjects.Graphics;
  private readonly config: SpeakerWaveformConfig;
  private samples: number[];
  private visible = false;
  private fadeAlpha = 0;
  private fadeTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    config: SpeakerWaveformConfig
  ) {
    this.config = config;
    this.sampleCount = config.sampleCount;
    this.samples = Array.from({ length: config.sampleCount }, () => 0);
    this.graphics = scene.add.graphics();
    this.graphics.setDepth(40);
    this.graphics.setVisible(false);
    this.graphics.setAlpha(0);
  }

  show(): void {
    this.visible = true;
    this.graphics.setVisible(true);
    this.fadeTween?.stop();
    this.fadeTween = this.scene.tweens.add({
      targets: this.graphics,
      alpha: this.config.alpha ?? 0.95,
      duration: FADE_IN_MS,
      onUpdate: () => {
        this.fadeAlpha = this.graphics.alpha;
      },
    });
  }

  hide(): void {
    this.visible = false;
    this.fadeTween?.stop();
    this.fadeTween = this.scene.tweens.add({
      targets: this.graphics,
      alpha: 0,
      duration: FADE_OUT_MS,
      onComplete: () => {
        this.graphics.setVisible(false);
        this.samples = Array.from({ length: this.sampleCount }, () => 0);
        this.graphics.clear();
      },
    });
  }

  updateSamples(incoming: number[]): void {
    if (!this.visible) return;
    for (let index = 0; index < this.sampleCount; index += 1) {
      const next = incoming[index] ?? 0;
      this.samples[index] = Phaser.Math.Linear(this.samples[index] ?? 0, next, SMOOTH);
    }
    this.redraw();
  }

  updatePosition(): void {
    if (!this.graphics.visible) return;
    this.redraw();
  }

  destroy(): void {
    this.fadeTween?.stop();
    this.graphics.destroy();
  }

  private redraw(): void {
    const { followTarget, orientation, length, amplitude, lineWidth, offsetX = 0, offsetY = 0 } =
      this.config;
    const centerX = followTarget.x + offsetX;
    const centerY = followTarget.y + offsetY;
    const color = this.config.color ?? 0x00e5ff;

    this.graphics.clear();
    this.graphics.lineStyle(lineWidth, color, this.graphics.alpha);
    this.graphics.beginPath();

    const count = Math.max(2, this.sampleCount);
    const pointSpacing = length / (count - 1);

    if (orientation === 'vertical') {
      const top = centerY - length / 2;
      for (let index = 0; index < count; index += 1) {
        const sample = this.samples[index] ?? 0;
        const y = top + index * pointSpacing;
        let x = centerX + sample * amplitude;
        if (this.config.clipInsideTarget) {
          const halfW =
            ((followTarget.displayWidth ?? followTarget.width ?? 16) / 2) * 0.92;
          x = Phaser.Math.Clamp(x, centerX - halfW, centerX + halfW);
        }
        if (index === 0) this.graphics.moveTo(x, y);
        else this.graphics.lineTo(x, y);
      }
    } else {
      const left = centerX - length / 2;
      const mouthY = centerY;
      for (let index = 0; index < count; index += 1) {
        const sample = this.samples[index] ?? 0;
        const x = left + index * pointSpacing;
        const y = mouthY + sample * amplitude;
        if (index === 0) this.graphics.moveTo(x, y);
        else this.graphics.lineTo(x, y);
      }
    }

    this.graphics.strokePath();
    void this.fadeAlpha;
  }
}
