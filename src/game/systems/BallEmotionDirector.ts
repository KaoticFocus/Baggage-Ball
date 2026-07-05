import type { BallStats } from '../types/BallTypes';
import type { DialogueSituation, HoverDecision } from '../types/DialogueTypes';

export type EmotionContext = {
  ballId: string;
  stats: BallStats;
  paddleHitsSinceHover: number;
  totalPaddleHits: number;
  timeSinceLastHoverMs: number;
  rallyLength: number;
  boringReturnStreak: number;
  elapsedPlayTimeMs: number;
};

const FIRST_HOVER_HIT_THRESHOLD = 3;

export class BallEmotionDirector {
  private firstHoverTriggered = false;
  private lastHoverTime = 0;
  private paddleHitsSinceHover = 0;
  private boringReturnStreak = 0;
  private playStartTime = 0;

  reset(): void {
    this.firstHoverTriggered = false;
    this.lastHoverTime = 0;
    this.paddleHitsSinceHover = 0;
    this.boringReturnStreak = 0;
    this.playStartTime = performance.now();
  }

  onPlayStart(): void {
    this.reset();
  }

  onPaddleHit(centerHit: boolean, stats: BallStats, ballId: string): HoverDecision | null {
    this.paddleHitsSinceHover++;

    if (!centerHit) {
      this.boringReturnStreak++;
    } else {
      this.boringReturnStreak = Math.max(0, this.boringReturnStreak - 1);
    }

    // Force first hover after 3 hits — guarantees dialogue within ~15 seconds
    if (!this.firstHoverTriggered && this.paddleHitsSinceHover >= FIRST_HOVER_HIT_THRESHOLD) {
      return this.commitHover(this.openingSituation(ballId, stats), 'first paddle hits');
    }

    // Boring returns trigger complaint
    if (this.boringReturnStreak >= 4 && Math.random() < 0.55) {
      return this.commitHover('boredomComplaint', 'boring paddle returns');
    }

    // Early-game instability — Valentine especially
    if (ballId === 'valentine' && this.paddleHitsSinceHover >= 2 && Math.random() < 0.35) {
      return this.commitHover(this.pickVolatilitySituation(stats, ballId), 'Valentine volatility');
    }

    if (stats.patience < 25 && Math.random() < 0.2) {
      return this.commitHover('accusation', 'low patience');
    }

    return null;
  }

  onNearMiss(stats: BallStats): HoverDecision {
    if (stats.attachment > 80) {
      return this.commitHover('clingyInterruption', 'near miss clinginess');
    }
    return this.commitHover('nearMissReaction', 'near miss');
  }

  onModeSwitch(): HoverDecision {
    return this.commitHover('modeSwitchToText', 'mode switch');
  }

  onLongRally(stats: BallStats): HoverDecision {
    if (stats.ego > 70) {
      return this.commitHover('praiseDemand', 'long rally ego');
    }
    return this.commitHover('strategyRethink', 'long rally');
  }

  evaluatePeriodic(context: EmotionContext): HoverDecision | null {
    const { stats, ballId, timeSinceLastHoverMs, rallyLength, boringReturnStreak } = context;

    const cooldown = this.getHoverCooldownMs(stats, ballId);
    if (timeSinceLastHoverMs < cooldown) return null;

    // Guaranteed hover within first 15 seconds if somehow missed
    if (context.elapsedPlayTimeMs > 12000 && !this.firstHoverTriggered) {
      return this.commitHover(this.openingSituation(ballId, stats), 'elapsed time failsafe');
    }

    // Base instability roll — intentionally dramatic
    let chance = 0.45 + stats.dramaNeed / 200;
    if (ballId === 'valentine') chance += 0.25;
    if (stats.dramaNeed > 75) chance += 0.15;
    if (stats.chaos > 70) chance += 0.1;
    if (rallyLength > 10) chance += 0.1;
    if (boringReturnStreak >= 3) chance += 0.2;

    if (Math.random() > chance) return null;

    return this.commitHover(
      this.pickVolatilitySituation(stats, ballId),
      'instability check'
    );
  }

  forceRandom(stats: BallStats, ballId: string): HoverDecision {
    return this.commitHover(this.pickVolatilitySituation(stats, ballId), 'debug random');
  }

  forceClingy(): HoverDecision {
    return this.commitHover('clingyInterruption', 'debug clingy');
  }

  forceModeSwitch(): HoverDecision {
    return this.commitHover('modeSwitchToText', 'debug mode switch');
  }

  getContext(totalPaddleHits: number, rallyLength: number): EmotionContext {
    const now = performance.now();
    return {
      ballId: '',
      stats: {} as BallStats,
      paddleHitsSinceHover: this.paddleHitsSinceHover,
      totalPaddleHits,
      timeSinceLastHoverMs: now - this.lastHoverTime,
      rallyLength,
      boringReturnStreak: this.boringReturnStreak,
      elapsedPlayTimeMs: now - this.playStartTime,
    };
  }

  markHoverResolved(): void {
    this.paddleHitsSinceHover = 0;
    this.boringReturnStreak = 0;
  }

  private commitHover(situation: DialogueSituation, reason: string): HoverDecision {
    this.firstHoverTriggered = true;
    this.lastHoverTime = performance.now();
    this.paddleHitsSinceHover = 0;
    return { shouldHover: true, situation, reason };
  }

  private getHoverCooldownMs(stats: BallStats, ballId: string): number {
    const dramaFactor = stats.dramaNeed / 100;
    const baseMin = 6000 - dramaFactor * 2500;
    const baseMax = 12000 - dramaFactor * 4000;
    let cooldown = baseMin + Math.random() * (baseMax - baseMin);

    if (stats.dramaNeed > 75) cooldown *= 0.65;
    if (ballId === 'valentine') cooldown *= 0.55;
    if (stats.patience < 20) cooldown *= 0.75;

    return Math.max(2500, cooldown);
  }

  private openingSituation(ballId: string, stats: BallStats): DialogueSituation {
    if (ballId === 'valentine') return 'clingyInterruption';
    if (ballId === 'bolt') return 'boredomComplaint';
    if (ballId === 'orb') return 'existentialCrisis';
    return this.pickVolatilitySituation(stats, ballId);
  }

  private pickVolatilitySituation(stats: BallStats, ballId: string): DialogueSituation {
    const weighted: { situation: DialogueSituation; weight: number }[] = [
      { situation: 'randomHover', weight: 20 },
      { situation: 'accusation', weight: stats.trust < 25 ? 35 : 8 },
      { situation: 'praiseDemand', weight: stats.ego > 65 ? 30 : 10 },
      { situation: 'existentialCrisis', weight: ballId === 'orb' ? 25 : 5 },
      { situation: 'strategyRethink', weight: 12 },
      { situation: 'resentmentSpike', weight: stats.resentment > 70 ? 40 : 10 },
      { situation: 'clingyInterruption', weight: stats.attachment > 80 ? 45 : ballId === 'valentine' ? 30 : 5 },
      { situation: 'boredomComplaint', weight: ballId === 'bolt' ? 25 : 10 },
      { situation: 'nearMissReaction', weight: 5 },
    ];

    if (stats.chaos > 70) {
      weighted.push({ situation: 'strategyRethink', weight: 20 });
      weighted.push({ situation: 'randomHover', weight: 15 });
    }

    const total = weighted.reduce((s, w) => s + w.weight, 0);
    let roll = Math.random() * total;
    for (const entry of weighted) {
      roll -= entry.weight;
      if (roll <= 0) return entry.situation;
    }
    return 'randomHover';
  }
}
