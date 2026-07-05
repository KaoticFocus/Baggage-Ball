import type { DialogueEvent, InputMode } from '../game/types/DialogueTypes';
import { BALL_PERSONALITIES } from '../game/data/ballPersonalities';
import { STAT_KEYS } from '../game/types/BallTypes';
import { formatStatLabel } from '../game/systems/RecapSystem';
import type { RecapData, BallStats } from '../game/types/BallTypes';

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
  private debugToastTimer: ReturnType<typeof setTimeout> | null = null;
  private customInputVisible = false;

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
  }

  setCallbacks(callbacks: {
    onBallSelected?: (ballId: string) => void;
    onResponseSelected?: (index: number) => void;
    onCustomResponseRequested?: () => void;
    onCustomResponseSubmitted?: (text: string) => void;
    onRecapPlayAgain?: () => void;
    onRecapMenu?: () => void;
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
  }

  setBallSelectHandler(handler: (ballId: string) => void): void {
    this.ballSelectHandler = handler;
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

  showDialogue(
    event: DialogueEvent,
    _mode: InputMode,
    ballScreenX: number,
    ballScreenY: number,
    isHover = false
  ): void {
    this.customInputVisible = false;
    this.dialogueOverlay.classList.remove('hidden');
    const bubble = document.getElementById('speech-bubble')!;
    bubble.style.left = `${ballScreenX}px`;
    bubble.style.top = `${ballScreenY - 90}px`;

    document.getElementById('hover-banner')!.classList.toggle('hidden', !isHover);
    document.getElementById('ball-line')!.textContent = event.ballLine;
    document.getElementById('ball-reaction')!.classList.add('hidden');
    document.getElementById('emotional-result')!.classList.add('hidden');
    document.getElementById('player-response-echo')!.classList.add('hidden');

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
  }

  showCustomInput(): void {
    this.customInputVisible = true;
    document.getElementById('response-choices')!.innerHTML = '';
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
    document.getElementById('text-input-area')!.classList.add('hidden');
  }

  showReaction(reaction: string, emotionalResult?: string, playerEcho?: string): void {
    if (playerEcho) {
      const echo = document.getElementById('player-response-echo')!;
      echo.textContent = `You: "${playerEcho}"`;
      echo.classList.remove('hidden');
    }
    document.getElementById('ball-reaction')!.textContent = reaction;
    document.getElementById('ball-reaction')!.classList.remove('hidden');
    document.getElementById('response-choices')!.innerHTML = '';
    this.hideCustomInputArea();
    document.getElementById('hover-banner')!.classList.add('hidden');

    const resultEl = document.getElementById('emotional-result')!;
    if (emotionalResult) {
      resultEl.textContent = emotionalResult;
      resultEl.classList.remove('hidden');
    }
  }

  hideDialogue(): void {
    this.dialogueOverlay.classList.add('hidden');
    document.getElementById('hover-banner')!.classList.add('hidden');
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

  updateBubblePosition(ballScreenX: number, ballScreenY: number): void {
    const bubble = document.getElementById('speech-bubble');
    if (bubble && !this.dialogueOverlay.classList.contains('hidden')) {
      bubble.style.left = `${ballScreenX}px`;
      bubble.style.top = `${ballScreenY - 90}px`;
    }
  }
}

export const uiManager = new UIManager();
