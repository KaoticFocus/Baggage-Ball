import type {
  OpponentBarkSituation,
  OpponentGameplayModifier,
  OpponentId,
} from '../types/OpponentTypes';
import { getOpponentProfile, opponentMonologues } from '../data/opponentMonologues';

export type BarkResult = {
  text: string;
  displayName: string;
  modifier: OpponentGameplayModifier;
  situation: OpponentBarkSituation;
};

const PRIORITY_SITUATIONS = new Set<OpponentBarkSituation>([
  'matchStart',
  'playerScores',
  'opponentScores',
  'playerMisses',
  'opponentMisses',
  'pausePressed',
  'quitPressed',
  'ballHoverStarts',
  'ballHoverEnds',
]);

const HOVER_SITUATIONS = new Set<OpponentBarkSituation>(['ballHoverStarts', 'ballHoverEnds']);

export class OpponentBarkSystem {
  private opponentId: OpponentId;
  private lastGlobalBarkAt = 0;
  private nextRandomAt = 0;
  private situationCooldowns = new Map<string, number>();
  private ballHoverActive = false;
  private hoverReactionUsed = false;
  private matchStartUsed = false;
  private lowScoreBarked = false;
  private highScoreBarked = false;
  private countdownActive = false;
  private timeAdjustmentMs = 0;
  private pausedAt: number | null = null;
  private onShowBark?: (result: BarkResult) => void;
  private onApplyModifier?: (modifier: OpponentGameplayModifier) => void;

  constructor(opponentId: OpponentId) {
    this.opponentId = opponentId;
    this.scheduleNextRandom();
  }

  setCallbacks(callbacks: {
    onShowBark?: (result: BarkResult) => void;
    onApplyModifier?: (modifier: OpponentGameplayModifier) => void;
  }): void {
    this.onShowBark = callbacks.onShowBark;
    this.onApplyModifier = callbacks.onApplyModifier;
  }

  setOpponentId(opponentId: OpponentId): void {
    this.opponentId = opponentId;
    this.situationCooldowns.clear();
    this.hoverReactionUsed = false;
    this.matchStartUsed = false;
    this.lowScoreBarked = false;
    this.highScoreBarked = false;
    this.scheduleNextRandom();
  }

  getOpponentId(): OpponentId {
    return this.opponentId;
  }

  getDisplayName(): string {
    return getOpponentProfile(this.opponentId).displayName;
  }

  cycleOpponent(): OpponentId {
    const ids = opponentMonologues.map((o) => o.opponentId);
    const idx = ids.indexOf(this.opponentId);
    const next = ids[(idx + 1) % ids.length];
    this.setOpponentId(next);
    return next;
  }

  setBallHoverActive(active: boolean): void {
    this.ballHoverActive = active;
    if (!active) {
      this.hoverReactionUsed = false;
    }
  }

  setCountdownActive(active: boolean): void {
    this.countdownActive = active;
  }

  pauseTimers(): void {
    if (this.pausedAt === null) {
      this.pausedAt = performance.now();
    }
  }

  resumeTimers(): void {
    if (this.pausedAt !== null) {
      this.timeAdjustmentMs += performance.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  resetForRally(): void {
    this.lowScoreBarked = false;
    this.highScoreBarked = false;
    this.scheduleNextRandom();
  }

  resetForMatch(): void {
    this.lastGlobalBarkAt = 0;
    this.situationCooldowns.clear();
    this.hoverReactionUsed = false;
    this.matchStartUsed = false;
    this.lowScoreBarked = false;
    this.highScoreBarked = false;
    this.lastChaosBarkAt = 0;
    this.ballHoverActive = false;
    this.countdownActive = false;
    this.timeAdjustmentMs = 0;
    this.pausedAt = null;
    this.scheduleNextRandom();
  }

  private lastChaosBarkAt = 0;

  update(
    deltaMs: number,
    playerPoints: number,
    opponentPoints: number,
    chaosHigh: boolean
  ): void {
    if (this.ballHoverActive || this.countdownActive) return;

    this.nextRandomAt -= deltaMs;
    if (this.nextRandomAt <= 0) {
      this.tryBark('randomGameplay');
      this.scheduleNextRandom();
    }

    if (!this.lowScoreBarked && opponentPoints >= playerPoints + 2) {
      this.tryBark('lowScore');
      this.lowScoreBarked = true;
    }
    if (!this.highScoreBarked && playerPoints >= opponentPoints + 2) {
      this.tryBark('highScore');
      this.highScoreBarked = true;
    }

    const now = this.gameNow();
    if (chaosHigh && now - this.lastChaosBarkAt > 9000) {
      if (this.tryBark('chaosMoment')) {
        this.lastChaosBarkAt = now;
      }
    }
  }

  tryBark(
    situation: OpponentBarkSituation,
    options?: { force?: boolean; allowDuringHover?: boolean }
  ): BarkResult | null {
    const force = options?.force ?? false;
    const allowDuringHover = options?.allowDuringHover ?? HOVER_SITUATIONS.has(situation);

    if (this.countdownActive && situation === 'randomGameplay') {
      return null;
    }

    if (this.ballHoverActive && !allowDuringHover && situation === 'randomGameplay') {
      return null;
    }

    if (situation === 'matchStart' && this.matchStartUsed && !force) {
      return null;
    }

    if (this.ballHoverActive && situation === 'randomGameplay') {
      return null;
    }

    if (
      this.ballHoverActive &&
      situation === 'ballHoverStarts' &&
      this.hoverReactionUsed &&
      !force
    ) {
      return null;
    }

    const now = this.gameNow();
    const isPriority = PRIORITY_SITUATIONS.has(situation);
    const minGapMs = isPriority ? 0 : 10_000;

    if (!force && now - this.lastGlobalBarkAt < minGapMs && !isPriority) {
      return null;
    }

    const profile = getOpponentProfile(this.opponentId);
    const candidates = profile.barks.filter((b) => b.situation === situation);
    if (candidates.length === 0) return null;

    const available = candidates.filter((b) => {
      const key = `${situation}:${b.text}`;
      const last = this.situationCooldowns.get(key) ?? 0;
      return force || now - last >= b.cooldownSeconds * 1000;
    });

    if (available.length === 0) return null;

    const pick = available[Math.floor(Math.random() * available.length)];
    const key = `${situation}:${pick.text}`;
    this.situationCooldowns.set(key, now);
    this.lastGlobalBarkAt = now;

    if (situation === 'randomGameplay') {
      this.scheduleNextRandom();
    }
    if (situation === 'matchStart') {
      this.matchStartUsed = true;
    }
    if (situation === 'ballHoverStarts') {
      this.hoverReactionUsed = true;
    }

    const result: BarkResult = {
      text: pick.text,
      displayName: profile.displayName,
      modifier: pick.gameplayModifier,
      situation,
    };

    console.log('[Opponent Bark]', {
      opponentId: this.opponentId,
      situation,
      text: pick.text,
    });

    this.onShowBark?.(result);

    if (pick.gameplayModifier !== 'none') {
      this.onApplyModifier?.(pick.gameplayModifier);
    }

    return result;
  }

  private scheduleNextRandom(): void {
    this.nextRandomAt = 8_000 + Math.random() * 6_000;
  }

  private gameNow(): number {
    let now = performance.now() - this.timeAdjustmentMs;
    if (this.pausedAt !== null) {
      now -= performance.now() - this.pausedAt;
    }
    return now;
  }
}

export function opponentPaddleToScreen(
  paddleX: number,
  paddleY: number,
  canvasRect: DOMRect,
  gameWidth: number,
  gameHeight: number
): { x: number; y: number } {
  return {
    x: canvasRect.left + (paddleX / gameWidth) * canvasRect.width,
    y: canvasRect.top + (paddleY / gameHeight) * canvasRect.height,
  };
}
