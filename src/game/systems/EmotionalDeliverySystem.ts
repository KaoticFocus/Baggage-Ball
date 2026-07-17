/**
 * Phaser Emotional Delivery — fixed Loadout stack, tether/beam path, absorption VFX.
 * Owns visual/action delivery state. PlayScene owns gameplay resolution callbacks.
 */

import Phaser from 'phaser';
import {
  EMOTIONAL_RESPONSE_MODES,
  type EmotionalResponseModeId,
} from '../data/emotionalResponseModes';
import {
  EMOTIONAL_DELIVERY_TIMING,
  getEmotionalDeliveryStyle,
  isDeliveryBusy,
  type EmotionalDeliveryState,
  type EmotionalDeliveryStyle,
  type EmotionalDeliveryTiming,
} from '../data/emotionalDeliveryConfig';
import { GAME_LAYOUT, getLoadoutStackX, type PlayfieldRect } from '../layout/GameLayout';
import type { PaddleSide } from '../settings/PlayerSettings';

const DEPTH = {
  stack: 1,
  tether: 2.5,
  paddleCharge: 3.5,
  beam: 5.5,
  absorb: 7.4,
} as const;

type Point = { x: number; y: number };

type SlotView = {
  modeId: EmotionalResponseModeId;
  container: Phaser.GameObjects.Container;
  bg: Phaser.GameObjects.Rectangle;
  keyText: Phaser.GameObjects.Text;
  labelText: Phaser.GameObjects.Text;
  accent: Phaser.GameObjects.Rectangle;
  hit: Phaser.GameObjects.Zone;
};

export type EmotionalDeliveryHooks = {
  getPaddlePosition: () => Point;
  getBallPosition: () => Point;
  getBallRadius: () => number;
  isTargetValid: () => boolean;
  onModeSelected: (modeId: EmotionalResponseModeId) => void;
  /** Absorption complete — apply deterministic effects + release speech. */
  onDeliveryResolved: (actionId: string, modeId: EmotionalResponseModeId) => void;
  /** Cancelled before penetration — no gameplay effects. */
  onDeliveryCancelled: (actionId: string) => void;
};

export class EmotionalDeliverySystem {
  private readonly timing: EmotionalDeliveryTiming = { ...EMOTIONAL_DELIVERY_TIMING };
  private state: EmotionalDeliveryState = 'disabled';
  private slots: SlotView[] = [];
  private stackRoot: Phaser.GameObjects.Container | null = null;
  private pathGraphics: Phaser.GameObjects.Graphics | null = null;
  private chargeGraphics: Phaser.GameObjects.Graphics | null = null;
  private absorbGraphics: Phaser.GameObjects.Graphics | null = null;

  private playfield: PlayfieldRect | null = null;
  private playerSide: PaddleSide = 'right';

  private activeActionId: string | null = null;
  private activeModeId: EmotionalResponseModeId | null = null;
  private activeStyle: EmotionalDeliveryStyle | null = null;
  private phaseElapsed = 0;
  private tipU = 0;
  private trailU = 0;
  private pulseT = 0;
  private penetrated = false;
  private loadoutAnchor: Point = { x: 0, y: 0 };
  private destroyed = false;

  private ballVisualTarget: Phaser.GameObjects.Arc | null = null;
  private ballGlowTarget: Phaser.GameObjects.Arc | null = null;
  private baseBallScale = 1;
  private baseGlowScale = 1;
  private absorbTween: Phaser.Tweens.Tween | null = null;
  private cooldownProgress = 0;
  private cooldownGraphics: Phaser.GameObjects.Graphics | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly hooks: EmotionalDeliveryHooks
  ) {
    this.pathGraphics = scene.add.graphics().setDepth(DEPTH.beam);
    this.chargeGraphics = scene.add.graphics().setDepth(DEPTH.paddleCharge);
    this.absorbGraphics = scene.add.graphics().setDepth(DEPTH.absorb);
    this.cooldownGraphics = scene.add.graphics().setDepth(DEPTH.stack + 0.2);
  }

  bindBallVisuals(ball: Phaser.GameObjects.Arc, glow: Phaser.GameObjects.Arc): void {
    this.ballVisualTarget = ball;
    this.ballGlowTarget = glow;
    this.baseBallScale = ball.scaleX;
    this.baseGlowScale = glow.scaleX;
  }

  getState(): EmotionalDeliveryState {
    return this.state;
  }

  isBusy(): boolean {
    return isDeliveryBusy(this.state);
  }

  canAcceptInput(): boolean {
    return this.state === 'available';
  }

  /** Layout / rebuild the fixed vertical stack in playfield coordinates. */
  layout(playfield: PlayfieldRect, playerSide: PaddleSide): void {
    this.playfield = playfield;
    this.playerSide = playerSide;
    this.rebuildStack();
    this.refreshSlotAppearance();
  }

  setIdleState(state: 'available' | 'cooldown' | 'disabled'): void {
    if (this.isBusy()) return;
    this.state = state;
    if (state !== 'cooldown') this.cooldownProgress = 0;
    this.refreshSlotAppearance();
    this.drawCooldownBar();
  }

  /** remaining01: 1 → just started cooldown, 0 → ready. */
  setCooldownProgress(remaining01: number): void {
    this.cooldownProgress = Math.max(0, Math.min(1, remaining01));
    if (!this.isBusy() && this.state === 'cooldown') {
      this.drawCooldownBar();
    }
  }

  /**
   * Begin tether→beam→absorb for an already-accepted action.
   * Returns false if a delivery is already running.
   */
  beginDelivery(actionId: string, modeId: EmotionalResponseModeId): boolean {
    if (this.destroyed || this.isBusy()) return false;
    if (!this.hooks.isTargetValid()) return false;

    this.activeActionId = actionId;
    this.activeModeId = modeId;
    this.activeStyle = getEmotionalDeliveryStyle(modeId);
    this.phaseElapsed = 0;
    this.tipU = 0;
    this.trailU = 0;
    this.pulseT = 0;
    this.penetrated = false;
    this.loadoutAnchor = this.getSlotAnchor(modeId);
    this.state = 'tethering';
    this.refreshSlotAppearance();
    return true;
  }

  update(deltaMs: number): void {
    if (this.destroyed) return;
    this.pulseT += deltaMs * 0.001;

    if (!this.isBusy() || !this.activeStyle || !this.activeActionId || !this.activeModeId) {
      this.clearPathGraphics();
      if (this.state === 'cooldown') this.drawCooldownBar();
      return;
    }

    if (!this.hooks.isTargetValid()) {
      if (!this.penetrated) {
        this.cancelActive('target-invalid');
      }
      // After penetration, finish resolution against captured character.
    }

    this.phaseElapsed += deltaMs;
    this.advancePhase();
    this.drawPath();
    this.drawPaddleCharge();
    if (this.state === 'absorbing' || this.state === 'resolving') {
      this.drawAbsorbOverlay();
    }
  }

  cancelActive(_reason = 'cancel'): void {
    const actionId = this.activeActionId;
    const wasBusy = this.isBusy() && actionId !== null;
    this.clearDeliveryVisuals();
    this.activeActionId = null;
    this.activeModeId = null;
    this.activeStyle = null;
    this.state = 'available';
    this.refreshSlotAppearance();
    if (wasBusy && actionId) {
      this.hooks.onDeliveryCancelled(actionId);
    }
  }

  /** Clear delivery without firing cancel/resolve hooks (scene teardown / quit). */
  hardReset(): void {
    this.clearDeliveryVisuals();
    this.activeActionId = null;
    this.activeModeId = null;
    this.activeStyle = null;
    this.state = 'disabled';
    this.refreshSlotAppearance();
  }

  destroy(): void {
    this.destroyed = true;
    this.clearDeliveryVisuals();
    this.destroyStack();
    this.pathGraphics?.destroy();
    this.chargeGraphics?.destroy();
    this.absorbGraphics?.destroy();
    this.cooldownGraphics?.destroy();
    this.pathGraphics = null;
    this.chargeGraphics = null;
    this.absorbGraphics = null;
    this.cooldownGraphics = null;
  }

  private advancePhase(): void {
    if (!this.activeStyle || !this.activeActionId || !this.activeModeId) return;
    const t = this.timing;

    switch (this.state) {
      case 'tethering': {
        const p = Math.min(1, this.phaseElapsed / t.tetherMs);
        this.tipU = p * 0.5;
        this.trailU = 0;
        if (p >= 1) this.enterPhase('charging');
        break;
      }
      case 'charging': {
        this.tipU = 0.5;
        this.trailU = 0;
        if (this.phaseElapsed >= t.chargeMs) this.enterPhase('firing');
        break;
      }
      case 'firing': {
        const p = Math.min(1, this.phaseElapsed / t.beamTravelMs);
        this.tipU = 0.5 + p * 0.5;
        this.trailU = 0;
        if (p >= 1) {
          this.penetrated = true;
          this.enterPhase('penetrating');
        }
        break;
      }
      case 'penetrating': {
        this.tipU = 1;
        this.trailU = 0;
        if (this.phaseElapsed >= t.penetrateMs) this.enterPhase('draining');
        break;
      }
      case 'draining': {
        const p = Math.min(1, this.phaseElapsed / t.drainMs);
        this.tipU = 1;
        this.trailU = p;
        if (p >= 1) this.enterPhase('absorbing');
        break;
      }
      case 'absorbing': {
        this.tipU = 1;
        this.trailU = 1;
        if (this.phaseElapsed >= t.absorbMs) this.enterPhase('resolving');
        break;
      }
      case 'resolving': {
        const actionId = this.activeActionId;
        const modeId = this.activeModeId;
        this.clearDeliveryVisuals();
        this.activeActionId = null;
        this.activeModeId = null;
        this.activeStyle = null;
        this.state = 'cooldown';
        this.refreshSlotAppearance();
        this.hooks.onDeliveryResolved(actionId, modeId);
        break;
      }
      default:
        break;
    }
  }

  private enterPhase(next: EmotionalDeliveryState): void {
    this.state = next;
    this.phaseElapsed = 0;
    this.refreshSlotAppearance();

    if (next === 'absorbing') {
      this.startAbsorptionSensation();
    }
  }

  private startAbsorptionSensation(): void {
    if (!this.activeStyle || !this.ballVisualTarget) return;
    const style = this.activeStyle;
    const ball = this.ballVisualTarget;
    const glow = this.ballGlowTarget;

    this.absorbTween?.stop();
    ball.setScale(this.baseBallScale);
    glow?.setScale(this.baseGlowScale);

    const absorbMs = this.timing.absorbMs;
    const intensity = 0.08 + style.turbulence * 0.06;

    // Visual-only scale — physics body untouched.
    this.absorbTween = this.scene.tweens.add({
      targets: ball,
      scaleX: this.baseBallScale * (1 + intensity),
      scaleY: this.baseBallScale * (1 - intensity * 0.6),
      duration: absorbMs * 0.35,
      yoyo: true,
      repeat: Math.max(0, Math.floor(absorbMs / 160) - 1),
      ease: 'Sine.easeInOut',
      onComplete: () => {
        ball.setScale(this.baseBallScale);
      },
    });

    if (glow) {
      this.scene.tweens.add({
        targets: glow,
        scaleX: this.baseGlowScale * (1.15 + style.turbulence * 0.2),
        scaleY: this.baseGlowScale * (1.15 + style.turbulence * 0.2),
        alpha: Math.min(0.7, (glow.alpha || 0.25) + 0.35),
        duration: absorbMs * 0.45,
        yoyo: true,
        ease: 'Quad.easeOut',
        onComplete: () => {
          glow.setScale(this.baseGlowScale);
        },
      });
    }

    // Brief emotion-tinted flash on the ball fill.
    const originalFill = ball.fillColor;
    ball.setFillStyle(style.primaryColor, ball.fillAlpha);
    this.scene.time.delayedCall(Math.min(120, absorbMs * 0.3), () => {
      if (!this.destroyed) ball.setFillStyle(originalFill, ball.fillAlpha);
    });
  }

  private rebuildStack(): void {
    if (!this.playfield) return;
    this.destroyStack();

    const pf = this.playfield;
    const count = EMOTIONAL_RESPONSE_MODES.length;
    const topPad = 14;
    const bottomPad = 14;
    const availableH = pf.height - topPad - bottomPad;
    const gap = 3;
    const slotH = Math.max(28, Math.min(40, (availableH - gap * (count - 1)) / count));
    const slotW = GAME_LAYOUT.LOADOUT_SLOT_WIDTH;
    const stackH = count * slotH + (count - 1) * gap;
    const startY = pf.top + topPad + (availableH - stackH) / 2 + slotH / 2;

    // Outer rack: wall → Loadout → paddle → court. Fixed X; does not follow paddle Y.
    const stackX = getLoadoutStackX(this.playerSide, pf);

    this.stackRoot = this.scene.add.container(0, 0).setDepth(DEPTH.stack);

    this.slots = EMOTIONAL_RESPONSE_MODES.map((mode, index) => {
      const style = getEmotionalDeliveryStyle(mode.id);
      const y = startY + index * (slotH + gap);
      const container = this.scene.add.container(stackX, y);

      const bg = this.scene.add
        .rectangle(0, 0, slotW, slotH, 0x10101c, 0.78)
        .setStrokeStyle(1, style.primaryColor, 0.45);

      const accent = this.scene.add
        .rectangle(this.playerSide === 'left' ? -slotW / 2 + 2 : slotW / 2 - 2, 0, 3, slotH - 6, style.primaryColor, 0.85);

      const keyText = this.scene.add
        .text(this.playerSide === 'left' ? -slotW / 2 + 10 : slotW / 2 - 10, -6, mode.key, {
          fontFamily: 'Orbitron, monospace',
          fontSize: '11px',
          color: '#88d8ff',
        })
        .setOrigin(this.playerSide === 'left' ? 0 : 1, 0.5);

      const labelText = this.scene.add
        .text(this.playerSide === 'left' ? -slotW / 2 + 10 : slotW / 2 - 10, 7, style.shortLabel, {
          fontFamily: 'Share Tech Mono, monospace',
          fontSize: '10px',
          color: '#c8d4ee',
        })
        .setOrigin(this.playerSide === 'left' ? 0 : 1, 0.5);

      const hit = this.scene.add.zone(0, 0, slotW, slotH).setOrigin(0.5).setInteractive({ useHandCursor: true });
      hit.on('pointerdown', () => {
        if (!this.canAcceptInput()) return;
        this.hooks.onModeSelected(mode.id);
      });

      container.add([bg, accent, keyText, labelText, hit]);
      this.stackRoot!.add(container);

      return { modeId: mode.id, container, bg, keyText, labelText, accent, hit };
    });
  }

  private destroyStack(): void {
    this.slots.forEach((slot) => {
      slot.hit.removeAllListeners();
      slot.container.destroy(true);
    });
    this.slots = [];
    this.stackRoot?.destroy(true);
    this.stackRoot = null;
  }

  private getSlotAnchor(modeId: EmotionalResponseModeId): Point {
    const slot = this.slots.find((s) => s.modeId === modeId);
    if (!slot) {
      return this.hooks.getPaddlePosition();
    }
    // Inner edge toward the court — tether origin.
    const towardCourt = this.playerSide === 'left' ? 1 : -1;
    return {
      x: slot.container.x + towardCourt * (slot.bg.width / 2 - 2),
      y: slot.container.y,
    };
  }

  private refreshSlotAppearance(): void {
    const busy = this.isBusy();
    const cooldown = this.state === 'cooldown';
    const disabled = this.state === 'disabled';
    const interactive = this.state === 'available';

    for (const slot of this.slots) {
      const style = getEmotionalDeliveryStyle(slot.modeId);
      const selected = busy && slot.modeId === this.activeModeId;
      const dim = disabled || cooldown || (busy && !selected);

      slot.bg.setFillStyle(selected ? style.primaryColor : 0x10101c, selected ? 0.28 : dim ? 0.45 : 0.78);
      slot.bg.setStrokeStyle(selected ? 2 : 1, style.primaryColor, selected ? 0.95 : dim ? 0.25 : 0.5);
      slot.accent.setFillStyle(style.primaryColor, selected ? 1 : dim ? 0.35 : 0.85);
      slot.keyText.setAlpha(dim && !selected ? 0.4 : 1);
      slot.labelText.setAlpha(dim && !selected ? 0.4 : 1);
      if (interactive) {
        slot.hit.setInteractive({ useHandCursor: true });
      } else {
        slot.hit.disableInteractive();
      }
    }
  }

  private sampleEnergyPath(paddle: Point, ball: Point, style: EmotionalDeliveryStyle): Point[] {
    const a = this.loadoutAnchor;
    const b = paddle;
    const c = ball;
    const turb = style.turbulence * (2.5 + Math.sin(this.pulseT * style.pulseFrequency) * 1.5);
    const side = this.playerSide === 'left' ? 1 : -1;

    const points: Point[] = [];
    const segments = 28;

    for (let i = 0; i <= segments; i++) {
      const u = i / segments;
      if (u <= 0.5) {
        const t = u / 0.5;
        const ctrl = {
          x: (a.x + b.x) / 2 + side * (18 + turb * 4),
          y: (a.y + b.y) / 2 + Math.sin(this.pulseT * 6 + t * 4) * turb * 3,
        };
        points.push(this.quadPoint(a, ctrl, b, t));
      } else {
        const t = (u - 0.5) / 0.5;
        const ctrl = {
          x: (b.x + c.x) / 2,
          y: (b.y + c.y) / 2 + Math.sin(this.pulseT * 8 + t * 5) * turb * 2.5,
        };
        points.push(this.quadPoint(b, ctrl, c, t));
      }
    }
    return points;
  }

  private quadPoint(p0: Point, p1: Point, p2: Point, t: number): Point {
    const u = 1 - t;
    return {
      x: u * u * p0.x + 2 * u * t * p1.x + t * t * p2.x,
      y: u * u * p0.y + 2 * u * t * p1.y + t * t * p2.y,
    };
  }

  private drawPath(): void {
    const g = this.pathGraphics;
    const style = this.activeStyle;
    if (!g || !style) return;
    g.clear();

    if (this.trailU >= 0.999 && this.tipU >= 0.999) return;

    const paddle = this.hooks.getPaddlePosition();
    const ball = this.hooks.getBallPosition();
    const path = this.sampleEnergyPath(paddle, ball, style);
    const start = Math.floor(this.trailU * (path.length - 1));
    const end = Math.max(start + 1, Math.floor(this.tipU * (path.length - 1)));

    const released = this.state === 'draining' || this.state === 'absorbing' || this.state === 'resolving';
    const width = this.state === 'firing' || this.state === 'penetrating' || this.state === 'draining'
      ? style.beamWidth
      : style.tetherWidth;

    g.lineStyle(width + 2.5, style.secondaryColor, 0.22);
    this.strokePathSegment(g, path, start, end);
    g.lineStyle(width, style.primaryColor, released ? 0.75 : 0.95);
    this.strokePathSegment(g, path, start, end);

    // Leading tip glow
    const tip = path[end];
    if (tip) {
      g.fillStyle(style.secondaryColor, 0.85);
      g.fillCircle(tip.x, tip.y, width * 1.1);
    }

    // Discharge snap at loadout when draining begins
    if (this.state === 'draining' && this.trailU < 0.15) {
      g.fillStyle(style.primaryColor, 0.5);
      g.fillCircle(this.loadoutAnchor.x, this.loadoutAnchor.y, 6 + (1 - this.trailU / 0.15) * 4);
    }
  }

  private strokePathSegment(
    g: Phaser.GameObjects.Graphics,
    path: Point[],
    start: number,
    end: number
  ): void {
    if (end <= start || path.length < 2) return;
    g.beginPath();
    g.moveTo(path[start].x, path[start].y);
    for (let i = start + 1; i <= end; i++) {
      g.lineTo(path[i].x, path[i].y);
    }
    g.strokePath();
  }

  private drawPaddleCharge(): void {
    const g = this.chargeGraphics;
    const style = this.activeStyle;
    if (!g || !style) return;
    g.clear();

    if (
      this.state !== 'charging' &&
      this.state !== 'firing' &&
      this.state !== 'penetrating' &&
      this.state !== 'draining'
    ) {
      return;
    }

    const paddle = this.hooks.getPaddlePosition();
    const pulse = 0.55 + Math.sin(this.pulseT * style.pulseFrequency * 2) * 0.35;
    g.lineStyle(2, style.primaryColor, 0.35 + pulse * 0.4);
    g.strokeRoundedRect(paddle.x - 12, paddle.y - 52, 24, 104, 4);
    g.fillStyle(style.primaryColor, 0.12 + pulse * 0.1);
    g.fillRoundedRect(paddle.x - 10, paddle.y - 48, 20, 96, 3);
  }

  private drawAbsorbOverlay(): void {
    const g = this.absorbGraphics;
    const style = this.activeStyle;
    if (!g || !style) return;
    g.clear();

    const ball = this.hooks.getBallPosition();
    const r = this.hooks.getBallRadius();
    const t = this.phaseElapsed / Math.max(1, this.timing.absorbMs);
    const pulse = 0.4 + Math.sin(this.pulseT * style.pulseFrequency * 3) * 0.3;

    switch (style.absorptionStyle) {
      case 'skitter-inward':
        for (let i = 0; i < 5; i++) {
          const a = this.pulseT * 10 + i * 1.2;
          g.fillStyle(style.secondaryColor, 0.35);
          g.fillCircle(ball.x + Math.cos(a) * r * (1.1 - t), ball.y + Math.sin(a) * r * (1.1 - t), 2);
        }
        break;
      case 'hard-ring':
        g.lineStyle(2.5, style.primaryColor, 0.7 * (1 - t * 0.5));
        g.strokeCircle(ball.x, ball.y, r * (1.35 - t * 0.35));
        break;
      case 'orbit-pulse':
        g.lineStyle(1.5, style.secondaryColor, 0.55);
        g.strokeCircle(ball.x, ball.y, r * (1.1 + pulse * 0.15));
        break;
      case 'irritation-spikes':
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + this.pulseT * 8;
          g.lineStyle(1.5, style.primaryColor, 0.6);
          g.lineBetween(
            ball.x + Math.cos(a) * r * 0.7,
            ball.y + Math.sin(a) * r * 0.7,
            ball.x + Math.cos(a) * r * (1.25 + pulse * 0.1),
            ball.y + Math.sin(a) * r * (1.25 + pulse * 0.1)
          );
        }
        break;
      case 'muted-vacuum':
        g.fillStyle(0x000000, 0.2 + pulse * 0.1);
        g.fillCircle(ball.x, ball.y, r * (0.85 + t * 0.1));
        g.lineStyle(1.5, style.primaryColor, 0.45);
        g.strokeCircle(ball.x, ball.y, r * (1.05 - t * 0.1));
        break;
      case 'calm-waves':
        g.lineStyle(1.5, style.secondaryColor, 0.4 * (1 - t));
        g.strokeCircle(ball.x, ball.y, r * (1.1 + t * 0.5));
        g.lineStyle(1.2, style.primaryColor, 0.35 * (1 - t));
        g.strokeCircle(ball.x, ball.y, r * (1.25 + t * 0.4));
        break;
      case 'angular-recoil':
        g.lineStyle(2, style.primaryColor, 0.55);
        g.strokeRect(ball.x - r * 0.9, ball.y - r * 0.9, r * 1.8, r * 1.8);
        break;
      case 'warm-collapse':
      case 'stabilize':
      default:
        g.fillStyle(style.primaryColor, 0.18 + pulse * 0.12);
        g.fillCircle(ball.x, ball.y, r * (0.9 + t * 0.15));
        g.lineStyle(2, style.secondaryColor, 0.5);
        g.strokeCircle(ball.x, ball.y, r * (1.05 + pulse * 0.08));
        break;
    }
  }

  private drawCooldownBar(): void {
    const g = this.cooldownGraphics;
    if (!g || this.slots.length === 0) return;
    g.clear();
    if (this.state !== 'cooldown' || this.cooldownProgress <= 0) return;

    const first = this.slots[0];
    const last = this.slots[this.slots.length - 1];
    const slotH = first.bg.height;
    const y0 = first.container.y - slotH / 2;
    const y1 = last.container.y + slotH / 2;
    const height = y1 - y0;
    const fillH = height * this.cooldownProgress;
    const x = first.container.x + (this.playerSide === 'left' ? -(first.bg.width / 2 + 8) : first.bg.width / 2 + 8);

    g.fillStyle(0x223344, 0.55);
    g.fillRect(x - 3, y0, 6, height);
    g.fillStyle(0x00e5ff, 0.85);
    g.fillRect(x - 3, y1 - fillH, 6, fillH);
  }

  private clearPathGraphics(): void {
    this.pathGraphics?.clear();
    this.chargeGraphics?.clear();
  }

  private clearDeliveryVisuals(): void {
    this.clearPathGraphics();
    this.absorbGraphics?.clear();
    this.absorbTween?.stop();
    this.absorbTween = null;
    if (this.ballVisualTarget) this.ballVisualTarget.setScale(this.baseBallScale);
    if (this.ballGlowTarget) this.ballGlowTarget.setScale(this.baseGlowScale);
    this.tipU = 0;
    this.trailU = 0;
    this.penetrated = false;
    this.phaseElapsed = 0;
  }
}
