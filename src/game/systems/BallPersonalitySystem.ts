import type { BallPersonality, BallStats } from '../types/BallTypes';
import { cloneStats } from '../types/BallTypes';
import { getPersonalityById } from '../data/ballPersonalities';

export class BallPersonalitySystem {
  private personality: BallPersonality;
  private stats: BallStats;

  constructor(ballId: string) {
    const p = getPersonalityById(ballId);
    if (!p) throw new Error(`Unknown ball: ${ballId}`);
    this.personality = p;
    this.stats = cloneStats(p.startingStats);
  }

  getPersonality(): BallPersonality {
    return this.personality;
  }

  getStats(): BallStats {
    return { ...this.stats };
  }

  updateStats(changes: Partial<BallStats>): void {
    for (const key of Object.keys(changes) as (keyof BallStats)[]) {
      const delta = changes[key];
      if (delta !== undefined) {
        this.stats[key] = Math.max(0, Math.min(100, this.stats[key] + delta));
      }
    }
  }

  /** Probability (0–1) of entering hover state on a given frame check */
  getHoverChance(rallyCount: number): number {
    const base = 0.002;
    const dramaFactor = this.stats.dramaNeed / 100;
    const rallyBonus = rallyCount > 20 ? 0.003 : 0;
    return base + dramaFactor * 0.008 + rallyBonus;
  }

  /** Probability of helpful behavior on paddle hit */
  getHelpfulChance(): number {
    return Math.min(0.7, this.stats.trust / 150);
  }

  /** Probability of betrayal/sabotage on paddle hit */
  getBetrayalChance(): number {
    return Math.min(0.6, this.stats.resentment / 140);
  }

  /** Chaos drift magnitude multiplier */
  getChaosMultiplier(): number {
    return 0.5 + this.stats.chaos / 50;
  }

  /** Speed modifier from emotional state */
  getSpeedMultiplier(): number {
    const trustBoost = this.stats.trust > 60 ? 1.05 : 1;
    const resentmentDrag = this.stats.resentment > 70 ? 1.1 : 1;
    const chaosVar = 1 + (this.stats.chaos - 50) / 200;
    return trustBoost * resentmentDrag * chaosVar;
  }

  getRandomRecapNote(): string {
    const notes = this.personality.recapNotes;
    return notes[Math.floor(Math.random() * notes.length)];
  }
}
