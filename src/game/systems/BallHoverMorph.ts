import Phaser from 'phaser';
import type { BallStats } from '../types/BallTypes';

export type BallMorphColors = { fill: number; stroke: number };

const MORPH_IN_MS = 300;
const MORPH_OUT_MS = 250;

export class BallHoverMorph {
  private readonly scene: Phaser.Scene;
  private readonly ball: Phaser.GameObjects.Arc;
  private readonly ballGlow: Phaser.GameObjects.Arc;
  private readonly ballId: string;
  private readonly colors: BallMorphColors;
  private readonly radius: number;

  private container!: Phaser.GameObjects.Container;
  private mainGraphic!: Phaser.GameObjects.Graphics;
  private orbitContainer: Phaser.GameObjects.Container | null = null;
  private activeTweens: Phaser.Tweens.Tween[] = [];
  private active = false;

  constructor(
    scene: Phaser.Scene,
    ball: Phaser.GameObjects.Arc,
    ballGlow: Phaser.GameObjects.Arc,
    ballId: string,
    colors: BallMorphColors,
    radius: number
  ) {
    this.scene = scene;
    this.ball = ball;
    this.ballGlow = ballGlow;
    this.ballId = ballId;
    this.colors = colors;
    this.radius = radius;

    this.container = scene.add.container(ball.x, ball.y).setDepth(8).setVisible(false);
    this.mainGraphic = scene.add.graphics();
    this.container.add(this.mainGraphic);
  }

  isActive(): boolean {
    return this.active;
  }

  syncPosition(x: number, y: number): void {
    if (!this.active) return;
    this.container.setPosition(x, y);
  }

  enter(stats: BallStats): void {
    this.stopTweens();
    this.clearMorphExtras();
    this.active = true;

    this.container.setPosition(this.ball.x, this.ball.y);
    this.container.setAngle(0);
    this.container.setScale(0.65);
    this.container.setAlpha(0);
    this.container.setVisible(true);

    this.drawMorphShape(stats);

    this.ball.setVisible(false);
    this.ballGlow.setVisible(false);

    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        alpha: 1,
        scaleX: 1,
        scaleY: 1,
        duration: MORPH_IN_MS,
        ease: 'Back.easeOut',
      })
    );

    this.startPersonalityMotion(stats);
  }

  exit(onComplete?: () => void): void {
    if (!this.active) {
      onComplete?.();
      return;
    }

    this.stopTweens();
    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        alpha: 0,
        scaleX: 0.7,
        scaleY: 0.7,
        duration: MORPH_OUT_MS,
        ease: 'Sine.easeIn',
        onComplete: () => {
          this.restoreNormalBall();
          onComplete?.();
        },
      })
    );
  }

  forceRestore(): void {
    this.stopTweens();
    if (this.active) {
      this.restoreNormalBall();
    }
  }

  destroy(): void {
    this.stopTweens();
    this.container.destroy();
  }

  private restoreNormalBall(): void {
    this.active = false;
    this.clearMorphExtras();
    this.container.setVisible(false);

    this.ball.setVisible(true);
    this.ball.setScale(1);
    this.ball.setAngle(0);
    this.ballGlow.setVisible(true);
    this.ballGlow.setScale(1);
    this.ballGlow.setFillStyle(this.colors.fill, 0.25);
  }

  private drawMorphShape(stats: BallStats): void {
    const g = this.mainGraphic;
    const { fill, stroke } = this.colors;
    const r = this.radius;

    switch (this.ballId) {
      case 'valentine':
        this.drawHeart(g, r, fill, stroke);
        break;
      case 'bolt':
        this.drawJaggedBolt(g, r, fill, stroke);
        break;
      case 'orb':
      default:
        this.drawOrbTheatrical(g, r, fill, stroke);
        break;
    }

    if (this.ballId === 'valentine' && stats.resentment > 70) {
      g.lineStyle(1, 0x330011, 0.55);
      g.beginPath();
      g.moveTo(-4, -2);
      g.lineTo(2, 4);
      g.moveTo(5, -5);
      g.lineTo(-2, 2);
      g.strokePath();
    }
  }

  private drawHeart(
    g: Phaser.GameObjects.Graphics,
    size: number,
    fill: number,
    stroke: number
  ): void {
    const s = size * 1.15;
    const top = -s * 0.35;

    g.fillStyle(fill, 0.95);
    g.lineStyle(2, stroke, 0.95);
    g.beginPath();
    g.arc(-s * 0.28, top, s * 0.32, 0, Math.PI, true);
    g.arc(s * 0.28, top, s * 0.32, 0, Math.PI, true);
    g.moveTo(-s * 0.52, top + 1);
    g.lineTo(0, s * 0.62);
    g.lineTo(s * 0.52, top + 1);
    g.closePath();
    g.fillPath();
    g.strokePath();
  }

  private drawJaggedBolt(
    g: Phaser.GameObjects.Graphics,
    size: number,
    fill: number,
    stroke: number
  ): void {
    const segments = 14;
    const points: Phaser.Math.Vector2[] = [];

    for (let i = 0; i < segments; i++) {
      const angle = (i / segments) * Math.PI * 2 - Math.PI / 2;
      const jitter = i % 2 === 0 ? size + 5 : size - 4;
      points.push(new Phaser.Math.Vector2(Math.cos(angle) * jitter, Math.sin(angle) * jitter * 0.82));
    }

    g.fillStyle(fill, 0.92);
    g.lineStyle(2, stroke, 0.85);
    g.beginPath();
    g.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      g.lineTo(points[i].x, points[i].y);
    }
    g.closePath();
    g.fillPath();
    g.strokePath();

    g.lineStyle(1, 0xaaffcc, 0.45);
    g.beginPath();
    g.moveTo(-size * 0.4, -size * 0.2);
    g.lineTo(size * 0.15, size * 0.35);
    g.strokePath();
  }

  private drawOrbTheatrical(
    g: Phaser.GameObjects.Graphics,
    size: number,
    fill: number,
    stroke: number
  ): void {
    g.lineStyle(2, stroke, 0.35);
    g.strokeCircle(0, 0, size + 16);
    g.lineStyle(1, 0xffffff, 0.25);
    g.strokeCircle(0, 0, size + 10);

    g.fillStyle(fill, 0.98);
    g.fillCircle(0, 0, size);
    g.lineStyle(2, stroke, 0.95);
    g.strokeCircle(0, 0, size);
    g.lineStyle(1, 0xffffff, 0.5);
    g.strokeCircle(0, 0, size - 3);

    const orbit = this.scene.add.container(0, 0);
    const shimmer = this.scene.add.circle(size + 12, 0, 3, stroke, 0.95);
    const shimmerGlow = this.scene.add.circle(size + 12, 0, 6, fill, 0.2);
    orbit.add([shimmerGlow, shimmer]);
    this.container.add(orbit);
    this.orbitContainer = orbit;
  }

  private startPersonalityMotion(stats: BallStats): void {
    switch (this.ballId) {
      case 'valentine':
        this.startValentineMotion(stats);
        break;
      case 'bolt':
        this.startBoltMotion();
        break;
      case 'orb':
      default:
        this.startOrbMotion();
        break;
    }
  }

  private startValentineMotion(stats: BallStats): void {
    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.14,
        scaleY: 1.14,
        duration: 170,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
        hold: 140,
      })
    );

    if (stats.resentment > 70) {
      this.addTween(
        this.scene.tweens.add({
          targets: this.container,
          angle: { from: -5, to: 5 },
          duration: 55,
          yoyo: true,
          repeat: -1,
          ease: 'Linear',
        })
      );
    }
  }

  private clearMorphExtras(): void {
    this.mainGraphic.clear();
    const children = [...this.container.list];
    for (const child of children) {
      if (child !== this.mainGraphic) {
        this.container.remove(child, true);
      }
    }
    this.orbitContainer = null;
  }

  private startOrbMotion(): void {
    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.08,
        scaleY: 1.08,
        duration: 900,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );

    if (this.orbitContainer) {
      this.addTween(
        this.scene.tweens.add({
          targets: this.orbitContainer,
          angle: 360,
          duration: 2400,
          repeat: -1,
          ease: 'Linear',
        })
      );
    }
  }

  private startBoltMotion(): void {
    this.container.setScale(1.08, 0.88);

    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        scaleX: 1.18,
        scaleY: 0.78,
        duration: 120,
        yoyo: true,
        repeat: -1,
        ease: 'Rough',
      })
    );

    this.addTween(
      this.scene.tweens.add({
        targets: this.mainGraphic,
        alpha: { from: 0.65, to: 1 },
        duration: 70,
        yoyo: true,
        repeat: -1,
      })
    );

    this.addTween(
      this.scene.tweens.add({
        targets: this.container,
        angle: { from: -8, to: 8 },
        duration: 90,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      })
    );
  }

  private addTween(tween: Phaser.Tweens.Tween): void {
    this.activeTweens.push(tween);
  }

  private stopTweens(): void {
    for (const tween of this.activeTweens) {
      tween.stop();
    }
    this.activeTweens = [];
  }
}
