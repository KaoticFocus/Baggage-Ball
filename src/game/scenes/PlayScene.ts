import Phaser from 'phaser';
import { BallPersonalitySystem } from '../systems/BallPersonalitySystem';
import { BallEmotionDirector } from '../systems/BallEmotionDirector';
import { DialogueSystem } from '../systems/DialogueSystem';
import { InputModeSystem } from '../systems/InputModeSystem';
import { ScoringSystem } from '../systems/ScoringSystem';
import {
  BehaviorModifierSystem,
  applyBehaviorToVelocity,
  accelerateBallAfterHit,
  BALL_SPEED,
  launchBall,
  reflectVerticalPaddle,
} from '../systems/BehaviorModifierSystem';
import { BallHoverMorph } from '../systems/BallHoverMorph';
import { OpponentPaddleAI } from '../systems/OpponentPaddleAI';
import {
  OpponentBarkSystem,
  opponentPaddleToScreen,
  type BarkResult,
} from '../systems/OpponentBarkSystem';
import { getEmotionalResult } from '../systems/EmotionalResultSystem';
import { MatchSystem } from '../systems/MatchSystem';
import { buildMatchRecap, getOpponentShortName } from '../systems/MatchRecapSystem';
import { getBallOpeningLineCue, getBallPointReactionCue, type BallLineCue } from '../data/ballOpeningLines';
import { classifyPlayerResponse } from '../services/classifyResponseClient';
import {
  canRequestValentineVoice,
  playValentineAudio,
  requestValentineVoice,
  revokeValentineAudioUrl,
  stopValentineAudio,
  type ValentineVoiceEventType,
  type ValentineVoiceGameState,
} from '../services/valentineVoiceClient';
import { soundManager } from '../services/SoundManager';
import { characterAudio } from '../audio/CharacterAudioManager';
import { mapGameEventToAudioCategory } from '../audio/characterAudioEvents';
import type { CharacterAudioResult } from '../audio/characterAudioTypes';
import type { HoverDecision } from '../types/DialogueTypes';
import type { DialogueEvent } from '../types/DialogueTypes';
import type { DialogueResponse } from '../types/DialogueTypes';
import type { BehaviorModifier } from '../types/BallTypes';
import {
  getOpponentPaddleSide,
  getPlayerPaddleSide,
  getSelectedOpponentId,
  type OpponentId,
  type PaddleSide,
} from '../settings/PlayerSettings';
import type { OpponentBarkSituation } from '../types/OpponentTypes';
import { uiManager } from '../../ui/UIManager';
import {
  computePlayfield,
  GAME_LAYOUT,
  getPlayfieldCenterX,
  getSidePaddleX as layoutPaddleX,
  type PlayfieldRect,
} from '../layout/GameLayout';
import type { ScreenBounds } from '../../ui/dialogueBubbleLayout';
import { isTypingInFormField } from '../../ui/formInput';

type GameState = 'intro' | 'countdown' | 'playing' | 'hover' | 'pointBreak' | 'matchEnd';

export class PlayScene extends Phaser.Scene {
  private ballId = 'orb';
  private playerSide: PaddleSide = 'right';
  private opponentId: OpponentId = 'midlifeDave';
  private personality!: BallPersonalitySystem;
  private emotionDirector!: BallEmotionDirector;
  private dialogue!: DialogueSystem;
  private inputMode!: InputModeSystem;
  private scoring!: ScoringSystem;
  private behaviorMod!: BehaviorModifierSystem;
  private opponentAi!: OpponentPaddleAI;
  private opponentBarkSystem!: OpponentBarkSystem;
  private matchSystem = new MatchSystem();

  private playerPaddle!: Phaser.GameObjects.Rectangle;
  private opponentPaddle!: Phaser.GameObjects.Rectangle;
  private ball!: Phaser.GameObjects.Arc;
  private ballBody!: Phaser.Physics.Arcade.Body;
  private playerPaddleBody!: Phaser.Physics.Arcade.Body;
  private opponentPaddleBody!: Phaser.Physics.Arcade.Body;
  private hoverDim!: Phaser.GameObjects.Rectangle;
  private ballGlow!: Phaser.GameObjects.Arc;
  private hoverMorph!: BallHoverMorph;

  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private gameState: GameState = 'intro';
  private currentEvent: DialogueEvent | null = null;
  private nearMissTriggered = false;
  private lastLongRallyMilestone = 0;
  private gentleNextHit = false;
  private betrayalActive = false;
  private wallBounceCooldown = 0;
  private recentEvents: string[] = [];
  private playerModeHistory: string[] = ['voice'];
  private storedVelocity = { x: 0, y: 0 };
  private currentHoverType = '';
  private playfield!: PlayfieldRect;
  private playfieldTop = 20;
  private playfieldBottom = 0;
  private playfieldLeft = 20;
  private playfieldRight = 0;
  private paddleMinY = 0;
  private paddleMaxY = 0;
  private failsafeCheckTimer = 0;
  private isPaused = false;
  private serveLock = false;
  private pausedTimeScale = 1;
  private lastMouseClientY: number | null = null;
  private mouseOnGameViewport = false;
  private mousePaddleDebugTimer = 0;
  private characterAudioReady: Promise<void> = Promise.resolve();
  private readonly DEBUG_MOUSE_PADDLE = true;

  private readonly PADDLE_THICKNESS = GAME_LAYOUT.PADDLE_THICKNESS;
  private readonly PADDLE_LENGTH = GAME_LAYOUT.PADDLE_LENGTH;
  private readonly BALL_RADIUS = 12;
  private readonly SIDE_MISS_MARGIN = GAME_LAYOUT.SIDE_MISS_MARGIN;
  private readonly POST_MISS_COMMENT_MS = 3500;
  private readonly OPENING_BUBBLE_MIN_MS = 5000;
  private readonly OPENING_AUDIO_TAIL_MS = 300;
  private readonly OPENING_AUDIO_SAFE_MAX_MS = 8000;
  private readonly STANDARD_OPENING_BUBBLE_MS = 1600;
  private readonly STANDARD_INTRO_TO_SERVE_MS = 2200;
  private readonly VALENTINE_BUBBLE_MIN_MS = 5000;
  private readonly VALENTINE_BUBBLE_TAIL_MS = 300;
  private valentineRecentLines: string[] = [];
  private valentineOutburstCooldownUntil = 0;
  private valentineOutburstInFlight = false;
  private lastValentineOutburstModifier: BehaviorModifier | null = null;

  constructor() {
    super({ key: 'PlayScene' });
  }

  init(data: { ballId: string; playerSide?: PaddleSide; opponentId?: OpponentId }): void {
    this.ballId = data.ballId ?? 'orb';
    this.playerSide = data.playerSide ?? getPlayerPaddleSide();
    this.opponentId = data.opponentId ?? getSelectedOpponentId();
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
    this.opponentAi = new OpponentPaddleAI();
    this.opponentBarkSystem = new OpponentBarkSystem(this.opponentId);
    this.opponentBarkSystem.setCallbacks({
      onShowBark: (result) => this.showOpponentBarkUi(result),
      onApplyModifier: (modifier) => this.opponentAi.applyModifier(modifier),
    });
    this.opponentBarkSystem.resetForMatch();
    this.resetRoundState();

    const ballColors: Record<string, { fill: number; stroke: number }> = {
      orb: { fill: 0xaa66ff, stroke: 0xdd99ff },
      bolt: { fill: 0x44aa66, stroke: 0x88ddaa },
      valentine: { fill: 0xff4466, stroke: 0xff88aa },
    };
    const colors = ballColors[this.ballId] ?? ballColors.orb;

    this.applyPlayfieldLayout(width, height);

    this.add.rectangle(width / 2, height / 2, width, height, 0x0a0a12);

    this.hoverDim = this.add.rectangle(width / 2, height / 2, width, height, 0x000008, 0);
    this.hoverDim.setDepth(5);

    this.drawHudGutter();
    this.drawPlayfieldBorder();

    const playerX = this.getSidePaddleX(this.playerSide);
    const opponentX = this.getSidePaddleX(getOpponentPaddleSide(this.playerSide));
    const startY = (this.playfieldTop + this.playfieldBottom) / 2;
    const ballStartX = getPlayfieldCenterX(this.playfield);

    this.playerPaddle = this.add.rectangle(
      playerX,
      startY,
      this.PADDLE_THICKNESS,
      this.PADDLE_LENGTH,
      0x00e5ff
    );
    this.playerPaddle.setStrokeStyle(2, 0x88ffff, 0.9);
    this.physics.add.existing(this.playerPaddle);
    this.playerPaddleBody = this.playerPaddle.body as Phaser.Physics.Arcade.Body;
    this.playerPaddleBody.setImmovable(true);
    this.playerPaddleBody.setAllowGravity(false);

    this.opponentPaddle = this.add.rectangle(
      opponentX,
      startY,
      this.PADDLE_THICKNESS,
      this.PADDLE_LENGTH,
      0x556677
    );
    this.opponentPaddle.setStrokeStyle(2, 0x8899aa, 0.75);
    this.physics.add.existing(this.opponentPaddle);
    this.opponentPaddleBody = this.opponentPaddle.body as Phaser.Physics.Arcade.Body;
    this.opponentPaddleBody.setImmovable(true);
    this.opponentPaddleBody.setAllowGravity(false);
    this.opponentAi.reset(startY);

    this.ballGlow = this.add.circle(ballStartX, startY, this.BALL_RADIUS + 8, colors.fill, 0.25);
    this.ballGlow.setDepth(6);

    this.ball = this.add.circle(ballStartX, startY, this.BALL_RADIUS, colors.fill);
    this.ball.setStrokeStyle(3, colors.stroke, 0.9);
    this.ball.setDepth(7);
    this.physics.add.existing(this.ball);
    this.ballBody = this.ball.body as Phaser.Physics.Arcade.Body;
    this.ballBody.setCircle(this.BALL_RADIUS);
    this.ballBody.onWorldBounds = true;
    this.physics.world.on(
      'worldbounds',
      (body: Phaser.Physics.Arcade.Body) => {
        if (body.gameObject === this.ball && this.gameState === 'playing' && !this.serveLock) {
          if (this.wallBounceCooldown <= 0) {
            this.scoring.addEvent('wallBounce');
            this.wallBounceCooldown = 200;
            this.updateUI();
            soundManager.playWallHit();
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
    this.ballBody.setMaxVelocity(BALL_SPEED.MAX, BALL_SPEED.MAX);
    this.ballBody.setCollideWorldBounds(true);
    this.physics.world.checkCollision.left = false;
    this.physics.world.checkCollision.right = false;

    this.hoverMorph = new BallHoverMorph(
      this,
      this.ball,
      this.ballGlow,
      this.ballId,
      colors,
      this.BALL_RADIUS
    );

    const playfieldHeight = this.playfieldBottom - this.playfieldTop;
    this.physics.world.setBounds(-400, this.playfieldTop, width + 800, playfieldHeight);

    this.serveLock = true;
    this.centerBall();

    this.cursors = this.input.keyboard!.createCursorKeys();
    this.setupKeyboard();
    this.setupMousePaddleInput();

    soundManager.unlock();
    this.input.once('pointerdown', () => {
      soundManager.unlock();
      if (this.sound.locked) {
        this.sound.unlock();
      }
    });
    soundManager.onMuteChange((muted) => {
      if (muted) stopValentineAudio();
    });
    uiManager.setSoundIndicator(!soundManager.isMuted());
    characterAudio.preload(this);
    this.characterAudioReady = characterAudio
      .loadSelectedCharacters(this, [this.ballId, this.opponentId])
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.warn('[CharacterAudio] selected character load failed', error);
        }
      });

    const ballName = this.personality.getPersonality().name;
    const opponentName = this.opponentBarkSystem.getDisplayName();
    const opponentShort = getOpponentShortName(this.opponentId);

    uiManager.showPlaying(this.ballId, ballName, opponentName, opponentShort);
    uiManager.setCallbacks({
      onResponseSelected: (index) => this.selectResponse(index),
      onCustomResponseSubmitted: (text) => this.submitCustomResponse(text),
    });
    uiManager.setGameControlCallbacks({
      onPauseToggle: () => this.togglePause(),
      onQuit: () => this.quitToMenu(),
    });
    this.updateUI();
    this.syncUILayout();
    this.startMatchFlow();

    this.physics.add.collider(
      this.ball,
      this.playerPaddle,
      () => this.onPlayerPaddleHit(),
      undefined,
      this
    );
    this.physics.add.collider(
      this.ball,
      this.opponentPaddle,
      () => this.onOpponentPaddleHit(),
      undefined,
      this
    );
  }

  private applyPlayfieldLayout(canvasWidth: number, canvasHeight: number): void {
    this.playfield = computePlayfield(canvasWidth, canvasHeight);
    this.playfieldLeft = this.playfield.left;
    this.playfieldRight = this.playfield.right;
    this.playfieldTop = this.playfield.top;
    this.playfieldBottom = this.playfield.bottom;
    this.paddleMinY = this.playfieldTop + this.PADDLE_LENGTH / 2 + 4;
    this.paddleMaxY = this.playfieldBottom - this.PADDLE_LENGTH / 2 - 4;
  }

  private drawHudGutter(): void {
    const { height } = this.scale;
    const hudCenterX = this.playfield.rightHudLeft + this.playfield.rightHudWidth / 2;

    this.add
      .rectangle(hudCenterX, height / 2, this.playfield.rightHudWidth, height, 0x0c0c16, 1)
      .setDepth(1);

    const divider = this.add.graphics();
    divider.lineStyle(1, 0x2a2a4a, 0.85);
    divider.lineBetween(this.playfield.right, this.playfield.top, this.playfield.right, this.playfield.bottom);
    divider.setDepth(3);
  }

  private syncUILayout(): void {
    const bounds = this.getCanvasScreenBounds();
    uiManager.setCanvasBounds(bounds);
    const canvasScreenWidth = bounds.right - bounds.left;
    const compactStats =
      canvasScreenWidth < GAME_LAYOUT.NARROW_CANVAS_PX && this.shouldCompactStatsPanel();
    uiManager.syncPlayfieldLayout(
      bounds,
      this.playfield,
      { width: this.scale.width, height: this.scale.height },
      { compactStats, playerSide: this.playerSide }
    );
    this.repositionOpponentBarkIfVisible();
  }

  private repositionOpponentBarkIfVisible(): void {
    if (this.opponentBarkBubbleIsHidden()) return;
    uiManager.updateOpponentBarkPosition(this.buildOpponentBarkLayoutInput());
  }

  private shouldCompactStatsPanel(): boolean {
    if (this.isPaused || this.gameState === 'hover') return false;
    return (
      this.gameState === 'playing' ||
      this.gameState === 'countdown' ||
      this.gameState === 'pointBreak'
    );
  }

  private drawPlayfieldBorder(): void {
    const border = this.add.graphics();
    border.lineStyle(2, 0x2a2a4a, 0.8);
    border.beginPath();
    border.moveTo(this.playfieldLeft, this.playfieldTop);
    border.lineTo(this.playfieldRight, this.playfieldTop);
    border.moveTo(this.playfieldLeft, this.playfieldBottom);
    border.lineTo(this.playfieldRight, this.playfieldBottom);
    border.strokePath();

    const leftGlow = this.add.rectangle(
      this.playfieldLeft - 14,
      (this.playfieldTop + this.playfieldBottom) / 2,
      24,
      this.playfieldBottom - this.playfieldTop - 20,
      0xff2233,
      0.06
    );
    leftGlow.setDepth(2);

    const rightGlow = this.add.rectangle(
      this.playfieldRight + 14,
      (this.playfieldTop + this.playfieldBottom) / 2,
      24,
      this.playfieldBottom - this.playfieldTop - 20,
      0xff2233,
      0.06
    );
    rightGlow.setDepth(2);
  }

  private getSidePaddleX(side: PaddleSide): number {
    return layoutPaddleX(side, this.playfield);
  }

  private resetRoundState(): void {
    this.currentEvent = null;
    this.nearMissTriggered = false;
    this.lastLongRallyMilestone = 0;
    this.gentleNextHit = false;
    this.betrayalActive = false;
    this.wallBounceCooldown = 0;
    this.failsafeCheckTimer = 0;
    this.isPaused = false;
    this.serveLock = true;
    this.recentEvents = [];
    this.playerModeHistory = ['voice'];
    this.currentHoverType = '';
  }

  private centerBall(): void {
    const centerY = (this.playfieldTop + this.playfieldBottom) / 2;
    this.ball.setPosition(getPlayfieldCenterX(this.playfield), centerY);
    this.ballBody.reset(this.ball.x, this.ball.y);
    this.ballBody.setVelocity(0, 0);
  }

  private startMatchFlow(): void {
    this.matchSystem.reset();
    this.scoring.reset();
    this.emotionDirector.onPlayStart();
    this.opponentBarkSystem.resetForMatch();
    this.resetRoundState();
    this.gameState = 'intro';
    this.centerBall();

    const ballName = this.personality.getPersonality().name;
    const opponentName = this.opponentBarkSystem.getDisplayName();
    const opponentShort = getOpponentShortName(this.opponentId);
    uiManager.updateMatchHUD(
      0,
      0,
      0,
      this.inputMode.getMode(),
      ballName,
      opponentName,
      opponentShort
    );

    uiManager.showMatchIntro(`${ballName} vs ${opponentName}`);

    this.time.delayedCall(600, () => {
      if (this.gameState !== 'intro') return;
      this.fireOpponentBark('matchStart');
    });

    if (this.ballId === 'valentine') {
      this.time.delayedCall(900, () => this.showValentineOpeningLineBeforeServe());
      return;
    }

    this.time.delayedCall(900, () => {
      if (this.gameState !== 'intro') return;
      const openingLine = getBallOpeningLineCue(this.ballId);
      uiManager.showBallComment(openingLine.text, this.STANDARD_OPENING_BUBBLE_MS, this.getBallScreenPosition());
      this.playBallLineAudio(openingLine);
    });

    this.time.delayedCall(this.STANDARD_INTRO_TO_SERVE_MS, () => {
      if (this.gameState !== 'intro') return;
      uiManager.hideMatchIntro();
      this.runServeCountdown();
    });
  }

  private showValentineOpeningLineBeforeServe(): void {
    if (this.gameState !== 'intro') return;

    let started = false;
    const startOpening = (): void => {
      if (started || this.gameState !== 'intro') return;
      started = true;

      const openingLine = getBallOpeningLineCue(this.ballId);
      const audioResult = this.playBallLineAudio(openingLine);
      const audioDurationMs =
        audioResult?.ok && audioResult.durationMs !== undefined
          ? audioResult.durationMs + this.OPENING_AUDIO_TAIL_MS
          : audioResult?.ok
            ? this.OPENING_AUDIO_SAFE_MAX_MS
            : 0;
      const bubbleDurationMs = Math.max(this.OPENING_BUBBLE_MIN_MS, audioDurationMs);

      uiManager.showBallComment(openingLine.text, bubbleDurationMs, this.getBallScreenPosition());

      this.time.delayedCall(bubbleDurationMs, () => {
        if (this.gameState !== 'intro') return;
        uiManager.hideMatchIntro();
        this.runServeCountdown();
      });
    };

    void this.characterAudioReady.then(() => {
      if (this.gameState !== 'intro') return;
      startOpening();
    });
  }

  private runServeCountdown(): void {
    this.gameState = 'countdown';
    this.serveLock = true;
    this.centerBall();
    uiManager.hidePointFlash();
    this.opponentBarkSystem.setCountdownActive(true);

    const steps = ['3', '2', '1', 'BOUNCE'];
    const stepMs = 450;
    steps.forEach((step, index) => {
      this.time.delayedCall(index * stepMs, () => {
        if (this.gameState !== 'countdown') return;
        uiManager.showCountdown(step);
      });
    });

    this.time.delayedCall(steps.length * stepMs, () => {
      if (this.gameState !== 'countdown') return;
      uiManager.hideCountdown();
      this.opponentBarkSystem.setCountdownActive(false);
      this.beginRally();
    });
  }

  private beginRally(): void {
    this.gameState = 'playing';
    this.emotionDirector.resetForRally();
    this.opponentBarkSystem.resetForRally();
    this.opponentAi.beginRally();
    this.scoring.resetCombo();
    this.nearMissTriggered = false;
    this.lastLongRallyMilestone = 0;
    this.failsafeCheckTimer = 0;
    this.centerBall();

    const target = this.matchSystem.getServeTarget(this.playerSide);
    this.serveBall(target);
    this.serveLock = false;
    this.updateUI();
  }

  private awardPoint(winner: 'player' | 'opponent'): void {
    if (this.gameState !== 'playing') return;

    this.gameState = 'pointBreak';
    this.serveLock = true;
    this.ballBody.setVelocity(0, 0);
    this.scoring.resetCombo();

    const opponentShort = getOpponentShortName(this.opponentId);

    if (winner === 'player') {
      this.matchSystem.recordPlayerPoint();
      this.scoring.addEvent('opponentMiss');
      this.fireOpponentBark('playerScores');
      this.fireOpponentBark('opponentMisses');
      uiManager.showPointFlash('You scored.');
      const pointReaction = getBallPointReactionCue(this.ballId, true);
      uiManager.showBallComment(pointReaction.text, 1400, this.getBallScreenPosition());
      this.playBallLineAudio(pointReaction, 'playerScored');
      soundManager.playPlayerScore();
    } else {
      this.matchSystem.recordOpponentPoint();
      this.fireOpponentBark('playerMisses');
      this.fireOpponentBark('opponentScores');
      uiManager.showPointFlash(`${opponentShort} scored.`);
      const pointReaction = getBallPointReactionCue(this.ballId, false);
      uiManager.showBallComment(pointReaction.text, this.POST_MISS_COMMENT_MS, this.getBallScreenPosition());
      this.playBallLineAudio(pointReaction, 'opponentScored');
      soundManager.playOpponentScore();
    }

    this.centerBall();
    this.updateUI();

    console.log(
      `[Score] player=${this.matchSystem.playerPoints} opponent=${this.matchSystem.opponentPoints} (${winner} scored)`
    );

    if (this.matchSystem.isOver()) {
      this.time.delayedCall(1200, () => this.endMatch());
    } else {
      this.time.delayedCall(1200, () => this.runServeCountdown());
    }
  }

  private endMatch(): void {
    this.gameState = 'matchEnd';
    this.serveLock = true;
    this.ballBody.setVelocity(0, 0);
    this.time.timeScale = 1;
    uiManager.hidePointFlash();
    uiManager.hideMatchOverlays();

    const winner = this.matchSystem.getWinner();
    if (!winner) return;

    const recap = buildMatchRecap(
      this.ballId,
      this.opponentId,
      winner,
      this.matchSystem.playerPoints,
      this.matchSystem.opponentPoints,
      this.scoring.longestRally,
      this.personality.getStats()
    );

    const showRecap = (): void => {
      uiManager.showMatchRecap(recap, {
        onRematch: () =>
          this.scene.restart({
            ballId: this.ballId,
            playerSide: this.playerSide,
            opponentId: this.opponentId,
          }),
        onChangeBall: () => this.scene.start('MenuScene'),
        onChangeOpponent: () => this.scene.start('MenuScene'),
        onMainMenu: () => this.scene.start('MenuScene'),
      });
    };

    if (this.ballId === 'valentine') {
      void this.finishValentineEndMatch(showRecap);
      return;
    }

    showRecap();
  }

  private async finishValentineEndMatch(showRecap: () => void): Promise<void> {
    try {
      await Promise.race([
        this.playValentineDynamicMoment('postMatch'),
        this.waitRealMs(4000),
      ]);
    } finally {
      uiManager.hideBallComment();
      showRecap();
    }
  }

  private setupMousePaddleInput(): void {
    const trackPointer = (clientX: number, clientY: number) => {
      const canvas = this.game.canvas;
      const rect = canvas.getBoundingClientRect();
      this.lastMouseClientY = clientY;
      this.mouseOnGameViewport =
        clientX >= rect.left &&
        clientX <= rect.right &&
        clientY >= rect.top &&
        clientY <= rect.bottom;
    };

    this.input.on('pointermove', (pointer: Phaser.Input.Pointer) => {
      const client = this.getPointerClientPosition(pointer);
      if (client) trackPointer(client.x, client.y);
    });

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      const client = this.getPointerClientPosition(pointer);
      if (client) trackPointer(client.x, client.y);
    });

    window.addEventListener('mousemove', (event) => {
      if (this.gameState !== 'playing' || this.isPaused) return;
      trackPointer(event.clientX, event.clientY);
    });
  }

  private getPointerClientPosition(
    pointer: Phaser.Input.Pointer
  ): { x: number; y: number } | null {
    const evt = pointer.event as MouseEvent | TouchEvent | undefined;
    if (evt && 'clientY' in evt) {
      return { x: evt.clientX, y: evt.clientY };
    }
    const rect = this.game.canvas.getBoundingClientRect();
    return { x: rect.left + pointer.x, y: rect.top + pointer.y };
  }

  private getScaleFitViewport(canvasRect: DOMRect): {
    offsetX: number;
    offsetY: number;
    width: number;
    height: number;
  } {
    const gameW = this.scale.width;
    const gameH = this.scale.height;
    const scale = Math.min(canvasRect.width / gameW, canvasRect.height / gameH);
    const width = gameW * scale;
    const height = gameH * scale;
    return {
      offsetX: (canvasRect.width - width) / 2,
      offsetY: (canvasRect.height - height) / 2,
      width,
      height,
    };
  }

  private ballSpeed01(): number {
    const v = this.ballBody.velocity;
    const speed = Math.sqrt(v.x * v.x + v.y * v.y);
    return Math.max(0, Math.min(1, speed / BALL_SPEED.MAX));
  }

  private playBallLineAudio(
    line: BallLineCue,
    scoringResult?: 'playerScored' | 'opponentScored'
  ): CharacterAudioResult | null {
    if (!line.audioCueId) return null;

    if (import.meta.env.DEV) {
      const audioKey = characterAudio.getAudioKey(this.ballId, line.audioCueId);
      console.log('[PlayScene] playBallLineAudio', {
        characterId: this.ballId,
        audioCueId: line.audioCueId,
        audioKey,
        cacheHit: this.cache.audio.exists(audioKey),
        muted: soundManager.isMuted(),
        audioContextState: soundManager.getAudioContextState(),
      });
    }

    const mapping = mapGameEventToAudioCategory({
      characterId: this.ballId,
      characterKind: 'ball',
      scoringResult,
    });
    const result = characterAudio.playCue(this, this.ballId, line.audioCueId, {
      priority: mapping?.priority ?? 'medium',
      interrupt: 'same-or-lower',
    });

    if (import.meta.env.DEV && result && !result.ok) {
      console.warn('[PlayScene] playBallLineAudio failed', {
        characterId: this.ballId,
        audioCueId: line.audioCueId,
        result: result.result,
        message: result.message,
      });
    }

    return result;
  }

  private playDialogueEventAudio(event: DialogueEvent): void {
    if (!event.audioCueId) return;
    const mapping = mapGameEventToAudioCategory({
      characterId: this.ballId,
      characterKind: 'ball',
      situation: event.situation,
    });
    characterAudio.playCue(this, this.ballId, event.audioCueId, {
      priority: mapping?.priority ?? 'high',
      interrupt: 'same-or-lower',
    });
  }


  private setupKeyboard(): void {
    const kb = this.input.keyboard!;
    const blockIfTyping = (): boolean => isTypingInFormField();

    kb.on('keydown-T', () => {
      if (blockIfTyping()) return;
      this.toggleInputMode();
    });
    kb.on('keydown-H', () => {
      if (blockIfTyping()) return;
      this.debugForceHover('random');
    });
    kb.on('keydown-M', (event: KeyboardEvent) => {
      if (event.repeat) return;
      if (blockIfTyping()) return;
      if (event.shiftKey) {
        this.debugForceHover('mode');
        return;
      }
      const muted = soundManager.toggleMute();
      characterAudio.setMuted(muted);
      uiManager.setSoundIndicator(!muted);
      uiManager.showDebugToast(muted ? 'SOUND OFF' : 'SOUND ON');
    });
    kb.on('keydown-O', (event: KeyboardEvent) => {
      if (import.meta.env.DEV) {
        console.log('[Debug Key] O detected', { shift: event.shiftKey, repeat: event.repeat });
      }

      if (event.repeat) return;
      if (blockIfTyping()) return;

      if (event.shiftKey) {
        const next = this.opponentBarkSystem.cycleOpponent();
        this.opponentId = next;
        uiManager.setSelectedOpponentId(next);
        uiManager.showDebugToast(`Opponent: ${this.opponentBarkSystem.getDisplayName()}`);
        return;
      }

      if (import.meta.env.DEV) {
        console.log('[Debug Key] O triggering opponent bark');
      }
      this.fireOpponentBark('randomGameplay', { force: true });
    });
    kb.on('keydown-R', (event: KeyboardEvent) => {
      if (blockIfTyping()) return;
      if (event.shiftKey) {
        uiManager.resetDialoguePanelPosition();
        return;
      }
      this.personality.updateStats({ resentment: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Resentment');
    });
    kb.on('keydown-C', () => {
      if (blockIfTyping()) return;
      this.personality.updateStats({ chaos: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Chaos');
    });
    kb.on('keydown-D', () => {
      if (blockIfTyping()) return;
      this.personality.updateStats({ dramaNeed: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+DramaNeed');
    });
    kb.on('keydown-A', () => {
      if (blockIfTyping()) return;
      this.personality.updateStats({ attachment: 15 });
      uiManager.updateStats(this.personality.getStats());
      uiManager.updateBallMeta(
        this.currentHoverType,
        this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
      );
      uiManager.showDebugToast('+Attachment');
    });
    kb.on('keydown-[', () => {
      if (blockIfTyping()) return;
      this.opponentAi.adjustDifficulty(-1);
      uiManager.showDebugToast(`Opponent: ${this.opponentAi.getDifficultyTier()}`);
    });
    kb.on('keydown-]', () => {
      if (blockIfTyping()) return;
      this.opponentAi.adjustDifficulty(1);
      uiManager.showDebugToast(`Opponent: ${this.opponentAi.getDifficultyTier()}`);
    });
    kb.on('keydown-SPACE', () => {
      if (blockIfTyping()) return;
      if (this.gameState === 'hover') this.selectResponse(0);
    });
    for (let i = 1; i <= 4; i++) {
      kb.on(`keydown-${i}`, () => {
        if (blockIfTyping()) return;
        if (this.gameState === 'hover') this.selectResponse(i - 1);
      });
    }
  }

  update(_time: number, delta: number): void {
    if (this.gameState === 'matchEnd') return;

    this.ballGlow.setPosition(this.ball.x, this.ball.y);

    this.syncUILayout();

    if (this.isPaused) {
      if (this.gameState === 'playing') {
        this.ballBody.setVelocity(0, 0);
      }
      return;
    }

    if (this.gameState === 'intro' || this.gameState === 'countdown' || this.gameState === 'pointBreak') {
      return;
    }

    this.behaviorMod.tick();

    if (this.gameState === 'hover') {
      this.ballBody.setVelocity(0, 0);
      this.hoverMorph.syncPosition(this.ball.x, this.ball.y);
      uiManager.setCanvasBounds(this.getCanvasScreenBounds());
      this.updateBubblePosition();
      return;
    }

    this.movePlayerPaddle(delta);

    const stats = this.personality.getStats();
    this.opponentAi.update(
      delta,
      this.opponentPaddle,
      this.opponentPaddleBody,
      this.ball.x,
      this.ball.y,
      this.ballBody.velocity.x,
      this.ballBody.velocity.y,
      getOpponentPaddleSide(this.playerSide),
      this.paddleMinY,
      this.paddleMaxY,
      Math.sqrt(this.ballBody.velocity.x ** 2 + this.ballBody.velocity.y ** 2),
      this.scoring.currentRallyHits,
      stats.chaos
    );

    if (this.wallBounceCooldown > 0) {
      this.wallBounceCooldown -= delta;
    }

    applyBehaviorToVelocity(
      this.ballBody,
      this.behaviorMod.activeModifier,
      this.playerPaddle.x,
      this.playerPaddle.y,
      this.playerSide,
      this.personality.getChaosMultiplier(),
      stats
    );

    this.checkNearMiss();
    this.checkSideExits();

    const chaosHigh =
      stats.chaos > 75 ||
      this.behaviorMod.activeModifier === 'chaosWobble' ||
      this.behaviorMod.activeModifier === 'erraticBounce';
    this.opponentBarkSystem.update(
      delta,
      this.matchSystem.playerPoints,
      this.matchSystem.opponentPoints,
      chaosHigh
    );

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
      if (
        this.ballId === 'valentine' &&
        this.gameState === 'playing' &&
        this.behaviorMod.activeModifier &&
        this.behaviorMod.activeModifier !== this.lastValentineOutburstModifier &&
        !this.valentineOutburstInFlight &&
        Date.now() >= this.valentineOutburstCooldownUntil &&
        Math.random() < 0.22
      ) {
        this.lastValentineOutburstModifier = this.behaviorMod.activeModifier;
        void this.triggerValentineOutburst();
      }
    } else {
      uiManager.hideOutburst();
      this.lastValentineOutburstModifier = null;
    }

    this.updateUI();
  }

  private movePlayerPaddle(delta: number): void {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const useMouse =
      this.mouseOnGameViewport &&
      this.lastMouseClientY !== null &&
      !uiManager.isDraggingDialoguePanel();

    if (useMouse) {
      const pointerYInCanvasCss = this.lastMouseClientY! - rect.top;
      const view = this.getScaleFitViewport(rect);
      const playfieldTopScreen =
        view.offsetY + (this.playfieldTop / this.scale.height) * view.height;
      const playfieldBottomScreen =
        view.offsetY + (this.playfieldBottom / this.scale.height) * view.height;
      const playfieldSpan = playfieldBottomScreen - playfieldTopScreen;
      const normalizedY =
        playfieldSpan > 0
          ? Phaser.Math.Clamp((pointerYInCanvasCss - playfieldTopScreen) / playfieldSpan, 0, 1)
          : 0;
      const targetY =
        this.playfieldTop + normalizedY * (this.playfieldBottom - this.playfieldTop);

      this.playerPaddle.y = Phaser.Math.Clamp(targetY, this.paddleMinY, this.paddleMaxY);

      if (this.DEBUG_MOUSE_PADDLE) {
        this.mousePaddleDebugTimer += delta;
        if (this.mousePaddleDebugTimer >= 200) {
          this.mousePaddleDebugTimer = 0;
          console.log(`[Mouse Paddle] clientY=${this.lastMouseClientY}`);
          console.log(`[Mouse Paddle] normalizedY=${normalizedY.toFixed(3)}`);
          console.log(`[Mouse Paddle] targetY=${targetY.toFixed(1)}`);
          console.log(`[Mouse Paddle] actualY=${this.playerPaddle.y.toFixed(1)}`);
        }
      }
    } else {
      const speed = 520;
      let targetY = this.playerPaddle.y;
      if (this.cursors.up.isDown) {
        targetY -= (speed * delta) / 1000;
      } else if (this.cursors.down.isDown) {
        targetY += (speed * delta) / 1000;
      }
      this.playerPaddle.y = Phaser.Math.Clamp(targetY, this.paddleMinY, this.paddleMaxY);
    }

    this.playerPaddleBody.reset(this.playerPaddle.x, this.playerPaddle.y);
  }

  private checkNearMiss(): void {
    const vx = this.ballBody.velocity.x;
    const approachingPlayer =
      (this.playerSide === 'right' && vx > 0) || (this.playerSide === 'left' && vx < 0);

    if (!approachingPlayer) {
      this.nearMissTriggered = false;
      return;
    }

    const nearPlayerX =
      this.playerSide === 'right'
        ? this.ball.x > this.playerPaddle.x - 50 && this.ball.x < this.playfieldRight
        : this.ball.x < this.playerPaddle.x + 50 && this.ball.x > this.playfieldLeft;

    if (
      !this.nearMissTriggered &&
      nearPlayerX &&
      Math.abs(this.ball.y - this.playerPaddle.y) > this.PADDLE_LENGTH * 0.45
    ) {
      this.nearMissTriggered = true;
      this.scoring.addEvent('nearMiss');
      this.emotionDirector.onNearMissDetected();
      this.fireOpponentBark('nearMiss');
      this.updateUI();
    }
  }

  private checkSideExits(): void {
    if (this.gameState !== 'playing' || this.serveLock) return;

    const margin = this.SIDE_MISS_MARGIN;

    if (this.playerSide === 'left' && this.ball.x < this.playfieldLeft - margin) {
      this.awardPoint('opponent');
      return;
    }
    if (this.playerSide === 'right' && this.ball.x > this.playfieldRight + margin) {
      this.awardPoint('opponent');
      return;
    }

    if (this.playerSide === 'left' && this.ball.x > this.playfieldRight + margin) {
      this.awardPoint('player');
      return;
    }
    if (this.playerSide === 'right' && this.ball.x < this.playfieldLeft - margin) {
      this.awardPoint('player');
    }
  }

  private serveBall(toward: PaddleSide): void {
    this.centerBall();
    launchBall(this.ballBody, this.personality.getSpeedMultiplier(), { toward, serve: true });
  }

  private onPlayerPaddleHit(): void {
    if (this.gameState !== 'playing' || this.isPaused || this.serveLock) return;

    this.nearMissTriggered = false;
    const gentle = this.gentleNextHit || this.behaviorMod.activeModifier === 'gentleReturn';
    this.gentleNextHit = false;

    reflectVerticalPaddle(
      this.ballBody,
      this.playerPaddle.y,
      this.PADDLE_LENGTH,
      this.playerSide,
      gentle,
      this.personality.getStats()
    );
    accelerateBallAfterHit(this.ballBody);
    soundManager.playPaddleHit(this.ballSpeed01(), 'player');

    const stats = this.personality.getStats();

    if (Math.random() < this.personality.getHelpfulChance()) {
      this.behaviorMod.setModifier('helpfulCurve', 'Helpful curve!');
      this.scoring.addEvent('helpfulBehavior');
    } else if (Math.random() < this.personality.getBetrayalChance()) {
      this.behaviorMod.setModifier('hostileFakeOut', 'Hostile fake-out!');
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
        this.fireOpponentBark('longRally');
      }
    }

    const hoverDecision = this.emotionDirector.onPaddleHit(stats, this.ballId);
    if (hoverDecision) {
      this.triggerHover(hoverDecision);
    }
  }

  private onOpponentPaddleHit(): void {
    if (this.gameState !== 'playing' || this.isPaused || this.serveLock) return;

    reflectVerticalPaddle(
      this.ballBody,
      this.opponentPaddle.y,
      this.PADDLE_LENGTH,
      getOpponentPaddleSide(this.playerSide),
      false
    );
    accelerateBallAfterHit(this.ballBody);
    soundManager.playPaddleHit(this.ballSpeed01(), 'opponent');
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
    if (this.gameState !== 'playing' || this.serveLock) return;

    const situation = decision.situation;
    this.currentHoverType = this.emotionDirector.formatHoverType(decision.hoverType);
    console.log(`[Hover] ${decision.reason} → ${this.currentHoverType}`);

    let event = forceModeSwitch ? this.dialogue.getModeSwitchEvent(this.ballId) : null;
    if (!event) {
      event = this.dialogue.pickEvent(this.ballId, situation, this.personality.getStats());
    }
    if (!event) return;

    this.enterHover(event);
  }

  private enterHover(event: NonNullable<typeof this.currentEvent>): void {
    this.gameState = 'hover';
    this.currentEvent = event;
    this.emotionDirector.notifyHoverStarted();
    soundManager.playHover();
    this.playDialogueEventAudio(event);

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
    this.opponentBarkSystem.setBallHoverActive(true);
    uiManager.suppressOpponentBarkForDialogue();
    this.syncUILayout();
    this.fireOpponentBark('ballHoverStarts', { allowDuringHover: true });

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

    if (this.ballId === 'valentine') {
      await this.submitValentineCustomResponse(text);
      return;
    }

    uiManager.showCustomInputProcessing();

    const result = await classifyPlayerResponse({
      playerText: text,
      ballId: this.ballId,
      situation: this.currentEvent.situation,
    });

    this.applyAiResult(
      {
        text,
        tone: result.tone as DialogueResponse['tone'],
        statChanges: result.statChanges,
        ballReaction: result.ballReaction,
        emotionalResult: result.emotionalResult,
        behaviorModifier: this.normalizeModifier(result.behaviorModifier),
      },
      text
    );
  }

  private async submitValentineCustomResponse(text: string): Promise<void> {
    if (this.gameState !== 'hover' || !this.currentEvent) return;

    uiManager.showCustomInputProcessing();
    uiManager.showValentineThinking(this.getBallScreenPosition());

    const voicePayload = {
      eventType: 'typedResponse' as const,
      playerText: text,
      gameState: this.buildValentineVoiceGameState(),
      recentLines: this.valentineRecentLines,
    };

    const [classifyResult, voiceResult] = await Promise.all([
      classifyPlayerResponse({
        playerText: text,
        ballId: this.ballId,
        situation: this.currentEvent.situation,
      }),
      requestValentineVoice(voicePayload),
    ]);

    this.personality.updateStats(classifyResult.statChanges);
    this.behaviorMod.setModifier(this.normalizeModifier(classifyResult.behaviorModifier));
    if (classifyResult.behaviorModifier === 'gentleReturn') {
      this.gentleNextHit = true;
    }

    const ballName = this.personality.getPersonality().name;
    const emotionalResult =
      classifyResult.emotionalResult ??
      getEmotionalResult(
        this.ballId,
        ballName,
        classifyResult.statChanges,
        classifyResult.tone as DialogueResponse['tone']
      );

    this.recentEvents.push(`player: ${text.slice(0, 50)}`);
    uiManager.updateStats(this.personality.getStats());
    uiManager.updateBallMeta(
      this.currentHoverType,
      this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
    );

    const ballScreen = this.getBallScreenPosition();
    uiManager.showValentineHoverResult(emotionalResult, text);
    uiManager.showBallComment(voiceResult.text, 120000, ballScreen);

    let audioDuration = voiceResult.durationMs;
    if (voiceResult.audioUrl) {
      audioDuration = await playValentineAudio(voiceResult.audioUrl, voiceResult.text);
      revokeValentineAudioUrl(voiceResult.audioUrl);
    }

    const bubbleMs = Math.max(
      this.VALENTINE_BUBBLE_MIN_MS,
      audioDuration + this.VALENTINE_BUBBLE_TAIL_MS
    );
    uiManager.showBallComment(voiceResult.text, bubbleMs, ballScreen);
    this.recordValentineLine(voiceResult.text);

    if (!voiceResult.ok && import.meta.env.DEV) {
      console.warn('[ValentineVoice] dynamic response without audio', voiceResult.message);
    }

    await this.waitRealMs(bubbleMs);
    this.resumeFromHover();
  }

  private buildValentineVoiceGameState(): ValentineVoiceGameState {
    const stats = this.personality.getStats();
    return {
      playerScore: this.matchSystem.playerPoints,
      opponentScore: this.matchSystem.opponentPoints,
      rally: this.scoring.rallyCount,
      mood: this.emotionDirector.getMoodLabel(stats, this.ballId).toLowerCase(),
      trust: stats.trust,
      resentment: stats.resentment,
      attachment: stats.attachment,
      chaos: stats.chaos,
    };
  }

  private recordValentineLine(line: string): void {
    this.valentineRecentLines = [line, ...this.valentineRecentLines].slice(0, 5);
  }

  private waitRealMs(ms: number): Promise<void> {
    return new Promise((resolve) => {
      window.setTimeout(resolve, ms);
    });
  }

  private async playValentineDynamicMoment(
    eventType: ValentineVoiceEventType,
    options?: {
      playerText?: string;
      showDialogueResult?: { emotionalResult: string; playerEcho?: string };
      waitForBubble?: boolean;
    }
  ): Promise<void> {
    const payload = {
      eventType,
      playerText: options?.playerText,
      gameState: this.buildValentineVoiceGameState(),
      recentLines: this.valentineRecentLines,
    };

    uiManager.showValentineThinking(this.getBallScreenPosition());
    const result = await requestValentineVoice(payload);
    const ballScreen = this.getBallScreenPosition();

    if (options?.showDialogueResult) {
      uiManager.showValentineHoverResult(
        options.showDialogueResult.emotionalResult,
        options.showDialogueResult.playerEcho
      );
    }

    uiManager.showBallComment(result.text, 120000, ballScreen);

    let audioDuration = result.durationMs;
    if (result.audioUrl) {
      if (import.meta.env.DEV) {
        console.log('[ValentineVoice] playing dynamic audio', { text: result.text });
      }
      audioDuration = await playValentineAudio(result.audioUrl, result.text);
      revokeValentineAudioUrl(result.audioUrl);
    } else if (import.meta.env.DEV) {
      console.warn('[ValentineVoice] no audio URL for dynamic moment', result.message);
    }

    const bubbleMs = Math.max(
      this.VALENTINE_BUBBLE_MIN_MS,
      audioDuration + this.VALENTINE_BUBBLE_TAIL_MS
    );
    uiManager.showBallComment(result.text, bubbleMs, ballScreen);
    this.recordValentineLine(result.text);

    if (!result.ok && import.meta.env.DEV) {
      console.warn('[ValentineVoice] dynamic moment used fallback', result.message);
    }

    if (options?.waitForBubble !== false) {
      await this.waitRealMs(bubbleMs);
    }
  }

  private async triggerValentineOutburst(): Promise<void> {
    if (this.valentineOutburstInFlight || this.gameState !== 'playing') return;

    const payload = {
      eventType: 'outburst' as const,
      gameState: this.buildValentineVoiceGameState(),
      recentLines: this.valentineRecentLines,
    };
    if (!canRequestValentineVoice(payload)) return;

    this.valentineOutburstInFlight = true;
    this.valentineOutburstCooldownUntil = Date.now() + 50000;

    try {
      await this.playValentineDynamicMoment('outburst', { waitForBubble: false });
    } finally {
      this.valentineOutburstInFlight = false;
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
    this.opponentBarkSystem.setBallHoverActive(false);
    this.fireOpponentBark('ballHoverEnds', { allowDuringHover: true });

    this.time.timeScale = 1;
    this.tweens.add({ targets: this.hoverDim, alpha: 0, duration: 250 });

    uiManager.hideDialogue();
    uiManager.updateBallMeta('', this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId));
    this.syncUILayout();

    const stats = this.personality.getStats();
    const speedMult = this.personality.getSpeedMultiplier();
    const speed = Math.abs(this.storedVelocity.x) + Math.abs(this.storedVelocity.y);

    const resumeBallMotion = (): void => {
      if (speed > 30) {
        this.ballBody.setVelocity(this.storedVelocity.x, this.storedVelocity.y);
      } else if (stats.attachment > 80) {
        launchBall(this.ballBody, speedMult, {
          toward: getOpponentPaddleSide(this.playerSide),
        });
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

  private getBallScreenPosition(): { x: number; y: number } {
    return this.ballToScreen(this.ball.x, this.ball.y);
  }

  private fireOpponentBark(
    situation: OpponentBarkSituation,
    options?: { force?: boolean; allowDuringHover?: boolean }
  ): void {
    this.opponentBarkSystem.tryBark(situation, options);
  }

  private showOpponentBarkUi(result: BarkResult): void {
    const layout = this.buildOpponentBarkLayoutInput();
    uiManager.showOpponentBark(result, layout);
  }

  private buildOpponentBarkLayoutInput() {
    const canvas = this.game.canvas;
    const rect = canvas.getBoundingClientRect();
    const canvasBounds = this.getCanvasScreenBounds();
    const opponentScreen = opponentPaddleToScreen(
      this.opponentPaddle.x,
      this.opponentPaddle.y,
      rect,
      this.scale.width,
      this.scale.height
    );
    const opponentSide: PaddleSide =
      this.opponentPaddle.x < getPlayfieldCenterX(this.playfield) ? 'left' : 'right';

    return uiManager.buildOpponentBarkLayout(
      opponentScreen,
      opponentSide,
      canvasBounds,
      {
        left: this.playfieldLeft,
        right: this.playfieldRight,
        top: this.playfieldTop,
        bottom: this.playfieldBottom,
      },
      { width: this.scale.width, height: this.scale.height },
      this.playerSide
    );
  }

  private opponentBarkBubbleIsHidden(): boolean {
    return document.getElementById('opponent-bark-bubble')?.classList.contains('hidden') ?? true;
  }

  private updateUI(): void {
    const ballName = this.personality.getPersonality().name;
    const opponentName = this.opponentBarkSystem.getDisplayName();
    const opponentShort = getOpponentShortName(this.opponentId);
    uiManager.updateMatchHUD(
      this.matchSystem.playerPoints,
      this.matchSystem.opponentPoints,
      this.scoring.currentRallyHits,
      this.inputMode.getMode(),
      ballName,
      opponentName,
      opponentShort
    );
    uiManager.updateStats(this.personality.getStats());
    uiManager.updateBallMeta(
      this.currentHoverType,
      this.emotionDirector.getMoodLabel(this.personality.getStats(), this.ballId)
    );
  }

  private togglePause(): void {
    if (this.gameState === 'matchEnd') return;
    if (this.isPaused) {
      this.resumeGame();
    } else {
      this.pauseGame();
    }
  }

  private pauseGame(): void {
    if (this.isPaused || this.gameState === 'matchEnd') return;

    this.isPaused = true;
    this.pausedTimeScale = this.time.timeScale;
    this.time.timeScale = 0;

    if (this.gameState === 'playing') {
      this.storedVelocity.x = this.ballBody.velocity.x;
      this.storedVelocity.y = this.ballBody.velocity.y;
    }

    this.ballBody.setVelocity(0, 0);
    this.physics.pause();
    this.time.paused = true;
    this.emotionDirector.pauseTimers();
    this.opponentBarkSystem.pauseTimers();
    uiManager.setPaused(true);
    this.syncUILayout();
    this.fireOpponentBark('pausePressed');
  }

  private resumeGame(): void {
    if (!this.isPaused) return;

    this.isPaused = false;
    this.time.timeScale = this.pausedTimeScale;
    this.physics.resume();
    this.time.paused = false;
    this.emotionDirector.resumeTimers();
    this.opponentBarkSystem.resumeTimers();
    uiManager.setPaused(false);
    this.syncUILayout();

    if (this.gameState === 'playing') {
      const speed = Math.abs(this.storedVelocity.x) + Math.abs(this.storedVelocity.y);
      if (speed > 10) {
        this.ballBody.setVelocity(this.storedVelocity.x, this.storedVelocity.y);
      }
    }
  }

  private quitToMenu(): void {
    this.fireOpponentBark('quitPressed');

    if (this.isPaused) {
      this.time.paused = false;
      this.physics.resume();
      this.emotionDirector.resumeTimers();
      this.opponentBarkSystem.resumeTimers();
      this.isPaused = false;
    }

    this.time.timeScale = 1;
    this.hoverMorph.forceRestore();
    uiManager.hideDialogue();
    uiManager.hideOutburst();
    uiManager.hideOpponentBark();
    uiManager.hideMatchOverlays();
    uiManager.resetGameControls();
    this.scene.start('MenuScene');
  }
}
