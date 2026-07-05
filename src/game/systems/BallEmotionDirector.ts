import type { BallStats } from '../types/BallTypes';
import type { DialogueSituation, HoverDecision } from '../types/DialogueTypes';

export type HoverType = DialogueSituation;

const FIRST_HOVER_HIT_THRESHOLD = 3;
const MIN_HITS_AFTER_HOVER = 6;
const MIN_SECONDS_AFTER_HOVER = 10;
const MIN_GAP_AFTER_HOVER_END_MS = 8000;
const MAX_SILENCE_SECONDS = 25;
const LONG_RALLY_MILESTONES = [10, 20, 35, 50] as const;

export class BallEmotionDirector {
  private totalPaddleHits = 0;
  private paddleHitsSinceLastHover = 0;
  private lastHoverEndedAt = 0;
  private lastHoverStartedAt = 0;
  private firstHoverTriggered = false;
  private isHovering = false;
  private nextHoverEligibleAt = 0;
  private nearMissPending = false;
  private timeAdjustmentMs = 0;
  private pausedAt: number | null = null;

  reset(): void {
    this.totalPaddleHits = 0;
    this.paddleHitsSinceLastHover = 0;
    this.lastHoverEndedAt = 0;
    this.lastHoverStartedAt = 0;
    this.firstHoverTriggered = false;
    this.isHovering = false;
    this.nextHoverEligibleAt = 0;
    this.nearMissPending = false;
    this.timeAdjustmentMs = 0;
    this.pausedAt = null;
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

  private gameNow(): number {
    let now = performance.now() - this.timeAdjustmentMs;
    if (this.pausedAt !== null) {
      now -= performance.now() - this.pausedAt;
    }
    return now;
  }

  onPlayStart(): void {
    this.reset();
  }

  resetForRally(): void {
    this.totalPaddleHits = 0;
    this.paddleHitsSinceLastHover = 0;
    this.lastHoverEndedAt = 0;
    this.lastHoverStartedAt = 0;
    this.firstHoverTriggered = false;
    this.isHovering = false;
    this.nextHoverEligibleAt = 0;
    this.nearMissPending = false;
  }

  getTotalPaddleHits(): number {
    return this.totalPaddleHits;
  }

  getPaddleHitsSinceLastHover(): number {
    return this.paddleHitsSinceLastHover;
  }

  notifyHoverStarted(): void {
    this.isHovering = true;
    this.lastHoverStartedAt = this.gameNow();
    this.paddleHitsSinceLastHover = 0;
  }

  markHoverResolved(): void {
    this.isHovering = false;
    this.lastHoverEndedAt = this.gameNow();
    this.paddleHitsSinceLastHover = 0;
    this.nextHoverEligibleAt = this.gameNow() + MIN_GAP_AFTER_HOVER_END_MS;
    this.nearMissPending = false;
  }

  onNearMissDetected(): void {
    this.nearMissPending = true;
  }

  onWallBounce(stats: BallStats, ballId: string): HoverDecision | null {
    return this.tryNearMissHover(stats, ballId);
  }

  onPaddleHit(stats: BallStats, ballId: string): HoverDecision | null {
    if (this.isHovering) return null;

    this.totalPaddleHits++;
    this.paddleHitsSinceLastHover++;

    if (!this.firstHoverTriggered && this.totalPaddleHits >= FIRST_HOVER_HIT_THRESHOLD) {
      return this.commitHover(
        this.pickHoverType(stats, ballId, { forcedOpening: true }),
        stats,
        ballId,
        'forced first hover (3 hits)'
      );
    }

    if (!this.firstHoverTriggered) return null;

    const nearMiss = this.tryNearMissHover(stats, ballId);
    if (nearMiss) return nearMiss;

    return this.tryScheduledHover(stats, ballId);
  }

  onLongRallyMilestone(
    stats: BallStats,
    ballId: string,
    rallyHits: number
  ): HoverDecision | null {
    if (!LONG_RALLY_MILESTONES.includes(rallyHits as (typeof LONG_RALLY_MILESTONES)[number])) {
      return null;
    }
    if (this.isHovering || this.gameNow() < this.nextHoverEligibleAt) return null;
    if (!this.isEligible(stats, ballId) && !this.isFailsafe()) return null;

    return this.commitHover(
      this.pickHoverType(stats, ballId, { longRally: true }),
      stats,
      ballId,
      `long rally milestone (${rallyHits} hits)`
    );
  }

  isLongRallyMilestone(rallyHits: number): boolean {
    return LONG_RALLY_MILESTONES.includes(rallyHits as (typeof LONG_RALLY_MILESTONES)[number]);
  }

  /** Periodic failsafe — force hover if player has been rallying too long in silence. */
  evaluateFailsafe(stats: BallStats, ballId: string): HoverDecision | null {
    if (this.isHovering || !this.firstHoverTriggered) return null;
    if (this.gameNow() < this.nextHoverEligibleAt) return null;
    if (!this.isFailsafe()) return null;

    return this.commitHover(
      this.pickHoverType(stats, ballId, {}),
      stats,
      ballId,
      '25-second silence failsafe'
    );
  }

  forceRandom(stats: BallStats, ballId: string): HoverDecision {
    return this.commitHover(
      this.pickHoverType(stats, ballId, {}),
      stats,
      ballId,
      'debug random hover'
    );
  }

  forceModeSwitch(stats: BallStats, ballId: string): HoverDecision {
    return this.commitHover('modeSwitchToText', stats, ballId, 'debug mode switch');
  }

  logHoverCheck(stats: BallStats, ballId: string, eligible: boolean, chance: number): void {
    console.log('[Hover Check]', {
      totalPaddleHits: this.totalPaddleHits,
      paddleHitsSinceLastHover: this.paddleHitsSinceLastHover,
      secondsSinceLastHover: this.getSecondsSinceLastHoverEnd(),
      firstHoverTriggered: this.firstHoverTriggered,
      isHovering: this.isHovering,
      eligible,
      chance: Math.round(chance * 100),
      ballId,
      dramaNeed: stats.dramaNeed,
    });
  }

  pickHoverType(
    stats: BallStats,
    ballId: string,
    flags: { modeSwitch?: boolean; nearMiss?: boolean; forcedOpening?: boolean; longRally?: boolean }
  ): HoverType {
    if (flags.modeSwitch) return 'modeSwitchToText';
    if (flags.nearMiss) return 'nearMissReaction';

    if (flags.forcedOpening) {
      if (ballId === 'valentine') return 'clingyInterruption';
      if (ballId === 'bolt') return 'boredomComplaint';
      if (ballId === 'orb') return 'existentialCrisis';
    }

    if (stats.resentment > 70) {
      return Math.random() < 0.5 ? 'resentmentSpike' : 'accusation';
    }
    if (stats.attachment > 80) return 'clingyInterruption';
    if (stats.ego > 75) return 'praiseDemand';
    if (stats.chaos > 70) {
      return Math.random() < 0.5 ? 'existentialCrisis' : 'strategyRethink';
    }
    if (stats.dramaNeed > 75) {
      return Math.random() < 0.5 ? 'boredomComplaint' : 'praiseDemand';
    }
    if (ballId === 'valentine' && Math.random() < 0.2) return 'clingyInterruption';
    if (flags.longRally && stats.ego > 65) return 'praiseDemand';

    return 'randomHover';
  }

  getMoodLabel(stats: BallStats, ballId: string): string {
    if (stats.resentment > 70) return 'Hostile';
    if (stats.attachment > 80) return 'Clingy';
    if (stats.chaos > 70) return 'Unstable';
    if (stats.dramaNeed > 75) return 'Dramatic';
    if (stats.trust < 25) return 'Suspicious';
    if (stats.patience < 25) return 'Restless';
    if (ballId === 'valentine') return 'Melodramatic';
    if (ballId === 'bolt') return 'Irritable';
    if (ballId === 'orb') return 'Theatrical';
    return 'Volatile';
  }

  formatHoverType(type: HoverType): string {
    return type
      .replace(/([A-Z])/g, ' $1')
      .replace(/^./, (s) => s.toUpperCase())
      .trim();
  }

  private tryNearMissHover(stats: BallStats, ballId: string): HoverDecision | null {
    if (!this.nearMissPending) return null;
    if (!this.isEligible(stats, ballId) && !this.isFailsafe()) return null;
    if (Math.random() > 0.15) return null;

    this.nearMissPending = false;
    return this.commitHover('nearMissReaction', stats, ballId, 'near miss aftermath');
  }

  private tryScheduledHover(stats: BallStats, ballId: string): HoverDecision | null {
    if (this.gameNow() < this.nextHoverEligibleAt) {
      this.logHoverCheck(stats, ballId, false, 0);
      return null;
    }

    if (this.isFailsafe()) {
      this.logHoverCheck(stats, ballId, true, 1);
      return this.commitHover(
        this.pickHoverType(stats, ballId, {}),
        stats,
        ballId,
        '25-second silence failsafe'
      );
    }

    const eligible = this.isEligible(stats, ballId);
    const chance = eligible ? this.getHoverChance(stats, ballId) : 0;
    this.logHoverCheck(stats, ballId, eligible, chance);

    if (!eligible) return null;
    if (Math.random() > chance) return null;

    return this.commitHover(
      this.pickHoverType(stats, ballId, {}),
      stats,
      ballId,
      'instability roll on paddle hit'
    );
  }

  private isEligible(_stats: BallStats, _ballId: string): boolean {
    return (
      this.paddleHitsSinceLastHover >= MIN_HITS_AFTER_HOVER &&
      this.getSecondsSinceLastHoverEnd() >= MIN_SECONDS_AFTER_HOVER
    );
  }

  private isFailsafe(): boolean {
    return this.getSecondsSinceLastHoverEnd() >= MAX_SILENCE_SECONDS;
  }

  private getSecondsSinceLastHoverEnd(): number {
    if (this.lastHoverEndedAt === 0) {
      if (this.lastHoverStartedAt === 0) return 0;
      return (this.gameNow() - this.lastHoverStartedAt) / 1000;
    }
    return (this.gameNow() - this.lastHoverEndedAt) / 1000;
  }

  private commitHover(
    hoverType: HoverType,
    _stats: BallStats,
    _ballId: string,
    reason: string
  ): HoverDecision {
    this.firstHoverTriggered = true;
    this.lastHoverStartedAt = this.gameNow();
    this.paddleHitsSinceLastHover = 0;
    this.nearMissPending = false;

    return {
      shouldHover: true,
      hoverType,
      situation: hoverType,
      reason,
    };
  }

  private getHoverChance(stats: BallStats, ballId: string): number {
    let chance = 0.3;

    if (stats.dramaNeed > 75) chance += 0.15;
    if (stats.resentment > 70) chance += 0.15;
    if (stats.chaos > 70) chance += 0.1;
    if (stats.attachment > 80) chance += 0.15;
    if (stats.patience < 25) chance += 0.1;
    if (stats.trust < 25) chance += 0.1;
    if (ballId === 'valentine') chance += 0.05;

    return Math.min(0.7, Math.max(0.25, chance));
  }
}
