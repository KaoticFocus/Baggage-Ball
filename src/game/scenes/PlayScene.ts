import Phaser from 'phaser';
import { BallPersonalitySystem } from '../systems/BallPersonalitySystem';
import { BallEmotionDirector } from '../systems/BallEmotionDirector';
import { DialogueSystem } from '../systems/DialogueSystem';
import { InputModeSystem } from '../systems/InputModeSystem';
import { ScoringSystem } from '../systems/ScoringSystem';
import {
  BehaviorModifierSystem,
  applyBehaviorToVelocity,
  launchBall,
  reflectPaddle,
} from '../systems/BehaviorModifierSystem';
import { getEmotionalResult } from '../systems/EmotionalResultSystem';
import { buildRecapData } from '../systems/RecapSystem';
import { RecapScene } from './RecapScene';
import { classifyPlayerResponse, LocalAiError } from '../services/LocalAiClient';
import type { DialogueSituation } from '../types/DialogueTypes';
import type { DialogueResponse } from '../types/DialogueTypes';
import type { BehaviorModifier } from '../types/BallTypes';
import { uiManager } from '../../ui/UIManager';

type GameState = 'playing' | 'hover' | 'ended';

export class PlayScene extends Phaser.Scene {
  private ballId = 'orb';
  private personality!: BallPersonalitySystem;
  private emotionDirector!: BallEmotionDirector;
  private dialogue!: DialogueSystem;
  private inputMode!: InputModeSystem;
  private scoring!: ScoringSystem;
  private behaviorMod!: BehaviorModifierSystem;

  private paddle!: Phaser.GameObjects.Rectangle;
  private ball!: Phaser.GameObjects.Arc;
  private ballBody!: Phaser.Physics.Arcade.Body;
  private paddleBody!: Phaser.Physics.Arcade.Body;
  private hoverDim!: Phaser.GameObjects.Rectangle;
  private ballGlow!: Phaser.GameObjects.Arc;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private gameState: GameState = 'playing';
  private currentEvent: import('../types/DialogueTypes').DialogueEvent | null = null;
  private nearMissTriggered = false;
  private longRallyTriggered = false;
  private gentleNextHit = false;
  private betrayalActive = false;
  private wallBounceCooldown = 0;
  private hoverPulseTween: Phaser.Tweens.Tween | null = null;
  private hoverShakeTween: Phaser.Tweens.Tween | null = null;
  private periodicCheckTimer = 0;
  private recentEvents: string[] = [];
  private playerModeHistory: string[] = ['voice'];
  private dramaticPausePending = false;

  private readonly PADDLE_WIDTH = 120;
  private readonly PADDLE_HEIGHT = 16;
  private readonly BALL_RADIUS = 12;
  private readonly PADDLE_Y_OFFSET = 40;

  constructor() {
    super({ key: 'PlayScene' });
  }

  init(data: { ballId: string }): void {
    this.ballId = data.ballId ?? 'orb';
  }

  create(): void {
    const { width, height } = this.scale;

    this.personality = new BallPersonalitySystem(this.ballId);
    this.emotionDirector = new BallEmotionDirector();
    this.emotionDirector.onPlayStart();
    this.dialogue = new DialogueSystem();
    this.inputMode = new InputModeSystem();
    this.scoring = new ScoringSystem();
    this.behaviorMod = new BehaviorModifierSystem();
    this.resetRoundState();

    const ballColors: Record<string, { fill: number; stroke: number }> = {
      orb: { fill: 0xaa66ff, stroke: 0xdd99ff },
      bolt: { fill: 0x44aa66, stroke: 0x88ddaa },
      valentine: { fill: 0xff4466, stroke: 0xff88aa },
    };
    const colors = ballColors[this.ballId] ?? ballColors.orb;

    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a12);

    this.hoverDim = this.add.rectangle(width / 2, height / 2, width, height, 0x000008, 0);
    this.hoverDim.setDepth(5);

    const border = this.add.graphics();
    border.lineStyle(2, 0x2a2a4a, 0.8);
    border.strokeRect(20, 20, width - 40, height - 80);

    this.paddle = this.add.rectangle(
      width / 2,
      height - this.PADDLE_Y_OFFSET,
      this.PADDLE_WIDTH,
      this.PADDLE_HEIGHT,
      0x00e5ff
    );
    this.paddle.setStrokeStyle(2, 0x88ffff, 0.9);
    this.physics.add.existing(this.paddle);
    this.paddleBody = this.paddle.body as Phaser.Physics.Arcade.Body;
    this.paddleBody.setImmovable(true);
    this.paddleBody.setAllowGravity(false);

    this.ballGlow = this.add.circle(width / 2, height / 3, this.BALL_RADIUS + 8, colors.fill, 0.25);
    this.ballGlow.setDepth(6);

    this.ball = this.add.circle(width / 2, height / 3, this.BALL_RADIUS, colors.fill);
    this.ball.setStrokeStyle(3, colors.stroke, 0.9);
    this.ball.setDepth(7);
    this.physics.add.existing(this.ball);
    this.ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    this.ballBody.setCircle(this.BALL_RADIUS);
    this.ballBody.setCollideWorldBounds(true);
    this.ballBody.onWorldBounds = true;
    this.physics.world.on(
      'worldbounds',
      (body: Phaser.Physics.Arcade.Body) => {
        if (body.gameObject === this.ball && this.gameState === 'playing') {
          if (this.wallBounceCooldown <= 0) {
            this.scoring.addEvent('wallBounce');
            this.wallBounceCooldown = 200;
            this.updateUI();
          }
        }
      }
    );
    this.ballBody.setBounce(1, 1);
    this.ballBody.setMaxVelocity(550, 550);
    this.physics.world.setBounds(20, 20, width - 40, height - 80);

    launchBall(this.ballBody, this.personality.getSpeedMultiplier());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.setupKeyboard();

    uiManager.showPlaying(this.personality.getPersonality().name);
    uiManager.setCallbacks({
      onResponseSelected: (index) => this.selectResponse(index),
      onCustomResponseSubmitted: (text) => this.submitCustomResponse(text),
    });
    this.updateUI();

    this.physics.add.collider(this.ball, this.paddle, this.onPaddleHit, undefined, this);
  }

  private resetRoundState(): void {
    this.gameState = 'playing';
    this.currentEvent = null;
    this.nearMissTriggered = false;
    this.longRallyTriggered = false;
    this.gentleNextHit = false;
    this.betrayalActive = false;
    this.wallBounceCooldown = 0;
    this.periodicCheckTimer = 0;
    this.recentEvents = [];
    this.playerModeHistory = ['voice'];
    this.dramaticPausePending = false;
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-T', () => this.toggleInputMode());
    kb.on('keydown-H', () => this.debugForceHover('random'));
    kb.on('keydown-V', () => this.debugForceHover('clingy'));
    kb.on('keydown-M', () => this.debugForceHover('mode'));
    kb.on('keydown-R', () => {
      this.personality.updateStats({ resentment: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.showDebugToast('+Resentment');
    });
    kb.on('keydown-C', () => {
      this.personality.updateStats({ chaos: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.showDebugToast('+Chaos');
    });
    kb.on('keydown-SPACE', () => {
      if (this.gameState === 'hover') this.selectResponse(0);
    });
    for (let i = 1; i <= 4; i++) {
      kb.on(`keydown-${i}`, () => {
        if (this.gameState === 'hover') this.selectResponse(i - 1);
      });
    }
  }

  update(_time: number, delta: number): void {
    if (this.gameState === 'ended') return;

    this.ballGlow.setPosition(this.ball.x, this.ball.y);

    this.behaviorMod.tick();

    if (this.gameState === 'hover') {
      this.ballBody.setVelocity(0, 0);
      this.ballGlow.setPosition(this.ball.x, this.ball.y);
      this.updateBubblePosition();
      return;
    }

    this.movePaddle(delta);

    if (this.wallBounceCooldown > 0) {
      this.wallBounceCooldown -= delta;
    }

    const stats = this.personality.getStats();
    applyBehaviorToVelocity(
      this.ballBody,
      this.behaviorMod.activeModifier,
      this.paddle.x,
      this.paddle.y,
      this.personality.getChaosMultiplier(),
      stats
    );

    if (this.ball.y < this.paddle.y - 80) {
      this.nearMissTriggered = false;
    }

    if (
      !this.nearMissTriggered &&
      this.ball.y > this.paddle.y - 60 &&
      this.ball.y < this.paddle.y &&
      Math.abs(this.ball.x - this.paddle.x) > this.PADDLE_WIDTH * 0.6
    ) {
      this.nearMissTriggered = true;
      this.scoring.addEvent('nearMiss');
      this.updateUI();
      const decision = this.emotionDirector.onNearMiss(stats);
      this.triggerHover(decision.situation, false);
    }

    if (this.ball.y > this.scale.height) {
      this.endRound();
      return;
    }

    // Periodic emotion director checks (every ~500ms)
    this.periodicCheckTimer += delta;
    if (this.periodicCheckTimer >= 500) {
      this.periodicCheckTimer = 0;
      const ctx = this.emotionDirector.getContext(
        this.scoring.paddleHits,
        this.scoring.currentRallyHits
      );
      ctx.ballId = this.ballId;
      ctx.stats = stats;
      const decision = this.emotionDirector.evaluatePeriodic(ctx);
      if (decision) {
        this.triggerHover(decision.situation, false);
      }
    }

    if (
      !this.longRallyTriggered &&
      this.scoring.currentRallyHits >= 12 &&
      this.gameState === 'playing'
    ) {
      this.longRallyTriggered = true;
      const decision = this.emotionDirector.onLongRally(stats);
      this.triggerHover(decision.situation, false);
    }

    if (this.behaviorMod.outburstLabel) {
      uiManager.showOutburst(this.behaviorMod.outburstLabel);
    } else {
      uiManager.hideOutburst();
    }

    this.updateUI();
  }

  private movePaddle(delta: number): void {
    const { width } = this.scale;
    const speed = 600;
    let targetX = this.paddle.x;

    if (this.input.activePointer.isDown) {
      targetX = this.input.activePointer.x;
    } else if (this.cursors.left.isDown) {
      targetX -= (speed * delta) / 1000;
    } else if (this.cursors.right.isDown) {
      targetX += (speed * delta) / 1000;
    }

    const minX = 20 + this.PADDLE_WIDTH / 2;
    const maxX = width - 20 - this.PADDLE_WIDTH / 2;
    this.paddle.x = Phaser.Math.Clamp(targetX, minX, maxX);
    this.paddleBody.reset(this.paddle.x, this.paddle.y);
  }

  private onPaddleHit(): void {
    if (this.gameState !== 'playing') return;

    this.nearMissTriggered = false;
    const centerHit = Math.abs(this.ball.x - this.paddle.x) < this.PADDLE_WIDTH * 0.22;
    const gentle = this.gentleNextHit || this.behaviorMod.activeModifier === 'gentleReturn';
    this.gentleNextHit = false;

    reflectPaddle(
      this.ballBody,
      this.paddle.x,
      this.PADDLE_WIDTH,
      gentle,
      this.personality.getStats()
    );

    const stats = this.personality.getStats();

    if (Math.random() < this.personality.getHelpfulChance()) {
      this.behaviorMod.setModifier('helpfulCurve', 'Helpful curve!');
      this.scoring.addEvent('helpfulBehavior');
    } else if (Math.random() < this.personality.getBetrayalChance()) {
      this.betrayalActive = true;
      const hostile: Array<'hostileFakeOut' | 'resentmentShot' | 'erraticBounce' | 'speedSpike'> = [
        'hostileFakeOut',
        'resentmentShot',
        'erraticBounce',
        'speedSpike',
      ];
      const pick = hostile[Math.floor(Math.random() * hostile.length)];
      this.behaviorMod.setModifier(pick);
    }

    if (stats.attachment > 85 && Math.random() < 0.15) {
      this.behaviorMod.setModifier('clingyDrift', 'Clingy drift.');
    }

    if (stats.chaos > 75 && Math.random() < 0.12) {
      this.behaviorMod.setModifier('chaosWobble', 'Chaos wobble!');
      this.scoring.addEvent('chaosBonus');
    }

    if (this.betrayalActive && this.scoring.combo > 2) {
      this.scoring.addEvent('betrayalSurvived');
      this.betrayalActive = false;
    }

    this.scoring.addEvent('paddleHit');
    this.updateUI();

    const hoverDecision = this.emotionDirector.onPaddleHit(centerHit, stats, this.ballId);
    if (hoverDecision) {
      this.triggerHover(hoverDecision.situation, false);
    }
  }

  private toggleInputMode(): void {
    const { isFirstTextSwitch } = this.inputMode.toggle();
    const mode = this.inputMode.getMode();
    this.playerModeHistory.push(mode);
    this.updateUI();

    if (isFirstTextSwitch && this.gameState === 'playing') {
      const decision = this.emotionDirector.onModeSwitch();
      this.triggerHover(decision.situation, true);
    }
  }

  private debugForceHover(type: 'random' | 'clingy' | 'mode'): void {
    if (this.gameState !== 'playing') return;
    const stats = this.personality.getStats();
    let decision;
    if (type === 'clingy') {
      decision = this.emotionDirector.forceClingy();
    } else if (type === 'mode') {
      decision = this.emotionDirector.forceModeSwitch();
    } else {
      decision = this.emotionDirector.forceRandom(stats, this.ballId);
    }
    this.triggerHover(decision.situation, type === 'mode');
  }

  private triggerHover(situation: DialogueSituation, forceModeSwitch: boolean): void {
    if (this.gameState === 'hover') return;

    let event = forceModeSwitch
      ? this.dialogue.getModeSwitchEvent(this.ballId)
      : null;
    if (!event) {
      event = this.dialogue.pickEvent(
        this.ballId,
        situation,
        this.personality.getStats()
      );
    }
    if (!event) return;

    this.enterHover(event);
  }

  private enterHover(event: NonNullable<typeof this.currentEvent>): void {
    this.gameState = 'hover';
    this.currentEvent = event;
    this.ballBody.setVelocity(0, 0);

    this.time.timeScale = 0.35;
    this.tweens.add({
      targets: this.hoverDim,
      alpha: 0.45,
      duration: 200,
    });

    this.hoverPulseTween = this.tweens.add({
      targets: [this.ball, this.ballGlow],
      scaleX: 1.2,
      scaleY: 1.2,
      yoyo: true,
      repeat: -1,
      duration: 450,
      ease: 'Sine.easeInOut',
    });

    this.hoverShakeTween = this.tweens.add({
      targets: this.ball,
      x: this.ball.x + 3,
      yoyo: true,
      repeat: -1,
      duration: 80,
      ease: 'Linear',
    });

    this.dialogue.speakBallLine(event.ballLine, this.inputMode.getMode());
    this.recentEvents.push(`${event.situation}: ${event.ballLine.slice(0, 60)}`);
    if (this.recentEvents.length > 8) this.recentEvents.shift();

    uiManager.showDialogue(
      event,
      this.inputMode.getMode(),
      this.ball.x,
      this.ball.y,
      true
    );
  }

  private selectResponse(index: number): void {
    if (this.gameState !== 'hover' || !this.currentEvent) return;
    const response = this.currentEvent.responses[index];
    if (!response) return;
    this.applyResponse(response, response.text);
  }

  private async submitCustomResponse(text: string): Promise<void> {
    if (this.gameState !== 'hover' || !this.currentEvent) return;

    const personality = this.personality.getPersonality();
    const stats = this.personality.getStats();

    try {
      const ai = await classifyPlayerResponse({
        ballName: personality.name,
        ballPersonality: `${personality.title}. ${personality.dialogueStyle}`,
        ballStats: stats,
        ballLine: this.currentEvent.ballLine,
        playerResponse: text,
        situation: this.currentEvent.situation,
      });

      this.applyAiResult(
        {
          text,
          tone: ai.tone as DialogueResponse['tone'],
          statChanges: ai.statChanges,
          ballReaction: ai.ballReaction,
          emotionalResult: ai.emotionalResult,
          behaviorModifier: this.normalizeModifier(ai.behaviorModifier),
        },
        text
      );
    } catch (err) {
      const msg =
        err instanceof LocalAiError
          ? err.message
          : 'Local AI unavailable';
      uiManager.showDebugToast('AI offline — using fallback');

      this.applyAiResult(
        {
          text,
          tone: 'boundary',
          statChanges: { patience: -3, resentment: 2, trust: -2 },
          ballReaction:
            'The ball squints at your response, but the local AI server is apparently having a small breakdown.',
          emotionalResult: 'The ball will remember that. Probably.',
        },
        text
      );
      console.warn('[Custom response fallback]', msg);
    }
  }

  private normalizeModifier(mod?: string): BehaviorModifier | undefined {
    if (!mod || mod === 'none') return undefined;
    return mod as BehaviorModifier;
  }

  private applyAiResult(response: DialogueResponse, playerEcho: string): void {
    this.applyResponse(response, playerEcho);
  }

  private applyResponse(response: DialogueResponse, playerEcho?: string): void {
    if (!this.currentEvent) return;

    this.personality.updateStats(response.statChanges);
    this.behaviorMod.setModifier(response.behaviorModifier);

    if (response.behaviorModifier === 'gentleReturn') {
      this.gentleNextHit = true;
    }
    if (response.behaviorModifier === 'dramaticPause') {
      this.dramaticPausePending = true;
    }

    const ballName = this.personality.getPersonality().name;
    const emotionalResult =
      response.emotionalResult ??
      getEmotionalResult(this.ballId, ballName, response.statChanges, response.tone);

    this.recentEvents.push(`player: ${(playerEcho ?? response.text).slice(0, 50)}`);
    uiManager.showReaction(response.ballReaction, emotionalResult, playerEcho);
    uiManager.updateStats(this.personality.getStats());

    this.time.delayedCall(2200, () => {
      this.resumeFromHover();
    });
  }

  private resumeFromHover(): void {
    this.gameState = 'playing';
    this.currentEvent = null;
    this.emotionDirector.markHoverResolved();

    this.time.timeScale = 1;
    this.tweens.add({ targets: this.hoverDim, alpha: 0, duration: 250 });
    this.hoverPulseTween?.stop();
    this.hoverShakeTween?.stop();
    this.ball.setScale(1);
    this.ballGlow.setScale(1);

    uiManager.hideDialogue();

    if (this.dramaticPausePending) {
      this.dramaticPausePending = false;
      this.time.delayedCall(4000, () => {
        if (this.gameState === 'playing') {
          const stats = this.personality.getStats();
          const decision = this.emotionDirector.forceRandom(stats, this.ballId);
          this.triggerHover(decision.situation, false);
        }
      });
    }

    const stats = this.personality.getStats();
    const speedMult = this.personality.getSpeedMultiplier();
    if (stats.attachment > 80) {
      launchBall(this.ballBody, speedMult, this.paddle.x);
    } else {
      launchBall(this.ballBody, speedMult);
    }
  }

  private updateBubblePosition(): void {
    uiManager.updateBubblePosition(this.ball.x, this.ball.y);
  }

  private updateUI(): void {
    uiManager.updateHUD(
      this.scoring.score,
      this.scoring.combo,
      this.scoring.rallyCount,
      this.inputMode.getMode()
    );
    uiManager.updateStats(this.personality.getStats());
  }

  private endRound(): void {
    this.gameState = 'ended';
    this.scoring.resetCombo();
    this.time.timeScale = 1;

    const personality = this.personality.getPersonality();
    const baseRecap = buildRecapData(
      this.ballId,
      `${personality.name} — ${personality.title}`,
      this.scoring.score,
      this.scoring.longestRally,
      this.personality.getStats(),
      this.scoring.paddleHits,
      this.scoring.wallBounces
    );

    void RecapScene.buildRecapWithAi(baseRecap, {
      ballName: personality.name,
      ballPersonality: `${personality.title}. ${personality.dialogueStyle}`,
      finalStats: this.personality.getStats(),
      score: this.scoring.score,
      longestRally: this.scoring.longestRally,
      recentEvents: this.recentEvents,
      playerModeHistory: this.playerModeHistory,
    }).then((recap) => {
      this.scene.start('RecapScene', recap);
    });
  }
}
