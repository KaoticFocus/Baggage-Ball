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
import type { EmotionalActionState } from '../game/data/emotionalActionConfig';

const OPPONENT_BARK_DISPLAY_MS = 6400;
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
  /** @deprecated Modal state — prefer emotionalActionState. */
  private emotionalInventoryState: EmotionalInventoryInteractionState = 'idle';
  /** Real-time Loadout HUD state owned by PlayScene, rendered here. */
  private emotionalActionState: EmotionalActionState = 'disabled';
  private pendingEmotionalModeId: EmotionalResponseModeId | null = null;
  private emotionalInventoryRendered = false;
  private emotionalCooldownBar = document.getElementById('emotional-cooldown-bar') as HTMLElement | null;
  private speechCaption = document.getElementById('speech-caption')!;
  private speechCaptionSpeaker = document.getElementById('speech-caption-speaker')!;
  private speechCaptionText = document.getElementById('speech-caption-text')!;
  private speechCaptionTimer: number | null = null;
  private speechCaptionFadeTimer: number | null = null;
  private canvasBounds: ScreenBounds | null = null;
  private selectedPaddleSide: PaddleSide = getPlayerPaddleSide();
  private selectedOpponentId: OpponentId = getSelectedOpponentId();
  private matchIntro = document.getElementById('match-intro')!;
  private matchCountdown = document.getElementById('match-countdown')!;
  private pointFlash = document.getElementById('point-flash')!;
  private ballComment = document.getElementById('ball-comment')!;
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
    document.getElementById('hud-quit-btn')!.addEventListener('click', () => {
      if (import.meta.env.DEV) {
        console.log('[UI] Quit button DOM click');
        console.log('[UI] Quit callback present', Boolean(this.onQuit));
      }
      this.onQuit?.();
    });
    this.renderEmotionalInventoryOnce();
    this.setEmotionalActionState('disabled');
    // Keyboard 1–9 is owned by PlayScene → useEmotionalAction (not duplicated here).
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

  /** Drop PlayScene-owned callbacks so a destroyed scene cannot receive UI events. */
  clearGameCallbacks(): void {
    this.onPauseToggle = undefined;
    this.onQuit = undefined;
    this.onEmotionalResponseSelected = undefined;
    this.onCustomResponseRequested = undefined;
    this.onCustomResponseSubmitted = undefined;
    this.onRecapRematch = undefined;
    this.onRecapChangeBall = undefined;
    this.onRecapChangeOpponent = undefined;
    this.onRecapMenu = undefined;
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
    options: { playerSide: PaddleSide }
  ): void {
    this.gameSize = gameSize;
    this.layoutPlayerSide = options.playerSide;
    const scaleX = (canvasBounds.right - canvasBounds.left) / gameSize.width;
    const scaleY = (canvasBounds.bottom - canvasBounds.top) / gameSize.height;

    // Bottom stats strip: centered under the canvas, shell padding reserves the band.
    const canvasWidth = canvasBounds.right - canvasBounds.left;
    this.statsPanel.style.left = `${canvasBounds.left}px`;
    this.statsPanel.style.width = `${canvasWidth}px`;
    this.statsPanel.style.right = 'auto';
    this.statsPanel.style.top = 'auto';
    this.statsPanel.style.bottom = 'max(8px, env(safe-area-inset-bottom, 0px))';

    if (this.hudControlsEl) {
      // Top-right of the canvas, clear of the centered scoreboard.
      const controlsWidth = this.hudControlsEl.offsetWidth || 220;
      let controlsLeft = canvasBounds.right - controlsWidth - 8;
      const scoreboard = document.querySelector('.hud-top') as HTMLElement | null;
      if (scoreboard) {
        const scoreRight = scoreboard.getBoundingClientRect().right;
        controlsLeft = Math.max(controlsLeft, scoreRight + 8);
      }
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

  showMenu(options?: { focusOpponent?: boolean }): void {
    this.renderBallSelect();
    this.renderOpponentSelect();
    this.menuOverlay.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.statsPanel.classList.add('hidden');
    this.hideEmotionalInventory();
    this.dialogueOverlay.classList.add('hidden');
    this.hideMatchRecap();
    this.hideMatchOverlays();
    this.hideOutburst();
    this.hideOpponentBark();
    this.hideBallComment();
    this.hideSpeechCaption();
    this.pauseBanner.classList.add('hidden');
    this.resetGameControls();
    // Drop any destroyed PlayScene callbacks — menu must not depend on PlayScene teardown.
    this.clearGameCallbacks();
    if (options?.focusOpponent) {
      requestAnimationFrame(() => {
        document.querySelector('.opponent-select-section')?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
      });
    }
  }

  hideMatchRecap(): void {
    this.recapOverlay.classList.add('hidden');
  }

  showPlaying(ballId: string, ballName: string, opponentName: string, opponentShortName: string): void {
    this.activeBallId = ballId;
    this.applyBallCommentTheme();
    this.menuOverlay.classList.add('hidden');
    this.hideMatchRecap();
    this.hud.classList.remove('hidden');
    this.statsPanel.classList.remove('hidden');
    this.statsPanel.classList.toggle('stats-panel--orb', ballId === 'orb');
    this.statsPanel.classList.toggle('stats-panel--bolt', ballId === 'bolt');
    this.statsPanel.classList.toggle('stats-panel--valentine', ballId === 'valentine');
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
    _ballScreen?: { x: number; y: number }
  ): void {
    // Prefer lightweight captions over playfield speech bubbles.
    const personality = getPersonalityById(this.activeBallId);
    this.showSpeechCaption(personality?.name ?? 'Ball', text, Math.max(durationMs, 2800));
    this.hideBallComment();
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
      const value = Math.max(0, Math.min(100, stats[key]));
      const el = document.getElementById(`stat-${key}`);
      if (el) {
        el.style.height = `${value}%`;
        el.style.width = '100%';
      }
      const valueEl = document.getElementById(`stat-${key}-value`);
      if (valueEl) valueEl.textContent = String(Math.round(value));
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

  getEmotionalActionState(): EmotionalActionState {
    return this.emotionalActionState;
  }

  /**
   * @deprecated Prefer setEmotionalActionState for real-time Loadout.
   */
  setEmotionalInventoryState(state: EmotionalInventoryInteractionState): void {
    this.emotionalInventoryState = state;
    const mapped: EmotionalActionState =
      state === 'ready' ? 'available' : state === 'resolving' ? 'cooldown' : 'disabled';
    this.setEmotionalActionState(mapped);
  }

  /** Scene-owned Loadout state driver. UIManager only renders. */
  setEmotionalActionState(state: EmotionalActionState): void {
    this.emotionalActionState = state;
    this.emotionalInventoryState =
      state === 'available' ? 'ready' : state === 'cooldown' ? 'resolving' : 'idle';
    this.emotionalInventory.classList.remove(
      'emotional-inventory--idle',
      'emotional-inventory--ready',
      'emotional-inventory--resolving',
      'emotional-inventory--armed',
      'emotional-inventory--available',
      'emotional-inventory--cooldown',
      'emotional-inventory--disabled'
    );
    this.emotionalInventory.classList.add(`emotional-inventory--${state}`);
    this.emotionalInventory.setAttribute('aria-busy', state === 'cooldown' ? 'true' : 'false');
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

  pulseEmotionalMode(modeId: EmotionalResponseModeId): void {
    const button = this.emotionalInventory.querySelector<HTMLButtonElement>(
      `.emotional-slot[data-mode-id="${modeId}"]`
    );
    if (!button) return;
    button.classList.remove('emotional-slot-accepted');
    void button.offsetWidth;
    button.classList.add('emotional-slot-accepted');
    window.setTimeout(() => button.classList.remove('emotional-slot-accepted'), 500);
  }

  /** Cooldown fill 1→0 over the remaining fraction. */
  setEmotionalCooldownProgress(remaining01: number): void {
    if (!this.emotionalCooldownBar) return;
    const clamped = Math.max(0, Math.min(1, remaining01));
    if (clamped <= 0 || this.emotionalActionState !== 'cooldown') {
      this.emotionalCooldownBar.classList.add('hidden');
      this.emotionalCooldownBar.style.transform = 'scaleX(0)';
      return;
    }
    this.emotionalCooldownBar.classList.remove('hidden');
    this.emotionalCooldownBar.style.transform = `scaleX(${clamped})`;
  }

  showSpeechCaption(speaker: string, text: string, holdMs = 4200): void {
    const trimmed = text.replace(/\s+/g, ' ').trim();
    if (!trimmed) return;

    if (this.speechCaptionTimer) window.clearTimeout(this.speechCaptionTimer);
    if (this.speechCaptionFadeTimer) window.clearTimeout(this.speechCaptionFadeTimer);

    this.speechCaptionSpeaker.textContent = speaker;
    this.speechCaptionText.textContent = trimmed;
    this.speechCaption.classList.remove('hidden', 'speech-caption--fade');

    this.speechCaptionTimer = window.setTimeout(() => {
      this.speechCaption.classList.add('speech-caption--fade');
      this.speechCaptionFadeTimer = window.setTimeout(() => {
        this.speechCaption.classList.add('hidden');
        this.speechCaption.classList.remove('speech-caption--fade');
      }, 220);
    }, holdMs);
  }

  hideSpeechCaption(): void {
    if (this.speechCaptionTimer) window.clearTimeout(this.speechCaptionTimer);
    if (this.speechCaptionFadeTimer) window.clearTimeout(this.speechCaptionFadeTimer);
    this.speechCaption.classList.add('hidden');
    this.speechCaption.classList.remove('speech-caption--fade');
  }

  /**
   * Forward a click on an inventory slot to the scene.
   * PlayScene.useEmotionalAction owns availability / cooldown.
   */
  private requestEmotionalMode(id: EmotionalResponseModeId): void {
    this.onEmotionalResponseSelected?.(getEmotionalResponseMode(id));
  }

  /** Render the nine inventory buttons once; updates are class/disabled only. */
  private renderEmotionalInventoryOnce(): void {
    if (this.emotionalInventoryRendered) return;

    const inventory = this.emotionalInventory;
    const slots = EMOTIONAL_RESPONSE_MODES.map(
      (mode) => `
      <button type="button" class="emotional-slot" data-mode-id="${mode.id}" title="${mode.description}" aria-pressed="false">
        <span class="emotional-slot-key">${mode.key}</span><span class="emotional-slot-label">${mode.label}</span>
      </button>
    `
    ).join('');
    inventory.innerHTML =
      slots +
      '<div id="emotional-cooldown-bar" class="emotional-cooldown-bar hidden" aria-hidden="true"></div>';
    this.emotionalCooldownBar = document.getElementById('emotional-cooldown-bar');

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

    const interactive = this.emotionalActionState === 'available';
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

  private showEmotionalInventory(): void {
    // Loadout weapon stack lives in Phaser behind the player paddle.
    // Keep the DOM mount for cooldown mirror / a11y hooks, but never show the bottom bar.
    this.renderEmotionalInventoryOnce();
    this.emotionalInventory.classList.add('hidden');
    this.emotionalInventory.classList.add('emotional-inventory--weapon-mirror');
    this.setEmotionalActionState('available');
  }

  private hideEmotionalInventory(): void {
    this.clearPendingEmotionalMode();
    this.setEmotionalActionState('disabled');
    this.setEmotionalCooldownProgress(0);
    this.emotionalInventory.classList.add('hidden');
    this.hideSpeechCaption();
  }

  /**
   * Legacy modal dialogue entry — disabled for real-time Loadout gameplay.
   * Captions + VoiceDirector carry spoken lines; the overlay stays hidden.
   */
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
    this.dialogueOverlay.classList.add('hidden');
    this.updateBallMeta(hoverType, mood);
    // Surface the line as a caption only — never open the modal dialogue UI.
    if (event.ballLine?.trim()) {
      this.showSpeechCaption(
        document.getElementById('hud-ball-name')?.textContent?.trim() || 'Ball',
        truncateHoverText(event.ballLine, 160)
      );
    }
    void isHover;
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

  showValentineThinking(message = 'Valentine is thinking', _ballScreen?: { x: number; y: number }): void {
    // Captions only — no playfield thinking bubble.
    this.hideBallComment();
    this.showSpeechCaption('Valentine', this.stripTrailingEllipsis(message), 4200);
  }

  setValentineThinkingMessage(message: string): void {
    this.showSpeechCaption('Valentine', this.stripTrailingEllipsis(message), 4200);
  }

  clearValentineThinking(): void {
    this.ballComment.classList.remove('ball-comment--thinking');
  }

  private stripTrailingEllipsis(message: string): string {
    return message.replace(/[.\u2026]+\s*$/, '').trimEnd();
  }

  showValentineHoverResult(emotionalResult: string, playerEcho?: string): void {
    this.dialogueOverlay.classList.add('hidden');
    const line = playerEcho
      ? `${truncateHoverText(playerEcho, 80)} → ${truncateHoverText(emotionalResult, 100)}`
      : truncateHoverText(emotionalResult, 140);
    this.showSpeechCaption(
      document.getElementById('hud-ball-name')?.textContent?.trim() || 'Valentine',
      line,
      3600
    );
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
    this.dialogueOverlay.classList.add('hidden');
    const parts = [
      playerEcho ? `You: ${truncateHoverText(playerEcho, 70)}` : '',
      truncateHoverText(reaction, 120),
      emotionalResult ? truncateHoverText(emotionalResult, 80) : '',
    ].filter(Boolean);
    this.showSpeechCaption(
      document.getElementById('hud-ball-name')?.textContent?.trim() || 'Ball',
      parts.join(' · '),
      3800
    );
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
    _layoutInput: OpponentBarkLayoutInput
  ): void {
    // Captions only during rally — no playfield thought-bubble overlay.
    this.hideOpponentBark();
    this.showSpeechCaption(
      result.displayName,
      truncateHoverText(result.text, 140),
      OPPONENT_BARK_DISPLAY_MS
    );
  }

  /**
   * Re-time the opponent caption once audio duration is known.
   * Legacy bark bubble stays hidden.
   */
  setOpponentBarkDisplayDuration(displayMs: number, expectedText?: string): void {
    if (expectedText !== undefined) {
      const current = this.speechCaptionText.textContent ?? '';
      if (current !== truncateHoverText(expectedText, 140) && current !== expectedText) {
        return;
      }
    }
    const speaker = this.speechCaptionSpeaker.textContent?.trim() || 'Opponent';
    const text = this.speechCaptionText.textContent?.trim();
    if (!text) return;
    this.showSpeechCaption(speaker, text, Math.max(displayMs, OPPONENT_BARK_DISPLAY_MS));
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
    this.statsPanel.classList.add('hidden');
    this.hideEmotionalInventory();
    this.dialogueOverlay.classList.add('hidden');
    this.hideMatchOverlays();
    this.hideOutburst();
    this.hideOpponentBark();
    this.hideBallComment();
    this.hideSpeechCaption();
    this.menuOverlay.classList.add('hidden');
    this.recapOverlay.classList.remove('hidden');
    // Ensure the action row is reachable even when the diagnosis text is long.
    requestAnimationFrame(() => {
      const actions = this.recapOverlay.querySelector('.match-recap-actions');
      actions?.scrollIntoView({ block: 'nearest' });
    });

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
