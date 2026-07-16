/**
 * Dramatic audio-reactive speaker waveform.
 * Radiates emotional energy from the speaking character — not a tiny equalizer.
 *
 * Driven by VoiceDirector analyser samples + smoothed speech energy.
 * Character look comes from VoiceWaveformStyle configuration.
 */

import Phaser from 'phaser';
import {
  resolveVoiceWaveformStyle,
  type VoiceWaveformStyle,
} from '../data/voiceWaveformStyles';

export type WaveformOrientation = 'vertical' | 'horizontal';

export type PlayfieldClampBounds = {
  left: number;
  right: number;
  top: number;
  bottom: number;
};

export interface SpeakerWaveformConfig {
  orientation: WaveformOrientation;
  sampleCount: number;
  length: number;
  /** Base peak displacement in game px (scaled further by style + energy). */
  amplitude: number;
  lineWidth: number;
  followTarget: Phaser.GameObjects.GameObject & {
    x: number;
    y: number;
    displayWidth?: number;
    displayHeight?: number;
    width?: number;
    height?: number;
    setScale?: (x: number, y?: number) => unknown;
  };
  /** Optional non-physics aura (e.g. ballGlow) pulsed during speech. */
  auraTarget?: Phaser.GameObjects.GameObject & {
    setScale?: (x: number, y?: number) => unknown;
    setAlpha?: (a: number) => unknown;
    alpha?: number;
  };
  offsetX?: number;
  offsetY?: number;
  clipInsideTarget?: boolean;
  ignoreTargetRotation?: boolean;
  color?: number;
  alpha?: number;
  characterId?: string;
  style?: VoiceWaveformStyle;
  getPlayfieldBounds?: () => PlayfieldClampBounds | null;
  depth?: number;
}

const FADE_IN_MS = 90;
const FADE_OUT_MS = 220;
const SAMPLE_SMOOTH = 0.42;
const START_PULSE_MS = 160;

export class SpeakerWaveform {
  readonly sampleCount: number;

  private readonly halo: Phaser.GameObjects.Graphics;
  private readonly core: Phaser.GameObjects.Graphics;
  private readonly ripples: Phaser.GameObjects.Graphics;
  private readonly config: SpeakerWaveformConfig;
  private readonly style: VoiceWaveformStyle;
  private readonly samples: number[];
  private readonly drawX: number[];
  private readonly drawY: number[];

  private visible = false;
  private energy = 0;
  private expand = 1;
  private startPulse = 0;
  private collapse = 1;
  private time = 0;
  private baseAuraAlpha = 0.25;
  private fadeTween: Phaser.Tweens.Tween | null = null;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    config: SpeakerWaveformConfig
  ) {
    this.config = config;
    this.sampleCount = config.sampleCount;
    this.style = config.style ?? resolveVoiceWaveformStyle(config.characterId ?? '');
    if (config.color !== undefined) {
      this.style = { ...this.style, primaryColor: config.color };
    }

    this.samples = new Array(config.sampleCount).fill(0);
    this.drawX = new Array(config.sampleCount).fill(0);
    this.drawY = new Array(config.sampleCount).fill(0);

    const depth = config.depth ?? 8;
    this.halo = scene.add.graphics().setDepth(depth);
    this.core = scene.add.graphics().setDepth(depth + 0.1);
    this.ripples = scene.add.graphics().setDepth(depth - 0.1);
    this.halo.setVisible(false);
    this.core.setVisible(false);
    this.ripples.setVisible(false);
    this.halo.setAlpha(0);
    this.core.setAlpha(0);
    this.ripples.setAlpha(0);

    if (config.auraTarget && typeof config.auraTarget.alpha === 'number') {
      this.baseAuraAlpha = config.auraTarget.alpha;
    }
  }

  show(): void {
    this.visible = true;
    this.collapse = 1;
    this.startPulse = 1;
    this.halo.setVisible(true);
    this.core.setVisible(true);
    this.ripples.setVisible(true);

    this.fadeTween?.stop();
    const targetAlpha = this.config.alpha ?? 1;
    this.fadeTween = this.scene.tweens.add({
      targets: [this.halo, this.core, this.ripples],
      alpha: targetAlpha,
      duration: FADE_IN_MS,
      ease: 'Cubic.Out',
    });

    this.pulseTween?.stop();
    this.pulseTween = this.scene.tweens.add({
      targets: this,
      startPulse: 0,
      duration: START_PULSE_MS,
      ease: 'Cubic.Out',
    });
  }

  hide(): void {
    this.visible = false;
    this.fadeTween?.stop();
    this.pulseTween?.stop();

    this.fadeTween = this.scene.tweens.add({
      targets: [this.halo, this.core, this.ripples],
      alpha: 0,
      duration: FADE_OUT_MS,
      ease: 'Cubic.In',
      onUpdate: () => {
        this.collapse = Math.max(0.15, this.core.alpha);
      },
      onComplete: () => {
        this.halo.setVisible(false);
        this.core.setVisible(false);
        this.ripples.setVisible(false);
        this.samples.fill(0);
        this.energy = 0;
        this.expand = 1;
        this.collapse = 1;
        this.halo.clear();
        this.core.clear();
        this.ripples.clear();
        this.resetAura();
      },
    });
  }

  /**
   * Drive the waveform from analyser samples + smoothed energy (0–1).
   * Call once per frame for the active speaker only.
   */
  updateFrame(incoming: number[], energy: number, deltaMs: number): void {
    if (!this.graphicsVisible()) return;

    const dt = Math.min(0.05, deltaMs / 1000);
    this.time += dt * this.style.pulseSpeed;

    const targetEnergy = Phaser.Math.Clamp(energy, 0, 1);
    if (targetEnergy > this.energy) {
      this.energy += (targetEnergy - this.energy) * 0.55;
    } else {
      this.energy += (targetEnergy - this.energy) * 0.16;
    }

    const peakBoost = 1 + this.energy * 0.35 + this.startPulse * 0.55;
    this.expand = Phaser.Math.Linear(this.expand, peakBoost, 0.28);

    for (let index = 0; index < this.sampleCount; index += 1) {
      const next = incoming[index] ?? 0;
      this.samples[index] = Phaser.Math.Linear(this.samples[index] ?? 0, next, SAMPLE_SMOOTH);
    }

    this.applyAura(dt);
    this.redraw();
  }

  /** @deprecated Prefer updateFrame — kept for registry compatibility during transition. */
  updateSamples(incoming: number[]): void {
    this.updateFrame(incoming, Math.max(0.18, this.energy || 0.4), 16);
  }

  updatePosition(): void {
    if (!this.graphicsVisible()) return;
    this.redraw();
  }

  destroy(): void {
    this.fadeTween?.stop();
    this.pulseTween?.stop();
    this.resetAura();
    this.halo.destroy();
    this.core.destroy();
    this.ripples.destroy();
  }

  private graphicsVisible(): boolean {
    return this.core.visible || this.visible;
  }

  private applyAura(dt: number): void {
    const aura = this.config.auraTarget;
    if (!aura?.setScale || !aura.setAlpha) return;

    if (!this.visible) {
      this.resetAura();
      return;
    }

    const pulse =
      1 +
      Math.min(0.05, 0.02 + this.energy * 0.03 + this.startPulse * 0.04) *
        (0.7 + 0.3 * Math.sin(this.time * 7));
    aura.setScale(pulse);
    const glowAlpha = this.baseAuraAlpha * (1.15 + this.energy * 1.4 + this.startPulse * 0.8);
    aura.setAlpha(Phaser.Math.Clamp(glowAlpha, 0.15, 0.95));
    void dt;
  }

  private resetAura(): void {
    const aura = this.config.auraTarget;
    aura?.setScale?.(1);
    aura?.setAlpha?.(this.baseAuraAlpha);
  }

  private redraw(): void {
    const { followTarget, orientation, length, amplitude, offsetX = 0, offsetY = 0 } = this.config;
    const style = this.style;
    const bounds = this.config.getPlayfieldBounds?.() ?? null;

    let centerX = followTarget.x + offsetX;
    let centerY = followTarget.y + offsetY;

    const amp =
      amplitude *
      style.amplitudeScale *
      (0.55 + this.energy * 1.35) *
      this.expand *
      this.collapse;
    const span = length * (0.92 + this.energy * 0.22 + this.startPulse * 0.18);

    if (bounds) {
      const margin = 10;
      centerX = Phaser.Math.Clamp(centerX, bounds.left + margin, bounds.right - margin);
      centerY = Phaser.Math.Clamp(centerY, bounds.top + margin, bounds.bottom - margin);
    }

    const count = Math.max(2, this.sampleCount);
    this.buildPoints(orientation, centerX, centerY, span, amp, count, bounds);

    this.halo.clear();
    this.core.clear();
    this.ripples.clear();

    const glowAlpha = Math.min(1, (0.35 + style.glowStrength * 0.45) * this.core.alpha);
    const coreAlpha = Math.min(1, (0.75 + this.energy * 0.25) * this.core.alpha);

    // Soft outer halo path (thicker, secondary color).
    this.strokeSmooth(
      this.halo,
      style.lineThickness * 3.2 * style.glowStrength,
      style.secondaryColor,
      glowAlpha * 0.45
    );
    this.strokeSmooth(
      this.halo,
      style.lineThickness * 1.8,
      style.secondaryColor,
      glowAlpha * 0.7
    );

    // Bright primary waveform.
    this.strokeSmooth(
      this.core,
      style.lineThickness * (1.15 + this.energy * 0.35),
      style.primaryColor,
      coreAlpha
    );

    // Peak ripples / energy rings around the speaker.
    if (this.energy > 0.55 || this.startPulse > 0.2) {
      this.drawRipples(centerX, centerY, amp, bounds);
    }
  }

  private buildPoints(
    orientation: WaveformOrientation,
    centerX: number,
    centerY: number,
    span: number,
    amp: number,
    count: number,
    bounds: PlayfieldClampBounds | null
  ): void {
    const style = this.style;
    const pointSpacing = span / (count - 1);
    const soft = style.curveSoftness;
    const turb = style.turbulence;

    if (orientation === 'vertical') {
      const top = centerY - span / 2;
      for (let index = 0; index < count; index += 1) {
        const t = index / (count - 1);
        const sample = this.samples[index] ?? 0;
        const chaos =
          Math.sin(this.time * 11 + index * 0.7) * turb * 0.18 * this.energy +
          Math.sin(this.time * 17 + t * 9) * turb * 0.1 * this.energy;
        const shaped = sample * (0.65 + soft * 0.35) + chaos * (1 - soft * 0.5);
        let x = centerX + shaped * amp;
        let y = top + index * pointSpacing;

        if (this.config.clipInsideTarget) {
          const halfW =
            ((this.config.followTarget.displayWidth ?? this.config.followTarget.width ?? 16) /
              2) *
            1.85;
          x = Phaser.Math.Clamp(x, centerX - halfW, centerX + halfW);
        }
        if (bounds) {
          x = Phaser.Math.Clamp(x, bounds.left + 6, bounds.right - 6);
          y = Phaser.Math.Clamp(y, bounds.top + 6, bounds.bottom - 6);
        }
        this.drawX[index] = x;
        this.drawY[index] = y;
      }
      return;
    }

    // Horizontal — emotional energy around the ball.
    const left = centerX - span / 2;
    for (let index = 0; index < count; index += 1) {
      const t = index / (count - 1);
      const sample = this.samples[index] ?? 0;
      // Symmetrical “heart-like” surge for soft styles; jagged for stressed ones.
      const envelope = Math.sin(t * Math.PI);
      const chaos =
        Math.sin(this.time * 13 + index * 0.55) * turb * 0.22 * this.energy +
        Math.sin(this.time * 19 + t * 11) * turb * 0.12;
      const mirrored = soft > 0.6 ? sample * envelope + chaos * envelope : sample + chaos;
      let x = left + index * pointSpacing;
      let y = centerY + mirrored * amp;

      // Near edges, compress vertical travel instead of clipping the whole wave away.
      if (bounds) {
        x = Phaser.Math.Clamp(x, bounds.left + 8, bounds.right - 8);
        const roomUp = centerY - (bounds.top + 8);
        const roomDown = bounds.bottom - 8 - centerY;
        const maxDisp = Math.max(8, Math.min(roomUp, roomDown, amp * 1.1));
        y = centerY + Phaser.Math.Clamp(y - centerY, -maxDisp, maxDisp);
      }
      this.drawX[index] = x;
      this.drawY[index] = y;
    }
  }

  private strokeSmooth(
    g: Phaser.GameObjects.Graphics,
    width: number,
    color: number,
    alpha: number
  ): void {
    const count = this.sampleCount;
    if (count < 2) return;
    g.lineStyle(width, color, alpha);
    g.beginPath();
    g.moveTo(this.drawX[0]!, this.drawY[0]!);

    if (this.style.curveSoftness >= 0.55) {
      // Approximate smooth curves with midpoints (Phaser Graphics has no quadraticCurveTo).
      for (let index = 1; index < count; index += 1) {
        const prevX = this.drawX[index - 1]!;
        const prevY = this.drawY[index - 1]!;
        const x = this.drawX[index]!;
        const y = this.drawY[index]!;
        g.lineTo((prevX + x) / 2, (prevY + y) / 2);
        g.lineTo(x, y);
      }
    } else {
      for (let index = 1; index < count; index += 1) {
        g.lineTo(this.drawX[index]!, this.drawY[index]!);
      }
    }
    g.strokePath();
  }

  private drawRipples(
    centerX: number,
    centerY: number,
    amp: number,
    bounds: PlayfieldClampBounds | null
  ): void {
    const strength = Math.max(this.energy - 0.5, this.startPulse) ;
    const rings = 2;
    for (let r = 0; r < rings; r += 1) {
      const radius =
        (14 + amp * 0.35 + r * (10 + this.energy * 8)) *
        (0.85 + this.startPulse * 0.35 + Math.sin(this.time * 6 + r) * 0.05);
      let cx = centerX;
      let cy = centerY;
      if (bounds) {
        cx = Phaser.Math.Clamp(cx, bounds.left + radius, bounds.right - radius);
        cy = Phaser.Math.Clamp(cy, bounds.top + radius, bounds.bottom - radius);
      }
      this.ripples.lineStyle(
        2.2 - r * 0.4,
        this.style.secondaryColor,
        (0.22 + strength * 0.35) * this.ripples.alpha
      );
      this.ripples.strokeCircle(cx, cy, radius);
    }
  }
}
