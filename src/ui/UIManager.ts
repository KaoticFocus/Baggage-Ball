import type { DialogueEvent, InputMode } from '../game/types/DialogueTypes';
import {
  getPlayerPaddleSide,
  getSelectedOpponentId,
  setPlayerPaddleSide,
  setSelectedOpponentId,
  type OpponentId,
  type PaddleSide,
} from '../game/settings/PlayerSettings';
import { opponentMonologues } from '../game/data/opponentMonologues';
import type { BarkResult } from '../game/systems/OpponentBarkSystem';
import {
  buildOpponentBarkLayoutInput,
  getOpponentBarkLayoutKey,
  positionOpponentBarkBubble as layoutOpponentBarkBubble,
  type OpponentBarkLayoutInput,
} from './opponentBarkLayout';
import type { PlayfieldRect } from '../game/layout/GameLayout';
import { GAME_LAYOUT } from '../game/layout/GameLayout';
import { BALL_PERSONALITIES, getPersonalityById } from '../game/data/ballPersonalities';
import { soundManager } from '../game/services/SoundManager';
import { formatStatLabel } from '../game/systems/RecapSystem';
import type { MatchRecapData } from '../game/systems/MatchRecapSystem';
import type { BallStats } from '../game/types/BallTypes';
import { STAT_KEYS } from '../game/types/BallTypes';
import {
  truncateHoverText,
  type ScreenBounds,
} from './dialogueBubbleLayout';
import {
  clampPanelPosition,
  clearPanelPosition,
  computeDefaultPanelPosition,
  getPlayfieldScreenBounds,
  resolvePanelPosition,
  savePanelPosition,
  type PanelLayoutContext,
  type SavedPanelPosition,
} from './responsePanelLayout';
import {
  EMOTIONAL_RESPONSE_MODES,
  getEmotionalResponseMode,
  type EmotionalInventoryInteractionState,
  type EmotionalResponseMode,
  type EmotionalResponseModeId,
} from '../game/data/emotionalResponseModes';

const OPPONENT_BARK_DISPLAY_MS = 6400;
const OPPONENT_BARK_FADE_MS = 500;
const BALL_COMMENT_SCORE_HUD_CLEARANCE_PX = 96;
const BALL_COMMENT_PLAYFIELD_PADDING_PX = 12;

export class UIManager {
  private menuOverlay = document.getElementById('menu-overlay')!;
  private hud = document.getElementById('hud')!;
  private dialogueOverlay = document.getElementById('dialogue-overlay')!;
  private dialogueCluster = document.getElementById('dialogue-cluster')!;
  private dialogueDragHandle = document.getElementById('dialogue-drag-handle')!;
  private recapOverlay = document.getElementById('recap-overlay')!;
  private ballSelect = document.getElementById('ball-select')!;
  private opponentSelect = document.getElementById('opponent-select')!;
  private opponentBarkBubble = document.getElementById('opponent-bark-bubble')!;
  private onBallSelected?: (ballId: string) => void;
  private ballSelectHandler?: (ballId: string, playerSide: PaddleSide, opponentId: OpponentId) => void;
  private onEmotionalResponseSelected?: (mode: EmotionalResponseMode) => void;
  private onCustomResponseRequested?: () => void;
  private onCustomResponseSubmitted?: (text: string) => void;
  private onRecapRematch?: () => void;
  private onRecapChangeBall?: () => void;
  private onRecapChangeOpponent?: () => void;
  private onRecapMenu?: () => void;
  private onPauseToggle?: () => void;
  private onQuit?: () => void;
  private statsPanel = document.getElementById('stats-panel')!;
  private emotionalInventory = document.getElementById('emotional-inventory')!;
  private hudControlsEl = document.querySelector('.hud-controls') as HTMLElement;
  private pauseBtn = document.getElementById('hud-pause-btn') as HTMLButtonElement;
  private pauseBanner = document.getElementById('pause-banner')!;
  private debugToastTimer: ReturnType<typeof setTimeout> | null = null;
  private customInputVisible = false;
  /** Scene-owned interaction state; UIManager only renders it. */
  private emotionalInventoryState: EmotionalInventoryInteractionState = 'idle';
  private pendingEmotionalModeId: EmotionalResponseModeId | null = null;
  private emotionalInventoryRendered = false;
  private canvasBounds: ScreenBounds | null = null;
  private selectedPaddleSide: PaddleSide = getPlayerPaddleSide();
  private selectedOpponentId: OpponentId = getSelectedOpponentId();
  private matchIntro = document.getElementById('match-intro')!;
  private matchCountdown = document.getElementById('match-countdown')!;
  private pointFlash = document.getElementById('point-flash')!;
  private ballComment = document.getElementById('ball-comment')!;
  private ballCommentSpeaker = document.getElementById('ball-comment-speaker')!;
  private ballCommentText = document.getElementById('ball-comment-text')!;
  private ballCommentTimer: ReturnType<typeof setTimeout> | null = null;
  private activeBallId = 'orb';
  private playfieldScreenBounds: ScreenBounds | null = null;
  private lastBallCommentScreen: { x: number; y: number } | null = null;
  private ballCommentEndTime = 0;
  private opponentBarkTimer: ReturnType<typeof setTimeout> | null = null;
  private opponentBarkFadeTimer: ReturnType<typeof setTimeout> | null = null;
  private opponentBarkLayoutKey = '';
  private gameSize: { width: number; height: number } = {
    width: GAME_LAYOUT.CANVAS_WIDTH,
    height: GAME_LAYOUT.CANVAS_HEIGHT,
  };
  private layoutPlayerSide: PaddleSide = getPlayerPaddleSide();
  private draggingPanel = false;
  private dragOffsetX = 0;
  private dragOffsetY = 0;
  private dragMoved = false;
  private selectedEmotionalResponseModeId: EmotionalResponseModeId = 'validate';

  constructor() {
    this.renderBallSelect();
    this.renderOpponentSelect();
    this.setupPaddleSideSelector();
    this.setupDialogueDrag();
    this.ballSelect.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('.ball-card');
      if (!card) return;
      const ballId = card.dataset.ballId;
      if (ballId) {
        soundManager.unlock();
        soundManager.playMenuClick();
        this.handleBallSelect(ballId);
      }
    });

    document.getElementById('recap-rematch')!.addEventListener('click', () => {
      this.onRecapRematch?.();
    });
    document.getElementById('recap-change-ball')!.addEventListener('click', () => {
      this.onRecapChangeBall?.();
    });
    document.getElementById('recap-change-opponent')!.addEventListener('click', () => {
      this.onRecapChangeOpponent?.();
    });
    document.getElementById('recap-menu')!.addEventListener('click', () => {
      this.onRecapMenu?.();
    });

    document.getElementById('text-response-submit')!.addEventListener('click', () => {
      this.handleTextSubmit();
    });
    document.getElementById('text-response-input')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.handleTextSubmit();
        e.stopPropagation();
        return;
      }
      e.stopPropagation();
    });

    this.pauseBtn.addEventListener('click', () => this.onPauseToggle?.());
    document.getElementById('hud-quit-btn')!.addEventListener('click', () => this.onQuit?.());
    this.renderEmotionalInventoryOnce();
    this.setEmotionalInventoryState('idle');
    // Keyboard 1–9 is owned by PlayScene → selectEmotionalMode (not duplicated here).
  }

  setCallbacks(callbacks: {
    onBallSelected?: (ballId: string) => void;
    onEmotionalResponseSelected?: (mode: EmotionalResponseMode) => void;
    onCustomResponseRequested?: () => void;
    onCustomResponseSubmitted?: (text: string) => void;
    onRecapRematch?: () => void;
    onRecapChangeBall?: () => void;
    onRecapChangeOpponent?: () => void;
    onRecapMenu?: () => void;
    onPauseToggle?: () => void;
    onQuit?: () => void;
  }): void {
    if (callbacks.onBallSelected !== undefined) this.onBallSelected = callbacks.onBallSelected;
    if (callbacks.onEmotionalResponseSelected !== undefined) {
      this.onEmotionalResponseSelected = callbacks.onEmotionalResponseSelected;
    }
    if (callbacks.onCustomResponseRequested !== undefined) {
      this.onCustomResponseRequested = callbacks.onCustomResponseRequested;
    }
    if (callbacks.onCustomResponseSubmitted !== undefined) {
      this.onCustomResponseSubmitted = callbacks.onCustomResponseSubmitted;
    }
    if (callbacks.onRecapRematch !== undefined) this.onRecapRematch = callbacks.onRecapRematch;
    if (callbacks.onRecapChangeBall !== undefined) this.onRecapChangeBall = callbacks.onRecapChangeBall;
    if (callbacks.onRecapChangeOpponent !== undefined) {
      this.onRecapChangeOpponent = callbacks.onRecapChangeOpponent;
    }
    if (callbacks.onRecapMenu !== undefined) this.onRecapMenu = callbacks.onRecapMenu;
    if (callbacks.onPauseToggle !== undefined) this.onPauseToggle = callbacks.onPauseToggle;
    if (callbacks.onQuit !== undefined) this.onQuit = callbacks.onQuit;
  }

  setGameControlCallbacks(callbacks: {
    onPauseToggle?: () => void;
    onQuit?: () => void;
  }): void {
    if (callbacks.onPauseToggle !== undefined) this.onPauseToggle = callbacks.onPauseToggle;
    if (callbacks.onQuit !== undefined) this.onQuit = callbacks.onQuit;
  }

  setPaused(paused: boolean): void {
    this.pauseBtn.textContent = paused ? 'Play' : 'Pause';
    this.pauseBanner.classList.toggle('hidden', !paused);
  }

  resetGameControls(): void {
    this.setPaused(false);
  }

  setBallSelectHandler(
    handler: (ballId: string, playerSide: PaddleSide, opponentId: OpponentId) => void
  ): void {
    this.ballSelectHandler = handler;
  }

  getSelectedOpponentId(): OpponentId {
    return this.selectedOpponentId;
  }

  setSelectedOpponentId(opponentId: OpponentId): void {
    this.selectedOpponentId = opponentId;
    setSelectedOpponentId(opponentId);
    this.renderOpponentSelect();
  }

  getSelectedPaddleSide(): PaddleSide {
    return this.selectedPaddleSide;
  }

  private setupPaddleSideSelector(): void {
    const leftBtn = document.getElementById('paddle-left-btn') as HTMLButtonElement;
    const rightBtn = document.getElementById('paddle-right-btn') as HTMLButtonElement;

    const applySide = (side: PaddleSide) => {
      this.selectedPaddleSide = side;
      setPlayerPaddleSide(side);
      leftBtn.classList.toggle('side-btn-active', side === 'left');
      rightBtn.classList.toggle('side-btn-active', side === 'right');
    };

    applySide(getPlayerPaddleSide());

    leftBtn.addEventListener('click', () => {
      soundManager.unlock();
      soundManager.playMenuClick();
      applySide('left');
    });
    rightBtn.addEventListener('click', () => {
      soundManager.unlock();
      soundManager.playMenuClick();
      applySide('right');
    });
  }

  setSoundIndicator(enabled: boolean): void {
    const el = document.getElementById('sound-indicator');
    if (!el) return;
    el.textContent = enabled ? 'SOUND ON' : 'SOUND OFF';
    el.classList.toggle('sound-off', !enabled);
  }

  setCanvasBounds(bounds: ScreenBounds): void {
    this.canvasBounds = bounds;
    this.positionHoverBanner(bounds);
    if (!this.dialogueOverlay.classList.contains('hidden')) {
      this.positionDialogueCluster(false);
    }
  }

  syncPlayfieldLayout(
    canvasBounds: ScreenBounds,
    playfield: PlayfieldRect,
    gameSize: { width: number; height: number },
    options: { compactStats: boolean; playerSide: PaddleSide }
  ): void {
    this.gameSize = gameSize;
    this.layoutPlayerSide = options.playerSide;
    const scaleX = (canvasBounds.right - canvasBounds.left) / gameSize.width;
    const scaleY = (canvasBounds.bottom - canvasBounds.top) / gameSize.height;

    const hudLeft =
      canvasBounds.left +
      playfield.rightHudLeft * scaleX +
      GAME_LAYOUT.STATS_PANEL_GAP * scaleX;
    const hudTop = Math.max(
      // Keep stats below the top control row (min 36px hit area + gap).
      12 + 36 + 8,
      canvasBounds.top + (playfield.top + GAME_LAYOUT.STATS_PANEL_TOP_OFFSET) * scaleY
    );
    const panelWidth = GAME_LAYOUT.STATS_PANEL_WIDTH * scaleX;

    this.statsPanel.style.left = `${hudLeft}px`;
    this.statsPanel.style.top = `max(var(--hud-top-inset), ${hudTop}px)`;
    this.statsPanel.style.right = 'auto';
    this.statsPanel.style.width = `${panelWidth}px`;
    this.statsPanel.classList.toggle('stats-panel--compact', options.compactStats);

    if (this.hudControlsEl) {
      // Right HUD column + canvas-relative offset, clamped into the visible shell.
      // Stay clear of the centered scoreboard when the FIT canvas shrinks.
      let controlsLeft = hudLeft;
      const scoreboard = document.querySelector('.hud-top') as HTMLElement | null;
      if (scoreboard) {
        const scoreRight = scoreboard.getBoundingClientRect().right;
        controlsLeft = Math.max(controlsLeft, scoreRight + 8);
      }
      const controlsWidth = this.hudControlsEl.offsetWidth || 220;
      controlsLeft = Math.min(controlsLeft, Math.max(8, window.innerWidth - controlsWidth - 8));

      this.hudControlsEl.style.right = 'auto';
      this.hudControlsEl.style.left = `${controlsLeft}px`;
      this.hudControlsEl.style.top = `max(var(--hud-top-inset), ${canvasBounds.top + 12}px)`;
    }

    if (!this.dialogueOverlay.classList.contains('hidden')) {
      this.positionDialogueCluster(false);
    }

    const playfieldLeft = canvasBounds.left + playfield.left * scaleX;
    const playfieldRight = canvasBounds.left + playfield.right * scaleX;
    const playfieldTop = canvasBounds.top + playfield.top * scaleY;
    const playfieldBottom = canvasBounds.top + playfield.bottom * scaleY;
    this.playfieldScreenBounds = {
      left: playfieldLeft,
      top: playfieldTop,
      right: playfieldRight,
      bottom: playfieldBottom,
    };

    if (!this.ballComment.classList.contains('hidden')) {
      this.repositionBallComment();
    }
  }

  resetDialoguePanelPosition(): void {
    clearPanelPosition();
    this.positionDialogueCluster(true);
    this.showDebugToast('Panel reset');
  }

  isDraggingDialoguePanel(): boolean {
    return this.draggingPanel;
  }

  private setupDialogueDrag(): void {
    const resetBtn = document.getElementById('dialogue-panel-reset')!;
    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      this.resetDialoguePanelPosition();
    });

    this.dialogueDragHandle.addEventListener('pointerdown', (e) => {
      if ((e.target as HTMLElement).closest('button')) return;
      this.draggingPanel = true;
      this.dragMoved = false;
      const rect = this.dialogueCluster.getBoundingClientRect();
      this.dragOffsetX = e.clientX - rect.left;
      this.dragOffsetY = e.clientY - rect.top;
      this.dialogueDragHandle.setPointerCapture(e.pointerId);
    });

    this.dialogueDragHandle.addEventListener('pointermove', (e) => {
      if (!this.draggingPanel) return;
      this.dragMoved = true;
      const ctx = this.buildPanelLayoutContext();
      if (!ctx) return;
      const clamped = clampPanelPosition(
        { x: e.clientX - this.dragOffsetX, y: e.clientY - this.dragOffsetY },
        ctx
      );
      this.applyClusterPosition(clamped);
    });

    const endDrag = (e: PointerEvent) => {
      if (!this.draggingPanel) return;
      this.draggingPanel = false;
      if (this.dragMoved) {
        const rect = this.dialogueCluster.getBoundingClientRect();
        savePanelPosition({ x: rect.left, y: rect.top });
      }
      if (this.dialogueDragHandle.hasPointerCapture(e.pointerId)) {
        this.dialogueDragHandle.releasePointerCapture(e.pointerId);
      }
    };

    this.dialogueDragHandle.addEventListener('pointerup', endDrag);
    this.dialogueDragHandle.addEventListener('pointercancel', endDrag);
  }

  private buildPanelLayoutContext(): PanelLayoutContext | null {
    if (!this.canvasBounds) return null;
    const rect = this.dialogueCluster.getBoundingClientRect();
    return {
      canvasBounds: this.canvasBounds,
      playfieldScreen: getPlayfieldScreenBounds(this.canvasBounds, this.gameSize),
      playerSide: this.layoutPlayerSide,
      clusterWidth: rect.width || this.dialogueCluster.offsetWidth || 520,
      clusterHeight: rect.height || this.dialogueCluster.offsetHeight || 280,
    };
  }

  private applyClusterPosition(pos: SavedPanelPosition): void {
    this.dialogueCluster.style.left = `${pos.x}px`;
    this.dialogueCluster.style.top = `${pos.y}px`;
  }

  private positionDialogueCluster(preferDefault: boolean): void {
    const ctx = this.buildPanelLayoutContext();
    if (!ctx) return;

    this.dialogueCluster.style.visibility = 'hidden';
    const measured = this.dialogueCluster.getBoundingClientRect();
    ctx.clusterWidth = measured.width || ctx.clusterWidth;
    ctx.clusterHeight = measured.height || ctx.clusterHeight;

    let pos: SavedPanelPosition;
    if (preferDefault) {
      pos = clampPanelPosition(computeDefaultPanelPosition(ctx), ctx);
    } else {
      pos = resolvePanelPosition(ctx);
    }

    this.applyClusterPosition(pos);
    this.dialogueCluster.style.visibility = 'visible';
  }

  private handleBallSelect(ballId: string): void {
    if (this.ballSelectHandler) {
      this.ballSelectHandler(ballId, this.selectedPaddleSide, this.selectedOpponentId);
      return;
    }
    this.onBallSelected?.(ballId);
  }

  private renderOpponentSelect(): void {
    this.opponentSelect.innerHTML = '';
    for (const opponent of opponentMonologues) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'opponent-card';
      if (opponent.opponentId === this.selectedOpponentId) {
        btn.classList.add('opponent-card-active');
      }
      btn.dataset.opponentId = opponent.opponentId;
      btn.innerHTML = `
        <span class="opponent-card-name">${opponent.displayName}</span>
        <span class="opponent-card-summary">${opponent.personalitySummary}</span>
      `;
      btn.addEventListener('click', () => {
        soundManager.unlock();
        soundManager.playMenuClick();
        this.selectedOpponentId = opponent.opponentId;
        setSelectedOpponentId(opponent.opponentId);
        this.renderOpponentSelect();
      });
      this.opponentSelect.appendChild(btn);
    }
  }

  private renderBallSelect(): void {
    this.ballSelect.innerHTML = '';
    for (const ball of BALL_PERSONALITIES) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ball-card';
      btn.dataset.ballId = ball.id;
      btn.innerHTML = `
        <span class="ball-name">${ball.name}</span>
        <span class="ball-title">${ball.title}</span>
        <span class="ball-desc">${ball.description}</span>
      `;
      this.ballSelect.appendChild(btn);
    }
  }

  showMenu(): void {
    this.renderBallSelect();
    this.renderOpponentSelect();
    this.menuOverlay.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.hideEmotionalInventory();
    this.dialogueOverlay.classList.add('hidden');
    this.recapOverlay.classList.add('hidden');
    this.hideMatchOverlays();
    this.hideOutburst();
    this.hideOpponentBark();
  }

  showPlaying(ballId: string, ballName: string, opponentName: string, opponentShortName: string): void {
    this.activeBallId = ballId;
    this.applyBallCommentTheme();
    this.menuOverlay.classList.add('hidden');
    this.recapOverlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.showEmotionalInventory();
    this.hideMatchOverlays();
    this.resetGameControls();
    document.getElementById('stats-ball-name')!.textContent = ballName;
    document.getElementById('hud-ball-name')!.textContent = ballName;
    document.getElementById('hud-opponent-name')!.textContent = opponentName;
    document.getElementById('hud-opponent-label')!.textContent = opponentShortName;
  }

  updateMatchHUD(
    playerPoints: number,
    opponentPoints: number,
    rally: number,
    mode: InputMode,
    ballName: string,
    opponentName: string,
    opponentShortName: string
  ): void {
    document.getElementById('hud-player-points')!.textContent = String(playerPoints);
    document.getElementById('hud-opponent-points')!.textContent = String(opponentPoints);
    document.getElementById('hud-rally')!.textContent = String(rally);
    document.getElementById('hud-mode')!.textContent = mode === 'voice' ? 'VOICE' : 'TEXT';
    document.getElementById('hud-ball-name')!.textContent = ballName;
    document.getElementById('hud-opponent-name')!.textContent = opponentName;
    document.getElementById('hud-opponent-label')!.textContent = opponentShortName;
  }

  showMatchIntro(text: string): void {
    this.matchIntro.textContent = text;
    this.matchIntro.classList.remove('hidden');
  }

  hideMatchIntro(): void {
    this.matchIntro.classList.add('hidden');
  }

  showCountdown(text: string): void {
    this.matchCountdown.textContent = text;
    this.matchCountdown.classList.remove('hidden');
  }

  hideCountdown(): void {
    this.matchCountdown.classList.add('hidden');
  }

  showPointFlash(text: string): void {
    this.pointFlash.textContent = text;
    this.pointFlash.classList.remove('hidden');
  }

  hidePointFlash(): void {
    this.pointFlash.classList.add('hidden');
  }

  showBallComment(
    text: string,
    durationMs = 1800,
    ballScreen?: { x: number; y: number }
  ): void {
    const personality = getPersonalityById(this.activeBallId);
    this.ballCommentSpeaker.textContent = (personality?.name ?? 'Ball').toUpperCase();
    this.ballCommentText.textContent = text;
    this.applyBallCommentTheme();
    this.ballComment.classList.remove('hidden');
    this.ballComment.classList.remove('ball-comment--thinking');
    this.lastBallCommentScreen = ballScreen ?? null;
    this.repositionBallComment();
    if (this.ballCommentTimer) clearTimeout(this.ballCommentTimer);
    this.ballCommentEndTime = Date.now() + durationMs;
    this.ballCommentTimer = setTimeout(() => this.hideBallComment(), durationMs);
  }

  private applyBallCommentTheme(): void {
    const personality = getPersonalityById(this.activeBallId);
    const accent = personality?.accentColor ?? '#aa66ff';
    const glow = this.hexToRgba(accent, 0.28);
    const label = this.lightenHex(accent, 0.28);
    this.ballComment.style.setProperty('--ball-comment-accent', accent);
    this.ballComment.style.setProperty('--ball-comment-accent-label', label);
    this.ballComment.style.setProperty('--ball-comment-glow', glow);
  }

  private repositionBallComment(): void {
    if (this.ballComment.classList.contains('hidden')) return;

    const bounds = this.playfieldScreenBounds ?? this.canvasBounds;
    if (!bounds) return;

    const anchor = this.lastBallCommentScreen ?? {
      x: (bounds.left + bounds.right) / 2,
      y: (bounds.top + bounds.bottom) / 2,
    };

    this.positionBallCommentNearBall(anchor.x, anchor.y, bounds);
  }

  private positionBallCommentNearBall(
    ballScreenX: number,
    ballScreenY: number,
    playfieldBounds: ScreenBounds
  ): void {
    const bubble = this.ballComment;
    const padding = BALL_COMMENT_PLAYFIELD_PADDING_PX;
    const minTop = Math.max(
      playfieldBounds.top + padding,
      BALL_COMMENT_SCORE_HUD_CLEARANCE_PX
    );

    bubble.style.visibility = 'hidden';
    bubble.style.left = `${ballScreenX}px`;
    bubble.style.top = `${ballScreenY}px`;

    const bubbleWidth = bubble.offsetWidth || 300;
    const bubbleHeight = bubble.offsetHeight || 88;
    const tailGap = 10;

    const placeAbove = ballScreenY - bubbleHeight - tailGap - padding >= minTop;
    bubble.classList.toggle('ball-comment--below', !placeAbove);

    let top: number;
    let transform: string;

    if (placeAbove) {
      top = ballScreenY - tailGap;
      transform = 'translate(-50%, -100%)';
      top = Math.max(minTop + bubbleHeight, top);
      top = Math.min(top, playfieldBounds.bottom - padding);
    } else {
      top = ballScreenY + tailGap;
      transform = 'translate(-50%, 0)';
      top = Math.max(minTop, top);
      top = Math.min(top, playfieldBounds.bottom - padding - bubbleHeight);
    }

    let left = ballScreenX;
    const halfW = bubbleWidth / 2;
    const minX = playfieldBounds.left + padding + halfW;
    const maxX = playfieldBounds.right - padding - halfW;
    left = Math.min(maxX, Math.max(minX, left));

    bubble.style.left = `${left}px`;
    bubble.style.top = `${top}px`;
    bubble.style.transform = transform;
    bubble.style.visibility = 'visible';
  }

  private hexToRgba(hex: string, alpha: number): string {
    const normalized = hex.replace('#', '');
    const value =
      normalized.length === 3
        ? normalized
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : normalized;
    const r = Number.parseInt(value.slice(0, 2), 16);
    const g = Number.parseInt(value.slice(2, 4), 16);
    const b = Number.parseInt(value.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }

  private lightenHex(hex: string, amount: number): string {
    const normalized = hex.replace('#', '');
    const value =
      normalized.length === 3
        ? normalized
            .split('')
            .map((ch) => ch + ch)
            .join('')
        : normalized;
    const channels = [0, 2, 4].map((start) =>
      Number.parseInt(value.slice(start, start + 2), 16)
    );
    const lightened = channels.map((channel) =>
      Math.min(255, Math.round(channel + (255 - channel) * amount))
    );
    return `#${lightened.map((channel) => channel.toString(16).padStart(2, '0')).join('')}`;
  }

  /**
   * Extend the currently visible ball-comment bubble so it stays until
   * `newAbsoluteEndTimeMs` (epoch ms).  Never shortens an existing timer.
   * No-op if the bubble is already hidden.
   */
  extendBallComment(newAbsoluteEndTimeMs: number): void {
    if (this.ballComment.classList.contains('hidden')) return;
    if (newAbsoluteEndTimeMs <= this.ballCommentEndTime) return;
    if (this.ballCommentTimer) clearTimeout(this.ballCommentTimer);
    this.ballCommentEndTime = newAbsoluteEndTimeMs;
    const remaining = newAbsoluteEndTimeMs - Date.now();
    if (remaining > 0) {
      this.ballCommentTimer = setTimeout(() => this.hideBallComment(), remaining);
    } else {
      this.hideBallComment();
    }
  }

  hideBallComment(): void {
    this.ballComment.classList.add('hidden');
    this.ballComment.classList.remove('ball-comment--thinking');
    if (this.ballCommentTimer) {
      clearTimeout(this.ballCommentTimer);
      this.ballCommentTimer = null;
    }
  }

  hideMatchOverlays(): void {
    this.hideMatchIntro();
    this.hideCountdown();
    this.hidePointFlash();
    this.hideBallComment();
  }

  updateStats(stats: BallStats): void {
    for (const key of STAT_KEYS) {
      const el = document.getElementById(`stat-${key}`);
      if (el) el.style.width = `${stats[key]}%`;
    }
  }

  updateBallMeta(hoverType: string, mood: string): void {
    const hoverEl = document.getElementById('hud-hover-type');
    const moodEl = document.getElementById('hud-mood');
    if (hoverEl) hoverEl.textContent = hoverType || '—';
    if (moodEl) moodEl.textContent = mood;
  }

  getSelectedEmotionalResponseMode(): EmotionalResponseMode {
    return getEmotionalResponseMode(this.selectedEmotionalResponseModeId);
  }

  getEmotionalInventoryState(): EmotionalInventoryInteractionState {
    return this.emotionalInventoryState;
  }

  /**
   * Scene-owned state driver. UIManager only renders idle/ready/resolving.
   * Does not decide whether a response is valid.
   */
  setEmotionalInventoryState(state: EmotionalInventoryInteractionState): void {
    this.emotionalInventoryState = state;
    this.emotionalInventory.classList.remove(
      'emotional-inventory--idle',
      'emotional-inventory--ready',
      'emotional-inventory--resolving',
      'emotional-inventory--armed'
    );
    this.emotionalInventory.classList.add(`emotional-inventory--${state}`);
    this.emotionalInventory.setAttribute('aria-busy', state === 'resolving' ? 'true' : 'false');
    this.refreshEmotionalInventoryAppearance();
  }

  setPendingEmotionalMode(modeId: EmotionalResponseModeId | null): void {
    this.pendingEmotionalModeId = modeId;
    if (modeId) this.selectedEmotionalResponseModeId = modeId;
    this.refreshEmotionalInventoryAppearance();
  }

  clearPendingEmotionalMode(): void {
    this.pendingEmotionalModeId = null;
    this.refreshEmotionalInventoryAppearance();
  }

  /**
   * Forward a click on an inventory slot to the scene.
   * PlayScene.selectEmotionalMode owns READY checks and READY→RESOLVING.
   */
  private requestEmotionalMode(id: EmotionalResponseModeId): void {
    this.onEmotionalResponseSelected?.(getEmotionalResponseMode(id));
  }

  /** Render the nine inventory buttons once; updates are class/disabled only. */
  private renderEmotionalInventoryOnce(): void {
    if (this.emotionalInventoryRendered) return;

    const inventory = this.emotionalInventory;
    inventory.innerHTML = EMOTIONAL_RESPONSE_MODES.map(
      (mode) => `
      <button type="button" class="emotional-slot" data-mode-id="${mode.id}" title="${mode.description}" aria-pressed="false">
        <span class="emotional-slot-key">${mode.key}</span><span class="emotional-slot-label">${mode.label}</span>
      </button>
    `
    ).join('');

    inventory.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement | null)?.closest<HTMLButtonElement>('.emotional-slot');
      if (!button || button.disabled) return;
      const modeId = button.dataset.modeId as EmotionalResponseModeId | undefined;
      if (!modeId) return;
      this.requestEmotionalMode(modeId);
    });

    this.emotionalInventoryRendered = true;
    this.refreshEmotionalInventoryAppearance();
  }

  private refreshEmotionalInventoryAppearance(): void {
    if (!this.emotionalInventoryRendered) return;

    const interactive = this.emotionalInventoryState === 'ready';
    const buttons = this.emotionalInventory.querySelectorAll<HTMLButtonElement>('.emotional-slot');

    buttons.forEach((button) => {
      const modeId = button.dataset.modeId as EmotionalResponseModeId | undefined;
      if (!modeId) return;

      const isSelected = modeId === this.selectedEmotionalResponseModeId;
      const isPending = modeId === this.pendingEmotionalModeId;

      button.disabled = !interactive;
      button.setAttribute('aria-disabled', interactive ? 'false' : 'true');
      button.setAttribute('aria-pressed', isSelected || isPending ? 'true' : 'false');
      button.classList.toggle('emotional-slot-selected', isSelected && !isPending);
      button.classList.toggle('emotional-slot-pending', isPending);
    });
  }

  private logEmotionalInventoryLayout(): void {
    if (!import.meta.env.DEV) return;

    const rect = this.emotionalInventory.getBoundingClientRect();
    const computed = window.getComputedStyle(this.emotionalInventory);
    const ancestors: Array<{ element: string; overflow: string; display: string }> = [];
    let parent = this.emotionalInventory.parentElement;
    while (parent) {
      const parentStyle = window.getComputedStyle(parent);
      ancestors.push({
        element: parent.id ? `#${parent.id}` : parent.tagName.toLowerCase(),
        overflow: parentStyle.overflow,
        display: parentStyle.display,
      });
      parent = parent.parentElement;
    }

    console.log('[Emotional Inventory] HUD mounted', {
      boundingClientRect: {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
      className: this.emotionalInventory.className,
      state: this.emotionalInventoryState,
      computedDisplay: computed.display,
      computedVisibility: computed.visibility,
      computedZIndex: computed.zIndex,
      belowViewport: rect.top >= window.innerHeight || rect.bottom <= 0,
      clippedAncestors: ancestors.filter(({ overflow }) => overflow === 'hidden' || overflow === 'clip'),
      ancestors,
    });
  }

  private showEmotionalInventory(): void {
    this.renderEmotionalInventoryOnce();
    this.emotionalInventory.classList.remove('hidden');
    this.emotionalInventory.classList.toggle('emotional-inventory-dev-probe', import.meta.env.DEV);
    this.setEmotionalInventoryState(this.emotionalInventoryState);
    requestAnimationFrame(() => this.logEmotionalInventoryLayout());
  }

  private hideEmotionalInventory(): void {
    this.clearPendingEmotionalMode();
    this.setEmotionalInventoryState('idle');
    this.emotionalInventory.classList.add('hidden');
  }

  showDialogue(
    event: DialogueEvent,
    _mode: InputMode,
    _ballScreenX: number,
    _ballScreenY: number,
    isHover = false,
    hoverType = '',
    mood = '',
    canvasBounds?: ScreenBounds
  ): void {
    this.customInputVisible = false;
    if (canvasBounds) this.canvasBounds = canvasBounds;

    this.dialogueOverlay.classList.remove('hidden');
    document.getElementById('response-panel')!.classList.remove('hidden');

    document.getElementById('hover-banner')!.classList.toggle('hidden', !isHover);
    document.getElementById('ball-line')!.textContent = truncateHoverText(event.ballLine, 160);
    document.getElementById('ball-reaction')!.classList.add('hidden');
    document.getElementById('emotional-result')!.classList.add('hidden');
    document.getElementById('player-response-echo')!.classList.add('hidden');
    this.updateBallMeta(hoverType, mood);

    // Intentionally do not render event.responses as numbered buttons.
    // Legacy response data remains on the event for internal use only.
    this.renderDialogueResponsePaths();
    this.hideCustomInputArea();
    requestAnimationFrame(() => this.positionDialogueCluster(false));
  }

  /**
   * Dialogue responses are Emotional Inventory (1–9) or Custom Response only.
   * Preset canned-response buttons are not rendered.
   */
  private renderDialogueResponsePaths(): void {
    const choices = document.getElementById('response-choices')!;
    choices.classList.remove('hidden');
    choices.innerHTML = '';

    const hint = document.createElement('p');
    hint.className = 'response-hint';
    hint.textContent = 'Choose an emotional response below.';
    choices.appendChild(hint);

    const paths = document.createElement('div');
    paths.className = 'response-paths';

    const inventoryPath = document.createElement('div');
    inventoryPath.className = 'response-path response-path-inventory';
    inventoryPath.innerHTML =
      '<span class="response-path-label">Emotional Inventory</span>' +
      '<span class="response-path-detail">Press or click 1–9</span>';
    paths.appendChild(inventoryPath);

    const customBtn = document.createElement('button');
    customBtn.type = 'button';
    customBtn.className = 'response-path response-path-custom';
    customBtn.innerHTML =
      '<span class="response-path-label">Custom Response</span>' +
      '<span class="response-path-detail">Type your own reply</span>';
    customBtn.addEventListener('click', () => this.showCustomInput());
    paths.appendChild(customBtn);

    choices.appendChild(paths);
  }

  showCustomInput(): void {
    this.customInputVisible = true;
    document.getElementById('response-choices')!.classList.add('hidden');
    const area = document.getElementById('text-input-area')!;
    area.classList.remove('hidden');
    const input = document.getElementById('text-response-input') as HTMLInputElement;
    input.value = '';
    input.placeholder = 'Say something to the ball...';
    input.focus();
    this.onCustomResponseRequested?.();
  }

  hideCustomInputArea(): void {
    this.customInputVisible = false;
    document.getElementById('response-choices')!.classList.remove('hidden');
    const area = document.getElementById('text-input-area')!;
    area.classList.add('hidden');
    const input = document.getElementById('text-response-input') as HTMLInputElement;
    const submitBtn = document.getElementById('text-response-submit') as HTMLButtonElement;
    input.disabled = false;
    submitBtn.disabled = false;
  }

  showValentineThinking(message = 'Valentine is thinking', ballScreen?: { x: number; y: number }): void {
    this.ballCommentSpeaker.textContent = 'VALENTINE';
    this.ballCommentText.textContent = this.stripTrailingEllipsis(message);
    this.applyBallCommentTheme();
    this.ballComment.classList.remove('hidden');
    this.ballComment.classList.add('ball-comment--thinking');
    if (this.ballCommentTimer) {
      clearTimeout(this.ballCommentTimer);
      this.ballCommentTimer = null;
    }
    this.lastBallCommentScreen = ballScreen ?? null;
    this.repositionBallComment();
  }

  setValentineThinkingMessage(message: string): void {
    if (this.ballComment.classList.contains('hidden')) return;
    this.ballCommentText.textContent = this.stripTrailingEllipsis(message);
    this.repositionBallComment();
  }

  clearValentineThinking(): void {
    this.ballComment.classList.remove('ball-comment--thinking');
  }

  private stripTrailingEllipsis(message: string): string {
    return message.replace(/[.\u2026]+\s*$/, '').trimEnd();
  }

  showValentineHoverResult(emotionalResult: string, playerEcho?: string): void {
    document.getElementById('response-panel')!.classList.add('hidden');
    document.getElementById('ball-reaction')!.classList.add('hidden');
    document.getElementById('hover-banner')!.classList.add('hidden');

    if (playerEcho) {
      const echo = document.getElementById('player-response-echo')!;
      echo.textContent = `You: "${truncateHoverText(playerEcho, 100)}"`;
      echo.classList.remove('hidden');
    }

    const resultEl = document.getElementById('emotional-result')!;
    resultEl.textContent = emotionalResult;
    resultEl.classList.remove('hidden');
    requestAnimationFrame(() => this.positionDialogueCluster(false));
  }

  showCustomInputProcessing(): void {
    this.customInputVisible = false;
    document.getElementById('response-choices')!.classList.add('hidden');
    document.getElementById('ball-line')!.textContent = 'Ball is processing...';
    const input = document.getElementById('text-response-input') as HTMLInputElement;
    const submitBtn = document.getElementById('text-response-submit') as HTMLButtonElement;
    input.disabled = true;
    submitBtn.disabled = true;
  }

  showReaction(reaction: string, emotionalResult?: string, playerEcho?: string): void {
    document.getElementById('response-panel')!.classList.add('hidden');

    if (playerEcho) {
      const echo = document.getElementById('player-response-echo')!;
      echo.textContent = `You: "${truncateHoverText(playerEcho, 100)}"`;
      echo.classList.remove('hidden');
    }
    document.getElementById('ball-reaction')!.textContent = truncateHoverText(reaction, 140);
    document.getElementById('ball-reaction')!.classList.remove('hidden');
    document.getElementById('hover-banner')!.classList.add('hidden');

    const resultEl = document.getElementById('emotional-result')!;
    if (emotionalResult) {
      resultEl.textContent = emotionalResult;
      resultEl.classList.remove('hidden');
    }

    requestAnimationFrame(() => this.positionDialogueCluster(false));
  }

  hideDialogue(): void {
    this.dialogueOverlay.classList.add('hidden');
    document.getElementById('hover-banner')!.classList.add('hidden');
    document.getElementById('response-panel')!.classList.add('hidden');
    this.hideCustomInputArea();
  }

  suppressOpponentBarkForDialogue(): void {
    this.hideOpponentBark();
  }

  showOpponentBark(
    result: BarkResult,
    layoutInput: OpponentBarkLayoutInput
  ): void {
    document.getElementById('opponent-bark-name')!.textContent = result.displayName;
    document.getElementById('opponent-bark-text')!.textContent = truncateHoverText(result.text, 120);
    this.opponentBarkBubble.classList.remove('opponent-bark-fading');
    this.opponentBarkBubble.style.opacity = '';

    const visible = this.positionOpponentBark(layoutInput, true);
    if (!visible) {
      this.hideOpponentBark();
      return;
    }
    this.opponentBarkBubble.classList.remove('hidden');

    if (this.opponentBarkTimer) clearTimeout(this.opponentBarkTimer);
    if (this.opponentBarkFadeTimer) clearTimeout(this.opponentBarkFadeTimer);

    console.log(`[Opponent Bark] displayMs=${OPPONENT_BARK_DISPLAY_MS}`);

    this.opponentBarkFadeTimer = setTimeout(() => {
      this.opponentBarkBubble.classList.add('opponent-bark-fading');
    }, OPPONENT_BARK_DISPLAY_MS - OPPONENT_BARK_FADE_MS);

    this.opponentBarkTimer = setTimeout(() => this.hideOpponentBark(), OPPONENT_BARK_DISPLAY_MS);
  }

  /**
   * Re-time the opponent bark bubble once audio duration is known so it honours
   * max(5000ms, audio duration + 300ms). Ignored if the bubble is hidden or if
   * a different bark is now showing (guarded by the expected text).
   */
  setOpponentBarkDisplayDuration(displayMs: number, expectedText?: string): void {
    if (this.opponentBarkBubble.classList.contains('hidden')) return;

    if (expectedText !== undefined) {
      const currentText = document.getElementById('opponent-bark-text')?.textContent ?? '';
      if (currentText !== truncateHoverText(expectedText, 120)) return;
    }

    if (this.opponentBarkTimer) clearTimeout(this.opponentBarkTimer);
    if (this.opponentBarkFadeTimer) clearTimeout(this.opponentBarkFadeTimer);
    this.opponentBarkBubble.classList.remove('opponent-bark-fading');
    this.opponentBarkBubble.style.opacity = '';

    this.opponentBarkFadeTimer = setTimeout(() => {
      this.opponentBarkBubble.classList.add('opponent-bark-fading');
    }, Math.max(0, displayMs - OPPONENT_BARK_FADE_MS));

    this.opponentBarkTimer = setTimeout(() => this.hideOpponentBark(), displayMs);
  }

  updateOpponentBarkPosition(layoutInput: OpponentBarkLayoutInput): void {
    if (this.opponentBarkBubble.classList.contains('hidden')) return;
    const visible = this.positionOpponentBark(layoutInput, false);
    if (!visible) {
      this.hideOpponentBark();
    }
  }

  private positionOpponentBark(layoutInput: OpponentBarkLayoutInput, force: boolean): boolean {
    const layoutKey = getOpponentBarkLayoutKey(layoutInput);
    if (!force && layoutKey === this.opponentBarkLayoutKey) {
      return true;
    }

    this.opponentBarkLayoutKey = layoutKey;
    return layoutOpponentBarkBubble(layoutInput);
  }

  buildOpponentBarkLayout(
    opponentPaddleScreen: { x: number; y: number },
    opponentSide: PaddleSide,
    canvasBounds: ScreenBounds,
    playfield: { left: number; right: number; top: number; bottom: number },
    gameSize: { width: number; height: number },
    playerSide?: PaddleSide
  ): OpponentBarkLayoutInput {
    return buildOpponentBarkLayoutInput(
      this.opponentBarkBubble,
      opponentSide,
      opponentPaddleScreen,
      canvasBounds,
      playfield,
      gameSize,
      !this.dialogueOverlay.classList.contains('hidden'),
      playerSide
    );
  }

  hideOpponentBark(): void {
    this.opponentBarkBubble.classList.add('hidden');
    this.opponentBarkBubble.classList.remove('opponent-bark-fading');
    this.opponentBarkBubble.style.opacity = '';
    this.opponentBarkLayoutKey = '';
    if (this.opponentBarkTimer) {
      clearTimeout(this.opponentBarkTimer);
      this.opponentBarkTimer = null;
    }
    if (this.opponentBarkFadeTimer) {
      clearTimeout(this.opponentBarkFadeTimer);
      this.opponentBarkFadeTimer = null;
    }
  }

  showOutburst(label: string): void {
    const el = document.getElementById('outburst-label')!;
    el.textContent = label;
    el.classList.remove('outburst-side-left', 'outburst-side-right');
    el.classList.add(
      this.layoutPlayerSide === 'left' ? 'outburst-side-left' : 'outburst-side-right'
    );
    el.classList.remove('hidden');
  }

  hideOutburst(): void {
    document.getElementById('outburst-label')!.classList.add('hidden');
  }

  showDebugToast(message: string): void {
    const el = document.getElementById('debug-toast')!;
    el.textContent = message;
    el.classList.remove('hidden');
    if (this.debugToastTimer) clearTimeout(this.debugToastTimer);
    this.debugToastTimer = setTimeout(() => el.classList.add('hidden'), 2200);
  }

  showMatchRecap(
    data: MatchRecapData,
    callbacks: {
      onRematch?: () => void;
      onChangeBall?: () => void;
      onChangeOpponent?: () => void;
      onMainMenu?: () => void;
    }
  ): void {
    this.hud.classList.add('hidden');
    this.hideEmotionalInventory();
    this.dialogueOverlay.classList.add('hidden');
    this.recapOverlay.classList.remove('hidden');
    this.hideMatchOverlays();
    this.hideOutburst();
    this.hideOpponentBark();

    if (callbacks.onRematch !== undefined) this.onRecapRematch = callbacks.onRematch;
    if (callbacks.onChangeBall !== undefined) this.onRecapChangeBall = callbacks.onChangeBall;
    if (callbacks.onChangeOpponent !== undefined) {
      this.onRecapChangeOpponent = callbacks.onChangeOpponent;
    }
    if (callbacks.onMainMenu !== undefined) this.onRecapMenu = callbacks.onMainMenu;

    const title =
      data.winner === 'player' ? 'You Win!' : `${data.opponentShortName} Wins`;
    document.getElementById('match-recap-title')!.textContent = title;

    const statSummary = STAT_KEYS.map(
      (key) => `${formatStatLabel(key)} ${Math.round(data.finalStats[key])}`
    ).join(' · ');

    document.getElementById('recap-details')!.innerHTML = `
      <p>Final Score: <span class="highlight">YOU ${data.playerPoints} · ${data.opponentShortName} ${data.opponentPoints}</span></p>
      <p>Ball: <strong>${data.ballName}</strong> · Opponent: <strong>${data.opponentName}</strong></p>
      <p>Longest Rally: <span class="highlight">${data.longestRally}</span></p>
      <p class="recap-stats">Final Stats: ${statSummary}</p>
      <p class="recap-status">Relationship Status: <em>${data.relationshipStatus}</em></p>
      <p class="recap-diagnosis">${data.emotionalDiagnosis}</p>
      <p class="recap-stats">Peak: ${data.highestStatLabel} · Low: ${data.lowestStatLabel}</p>
    `;
    document.getElementById('recap-ball-note')!.textContent = `"${data.ballNote}"`;
    document.getElementById('recap-opponent-note')!.textContent = `"${data.opponentNote}"`;
  }

  private handleTextSubmit(): void {
    if (!this.customInputVisible) return;
    const input = document.getElementById('text-response-input') as HTMLInputElement;
    const text = input.value.trim();
    if (text) {
      this.onCustomResponseSubmitted?.(text);
      input.value = '';
    }
  }

  updateBubblePosition(_ballScreenX: number, _ballScreenY: number, canvasBounds?: ScreenBounds): void {
    if (canvasBounds) this.canvasBounds = canvasBounds;
  }

  private positionHoverBanner(bounds: ScreenBounds): void {
    const banner = document.getElementById('hover-banner');
    if (!banner) return;
    banner.style.left = `${(bounds.left + bounds.right) / 2}px`;
    banner.style.top = `${bounds.top + 18}px`;
    banner.style.transform = 'translate(-50%, 0)';
  }
}

export const uiManager = new UIManager();
