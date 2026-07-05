import type { DialogueEvent, InputMode } from '../game/types/DialogueTypes';
import { BALL_PERSONALITIES } from '../game/data/ballPersonalities';
import { STAT_KEYS } from '../game/types/BallTypes';
import { formatStatLabel } from '../game/systems/RecapSystem';
import type { RecapData, BallStats } from '../game/types/BallTypes';
import {
  positionDialogueBubbleNearBall,
  truncateHoverText,
  type ScreenBounds,
} from './dialogueBubbleLayout';

export class UIManager {
  private menuOverlay = document.getElementById('menu-overlay')!;
  private hud = document.getElementById('hud')!;
  private dialogueOverlay = document.getElementById('dialogue-overlay')!;
  private recapOverlay = document.getElementById('recap-overlay')!;
  private ballSelect = document.getElementById('ball-select')!;
  private onBallSelected?: (ballId: string) => void;
  private ballSelectHandler?: (ballId: string) => void;
  private onResponseSelected?: (index: number) => void;
  private onCustomResponseRequested?: () => void;
  private onCustomResponseSubmitted?: (text: string) => void;
  private onRecapPlayAgain?: () => void;
  private onRecapMenu?: () => void;
  private onPauseToggle?: () => void;
  private onQuit?: () => void;
  private pauseBtn = document.getElementById('hud-pause-btn') as HTMLButtonElement;
  private pauseBanner = document.getElementById('pause-banner')!;
  private debugToastTimer: ReturnType<typeof setTimeout> | null = null;
  private customInputVisible = false;
  private canvasBounds: ScreenBounds | null = null;
  private lastBallScreen = { x: 0, y: 0 };

  constructor() {
    this.renderBallSelect();
    this.ballSelect.addEventListener('click', (e) => {
      const card = (e.target as HTMLElement).closest<HTMLButtonElement>('.ball-card');
      if (!card) return;
      const ballId = card.dataset.ballId;
      if (ballId) this.handleBallSelect(ballId);
    });

    document.getElementById('recap-play-again')!.addEventListener('click', () => {
      this.onRecapPlayAgain?.();
    });
    document.getElementById('recap-menu')!.addEventListener('click', () => {
      this.onRecapMenu?.();
    });

    document.getElementById('text-response-submit')!.addEventListener('click', () => {
      this.handleTextSubmit();
    });
    document.getElementById('text-response-input')!.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') this.handleTextSubmit();
    });

    this.pauseBtn.addEventListener('click', () => this.onPauseToggle?.());
    document.getElementById('hud-quit-btn')!.addEventListener('click', () => this.onQuit?.());
  }

  setCallbacks(callbacks: {
    onBallSelected?: (ballId: string) => void;
    onResponseSelected?: (index: number) => void;
    onCustomResponseRequested?: () => void;
    onCustomResponseSubmitted?: (text: string) => void;
    onRecapPlayAgain?: () => void;
    onRecapMenu?: () => void;
    onPauseToggle?: () => void;
    onQuit?: () => void;
  }): void {
    if (callbacks.onBallSelected !== undefined) this.onBallSelected = callbacks.onBallSelected;
    if (callbacks.onResponseSelected !== undefined) this.onResponseSelected = callbacks.onResponseSelected;
    if (callbacks.onCustomResponseRequested !== undefined) {
      this.onCustomResponseRequested = callbacks.onCustomResponseRequested;
    }
    if (callbacks.onCustomResponseSubmitted !== undefined) {
      this.onCustomResponseSubmitted = callbacks.onCustomResponseSubmitted;
    }
    if (callbacks.onRecapPlayAgain !== undefined) this.onRecapPlayAgain = callbacks.onRecapPlayAgain;
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

  setBallSelectHandler(handler: (ballId: string) => void): void {
    this.ballSelectHandler = handler;
  }

  setCanvasBounds(bounds: ScreenBounds): void {
    this.canvasBounds = bounds;
    this.positionHoverBanner(bounds);
    if (!this.dialogueOverlay.classList.contains('hidden')) {
      this.repositionBubble();
    }
  }

  private handleBallSelect(ballId: string): void {
    if (this.ballSelectHandler) {
      this.ballSelectHandler(ballId);
      return;
    }
    this.onBallSelected?.(ballId);
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
    this.menuOverlay.classList.remove('hidden');
    this.hud.classList.add('hidden');
    this.dialogueOverlay.classList.add('hidden');
    this.recapOverlay.classList.add('hidden');
    this.hideOutburst();
  }

  showPlaying(ballName: string): void {
    this.menuOverlay.classList.add('hidden');
    this.recapOverlay.classList.add('hidden');
    this.hud.classList.remove('hidden');
    this.resetGameControls();
    document.getElementById('stats-ball-name')!.textContent = ballName;
  }

  updateHUD(score: number, combo: number, rally: number, mode: InputMode): void {
    document.getElementById('hud-score')!.textContent = String(score);
    document.getElementById('hud-combo')!.textContent = String(combo);
    document.getElementById('hud-rally')!.textContent = String(rally);
    document.getElementById('hud-mode')!.textContent = mode === 'voice' ? 'VOICE' : 'TEXT';
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

  showDialogue(
    event: DialogueEvent,
    _mode: InputMode,
    ballScreenX: number,
    ballScreenY: number,
    isHover = false,
    hoverType = '',
    mood = '',
    canvasBounds?: ScreenBounds
  ): void {
    this.customInputVisible = false;
    this.lastBallScreen = { x: ballScreenX, y: ballScreenY };
    if (canvasBounds) this.canvasBounds = canvasBounds;

    this.dialogueOverlay.classList.remove('hidden');
    document.getElementById('response-panel')!.classList.remove('hidden');

    document.getElementById('hover-banner')!.classList.toggle('hidden', !isHover);
    document.getElementById('ball-line')!.textContent = truncateHoverText(event.ballLine, 160);
    document.getElementById('ball-reaction')!.classList.add('hidden');
    document.getElementById('emotional-result')!.classList.add('hidden');
    document.getElementById('player-response-echo')!.classList.add('hidden');
    this.updateBallMeta(hoverType, mood);

    const choices = document.getElementById('response-choices')!;
    choices.innerHTML = '';
    event.responses.forEach((response, i) => {
      const btn = document.createElement('button');
      btn.className = 'response-btn';
      btn.innerHTML = `<span class="response-key">${i + 1}</span>${response.text}`;
      btn.addEventListener('click', () => this.onResponseSelected?.(i));
      choices.appendChild(btn);
    });

    const customBtn = document.createElement('button');
    customBtn.className = 'response-btn response-btn-custom';
    customBtn.innerHTML = `<span class="response-key">✎</span>Type my own response`;
    customBtn.addEventListener('click', () => this.showCustomInput());
    choices.appendChild(customBtn);

    this.hideCustomInputArea();
    requestAnimationFrame(() => this.repositionBubble());
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
    document.getElementById('text-input-area')!.classList.add('hidden');
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

    requestAnimationFrame(() => this.repositionBubble());
  }

  hideDialogue(): void {
    this.dialogueOverlay.classList.add('hidden');
    document.getElementById('hover-banner')!.classList.add('hidden');
    document.getElementById('response-panel')!.classList.add('hidden');
    this.hideCustomInputArea();
  }

  showOutburst(label: string): void {
    const el = document.getElementById('outburst-label')!;
    el.textContent = label;
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

  showRecap(data: RecapData): void {
    this.hud.classList.add('hidden');
    this.dialogueOverlay.classList.add('hidden');
    this.recapOverlay.classList.remove('hidden');
    this.hideOutburst();

    const aiTag = data.aiGenerated ? '<p class="recap-ai-tag">AI-generated recap</p>' : '';

    document.getElementById('recap-details')!.innerHTML = `
      ${aiTag}
      <p><strong>${data.ballName}</strong></p>
      <p>Final Score: <span class="highlight">${data.score}</span></p>
      <p>Longest Rally: <span class="highlight">${data.longestRally}</span></p>
      <p class="recap-status">Relationship Status: <em>${data.relationshipStatus}</em></p>
      <p class="recap-diagnosis">${data.emotionalDiagnosis}</p>
      ${data.worstThingThePlayerDid ? `<p class="recap-worst">Worst Thing You Did: ${data.worstThingThePlayerDid}</p>` : ''}
      <p class="recap-stats">Highest: ${formatStatLabel(data.highestStat.key)} (${Math.round(data.highestStat.value)}) · Lowest: ${formatStatLabel(data.lowestStat.key)} (${Math.round(data.lowestStat.value)})</p>
    `;
    document.getElementById('recap-ball-note')!.textContent = `"${data.note}"`;
    const hookEl = document.getElementById('recap-replay-hook');
    if (hookEl) {
      hookEl.textContent = data.replayHook ?? '';
      hookEl.classList.toggle('hidden', !data.replayHook);
    }
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

  updateBubblePosition(ballScreenX: number, ballScreenY: number, canvasBounds?: ScreenBounds): void {
    this.lastBallScreen = { x: ballScreenX, y: ballScreenY };
    if (canvasBounds) this.canvasBounds = canvasBounds;
    if (!this.dialogueOverlay.classList.contains('hidden')) {
      this.repositionBubble();
    }
  }

  private repositionBubble(): void {
    if (!this.canvasBounds) return;
    const bubble = document.getElementById('speech-bubble');
    if (!bubble) return;
    positionDialogueBubbleNearBall(
      this.lastBallScreen.x,
      this.lastBallScreen.y,
      bubble,
      this.canvasBounds
    );
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
