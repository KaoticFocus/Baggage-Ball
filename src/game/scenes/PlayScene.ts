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
import { BallHoverMorph } from '../systems/BallHoverMorph';
import { getEmotionalResult } from '../systems/EmotionalResultSystem';
import { buildRecapData } from '../systems/RecapSystem';
import { RecapScene } from './RecapScene';
import { classifyPlayerResponse, LocalAiError } from '../services/LocalAiClient';
import type { HoverDecision } from '../types/DialogueTypes';
import type { DialogueResponse } from '../types/DialogueTypes';
import type { BehaviorModifier } from '../types/BallTypes';
import { uiManager } from '../../ui/UIManager';
import type { ScreenBounds } from '../../ui/dialogueBubbleLayout';

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
  private hoverMorph!: BallHoverMorph;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private gameState: GameState = 'playing';
  private currentEvent: import('../types/DialogueTypes').DialogueEvent | null = null;
  private nearMissTriggered = false;
  private lastLongRallyMilestone = 0;
  private gentleNextHit = false;
  private betrayalActive = false;
  private wallBounceCooldown = 0;
  private recentEvents: string[] = [];
  private playerModeHistory: string[] = ['voice'];
  private storedVelocity = { x: 0, y: 0 };
  private currentHoverType = '';
  private playfieldBottom = 0;
  private failsafeCheckTimer = 0;
  private isPaused = false;

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

    const borderInset = 20;
    const borderTop = 20;
    const borderWidth = width - 40;
    const playfieldHeight = height - 80;
    const borderBottom = borderTop + playfieldHeight;
    this.playfieldBottom = borderBottom;

    const border = this.add.graphics();
    border.lineStyle(2, 0x2a2a4a, 0.8);
    border.beginPath();
    border.moveTo(borderInset, borderTop);
    border.lineTo(borderInset + borderWidth, borderTop);
    border.moveTo(borderInset, borderTop);
    border.lineTo(borderInset, borderBottom);
    border.moveTo(borderInset + borderWidth, borderTop);
    border.lineTo(borderInset + borderWidth, borderBottom);
    border.strokePath();

    const dangerGlow = this.add.rectangle(
      width / 2,
      borderBottom + 28,
      borderWidth - 8,
      52,
      0xff2233,
      0.07
    );
    dangerGlow.setDepth(2);

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
          const stats = this.personality.getStats();
          const nearMissHover = this.emotionDirector.onWallBounce(stats, this.ballId);
          if (nearMissHover) {
            this.triggerHover(nearMissHover);
          }
        }
      }
    );
    this.ballBody.setBounce(1, 1);
    this.ballBody.setMaxVelocity(550, 550);

    this.hoverMorph = new BallHoverMorph(
      this,
      this.ball,
      this.ballGlow,
      this.ballId,
      colors,
      this.BALL_RADIUS
    );

    this.physics.world.setBounds(20, 20, width - 40, playfieldHeight + 160);

    launchBall(this.ballBody, this.personality.getSpeedMultiplier());

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.setupKeyboard();

    uiManager.showPlaying(this.personality.getPersonality().name);
    uiManager.setCallbacks({
      onResponseSelected: (index) => this.selectResponse(index),
      onCustomResponseSubmitted: (text) => this.submitCustomResponse(text),
    });
    uiManager.setGameControlCallbacks({
      onPauseToggle: () => this.togglePause(),
      onQuit: () => this.quitToMenu(),
    });
    this.updateUI();

    this.physics.add.collider(this.ball, this.paddle, this.onPaddleHit, undefined, this);
  }

  private resetRoundState(): void {
    this.gameState = 'playing';
    this.currentEvent = null;
    this.nearMissTriggered = false;
    this.lastLongRallyMilestone = 0;
    this.gentleNextHit = false;
    this.betrayalActive = false;
    this.wallBounceCooldown = 0;
    this.failsafeCheckTimer = 0;
    this.isPaused = false;
    this.recentEvents = [];
    this.playerModeHistory = ['voice'];
    this.currentHoverType = '';
  }

  private setupKeyboard(): void {
    const kb = this.input.keyboard!;
    kb.on('keydown-T', () => this.toggleInputMode());
    kb.on('keydown-H', () => this.debugForceHover('random'));
    kb.on('keydown-M', () => this.debugForceHover('mode'));
    kb.on('keydown-R', () => {
      this.personality.updateStats({ resentment: 15 });
      console.log('[Debug] +Resentment', this.personality.getStats());
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Resentment');
    });
    kb.on('keydown-C', () => {
      this.personality.updateStats({ chaos: 15 });
      console.log('[Debug] +Chaos', this.personality.getStats());
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Chaos');
    });
    kb.on('keydown-D', () => {
      this.personality.updateStats({ dramaNeed: 15 });
      console.log('[Debug] +DramaNeed', this.personality.getStats());
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+DramaNeed');
    });
    kb.on('keydown-A', () => {
      this.personality.updateStats({ attachment: 15 });
      console.log('[Debug] +Attachment', this.personality.getStats());
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Attachment');
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

    if (this.isPaused) {
      if (this.gameState === 'playing') {
        this.ballBody.setVelocity(0, 0);
      }
      return;
    }

    this.ballGlow.setPosition(this.ball.x, this.ball.y);

    this.behaviorMod.tick();

    if (this.gameState === 'hover') {
      this.ballBody.setVelocity(0, 0);
      this.ballGlow.setPosition(this.ball.x, this.ball.y);
      this.hoverMorph.syncPosition(this.ball.x, this.ball.y);
      uiManager.setCanvasBounds(this.getCanvasScreenBounds());
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
      Math.abs(this.ball.x - this.paddle.x) > this.PADDLE_WIDTH * 0.45
    ) {
      this.nearMissTriggered = true;
      this.scoring.addEvent('nearMiss');
      this.emotionDirector.onNearMissDetected();
      this.updateUI();
    }

    if (this.ball.y > this.playfieldBottom + 30) {
      this.endRound();
      return;
    }

    this.failsafeCheckTimer += delta;
    if (this.failsafeCheckTimer >= 5000) {
      this.failsafeCheckTimer = 0;
      const failsafeDecision = this.emotionDirector.evaluateFailsafe(stats, this.ballId);
      if (failsafeDecision) {
        this.triggerHover(failsafeDecision);
        return;
      }
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
    if (this.gameState !== 'playing' || this.isPaused) return;

    this.nearMissTriggered = false;
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

    if (this.emotionDirector.isLongRallyMilestone(this.scoring.currentRallyHits)) {
      if (this.scoring.currentRallyHits > this.lastLongRallyMilestone) {
        this.lastLongRallyMilestone = this.scoring.currentRallyHits;
        const milestoneDecision = this.emotionDirector.onLongRallyMilestone(
          stats,
          this.ballId,
          this.scoring.currentRallyHits
        );
        if (milestoneDecision) {
          this.triggerHover(milestoneDecision);
          return;
        }
      }
    }

    const hoverDecision = this.emotionDirector.onPaddleHit(stats, this.ballId);
    if (hoverDecision) {
      this.triggerHover(hoverDecision);
    }
  }

  private toggleInputMode(): void {
    const { switchedToText, isFirstTextSwitch } = this.inputMode.toggle();
    const mode = this.inputMode.getMode();
    this.playerModeHistory.push(mode);
    this.updateUI();

    if (switchedToText && isFirstTextSwitch && this.gameState === 'playing') {
      const stats = this.personality.getStats();
      const decision = this.emotionDirector.forceModeSwitch(stats, this.ballId);
      this.triggerHover(decision, true);
    }
  }

  private debugForceHover(type: 'random' | 'mode'): void {
    if (this.gameState !== 'playing') return;
    const stats = this.personality.getStats();
    if (type === 'mode') {
      const decision = this.emotionDirector.forceModeSwitch(stats, this.ballId);
      this.triggerHover(decision, true);
      return;
    }
    const decision = this.emotionDirector.forceRandom(stats, this.ballId);
    this.triggerHover(decision);
  }

  private triggerHover(decision: HoverDecision, forceModeSwitch = false): void {
    if (this.gameState === 'hover') return;

    const situation = decision.situation;
    this.currentHoverType = this.emotionDirector.formatHoverType(decision.hoverType);
    console.log(`[Hover] ${decision.reason} → ${this.currentHoverType}`);

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
    this.emotionDirector.notifyHoverStarted();

    this.storedVelocity.x = this.ballBody.velocity.x;
    this.storedVelocity.y = this.ballBody.velocity.y;
    this.ballBody.setVelocity(0, 0);

    this.time.timeScale = 0.35;
    this.tweens.add({
      targets: this.hoverDim,
      alpha: 0.55,
      duration: 200,
    });

    this.hoverMorph.enter(this.personality.getStats());

    this.dialogue.speakBallLine(event.ballLine, this.inputMode.getMode());
    this.recentEvents.push(`${event.situation}: ${event.ballLine.slice(0, 60)}`);
    if (this.recentEvents.length > 8) this.recentEvents.shift();

    const bounds = this.getCanvasScreenBounds();
    const screen = this.ballToScreen(this.ball.x, this.ball.y);

    uiManager.showDialogue(
      event,
      this.inputMode.getMode(),
      screen.x,
      screen.y,
      true,
      this.currentHoverType,
      this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId),
      bounds
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

    const ballName = this.personality.getPersonality().name;
    const emotionalResult =
      response.emotionalResult ??
      getEmotionalResult(this.ballId, ballName, response.statChanges, response.tone);

    this.recentEvents.push(`player: ${(playerEcho ?? response.text).slice(0, 50)}`);
    uiManager.showReaction(response.ballReaction, emotionalResult, playerEcho);
    uiManager.updateStats(this.personality.getStats());
    uiManager.updateBallMeta(
      this.currentHoverType,
      this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
    );

    this.time.delayedCall(1500, () => {
      this.resumeFromHover();
    });
  }

  private resumeFromHover(): void {
    this.gameState = 'playing';
    this.currentEvent = null;
    this.currentHoverType = '';
    this.emotionDirector.markHoverResolved();

    this.time.timeScale = 1;
    this.tweens.add({ targets: this.hoverDim, alpha: 0, duration: 250 });

    uiManager.hideDialogue();
    uiManager.updateBallMeta('', this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId));

    const stats = this.personality.getStats();
    const speedMult = this.personality.getSpeedMultiplier();
    const speed = Math.abs(this.storedVelocity.x) + Math.abs(this.storedVelocity.y);

    const resumeBallMotion = (): void => {
      if (speed > 30) {
        this.ballBody.setVelocity(this.storedVelocity.x, this.storedVelocity.y);
      } else if (stats.attachment > 80) {
        launchBall(this.ballBody, speedMult, this.paddle.x);
      } else {
        launchBall(this.ballBody, speedMult);
      }
    };

    this.hoverMorph.exit(resumeBallMotion);
  }

  private updateBubblePosition(): void {
    const screen = this.ballToScreen(this.ball.x, this.ball.y);
    uiManager.updateBubblePosition(screen.x, screen.y, this.getCanvasScreenBounds());
  }

  private getCanvasScreenBounds(): ScreenBounds {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
    };
  }

  private ballToScreen(x: number, y: number): { x: number; y: number } {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    return {
      x: rect.left + (x / this.scale.width) * rect.width,
      y: rect.top + (y / this.scale.height) * rect.height,
    };
  }

  private updateUI(): void {
    uiManager.updateHUD(
      this.scoring.score,
      this.scoring.combo,
      this.scoring.rallyCount,
      this.inputMode.getMode()
    );
    uiManager.updateStats(this.personality.getStats());
    uiManager.updateBallMeta(
      this.currentHoverType,
      this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
    );
  }

  private endRound(): void {
    if (this.gameState === 'ended') return;

    if (this.isPaused) {
      this.resumeGame();
    }

    this.gameState = 'ended';
    this.ballBody.setVelocity(0, 0);
    this.ballBody.setCollideWorldBounds(false);
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

  private togglePause(): void {
    if (this.gameState === 'ended') return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (this.isPaused || this.gameState === 'ended') return;

    this.isPaused = true;

    if (this.gameState === 'playing') {
      this.storedVelocity.x = this.ballBody.velocity.x;
      this.storedVelocity.y = this.ballBody.velocity.y;
    }

    this.ballBody.setVelocity(0, 0);
    this.physics.pause();
    this.time.paused = true;
    this.emotionDirector.pauseTimers();
    uiManager.setPaused(true);
  }

  private resumeGame(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.physics.resume();
    this.time.paused = false;
    this.emotionDirector.resumeTimers();
    uiManager.setPaused(false);

    if (this.gameState === 'playing') {
      const speed = Math.abs(this.storedVelocity.x) + Math.abs(this.storedVelocity.y);
      if (speed > 10) {
        this.ballBody.setVelocity(this.storedVelocity.x, this.storedVelocity.y);
      }
    }
  }

  private quitToMenu(): void {
    if (this.isPaused) {
      this.time.paused = false;
      this.physics.resume();
      this.emotionDirector.resumeTimers();
      this.isPaused = false;
    }

    this.time.timeScale = 1;
    this.hoverMorph.forceRestore();
    uiManager.hideDialogue();
    uiManager.hideOutburst();
    uiManager.resetGameControls();
    this.scene.start('MenuScene');
  }
}
