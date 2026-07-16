/**
 * Concise relationship memory for Emotional Loadout actions.
 * Keeps a short event window + mode-frequency summary for OpenAI prompts.
 */

import type { BallStats } from '../types/BallTypes';
import type { EmotionalResponseModeId } from '../data/emotionalResponseModes';

export type RelationshipEvent = {
  actionId: string;
  actorId: string;
  targetId: string;
  modeId: EmotionalResponseModeId;
  statChanges: Partial<BallStats>;
  rallyNumber: number;
  scoreContext: {
    playerScore: number;
    opponentScore: number;
  };
  timestamp: number;
};

const MAX_RECENT = 12;

export class RelationshipMemory {
  private readonly events: RelationshipEvent[] = [];
  private readonly modeCounts = new Map<EmotionalResponseModeId, number>();

  record(event: RelationshipEvent): void {
    this.events.push(event);
    if (this.events.length > MAX_RECENT) {
      this.events.splice(0, this.events.length - MAX_RECENT);
    }
    this.modeCounts.set(event.modeId, (this.modeCounts.get(event.modeId) ?? 0) + 1);
  }

  clear(): void {
    this.events.length = 0;
    this.modeCounts.clear();
  }

  getRecentEvents(): readonly RelationshipEvent[] {
    return this.events;
  }

  /** Short lines for OpenAI context (not full match history). */
  getRecentDialogueHints(limit = 5): string[] {
    return this.events.slice(-limit).map((event) => {
      const delta = Object.entries(event.statChanges)
        .filter(([, v]) => v)
        .map(([k, v]) => `${k}${Number(v) > 0 ? '+' : ''}${v}`)
        .join(',');
      return `${event.modeId}@rally${event.rallyNumber}${delta ? `(${delta})` : ''}`;
    });
  }

  getPatternSummary(): string {
    if (this.modeCounts.size === 0) return 'No prior emotional tactics this match.';
    const ranked = [...this.modeCounts.entries()].sort((a, b) => b[1] - a[1]);
    const top = ranked
      .slice(0, 4)
      .map(([mode, count]) => `${mode}×${count}`)
      .join(', ');
    const last = this.events[this.events.length - 1];
    const lastBit = last ? ` Last: ${last.modeId}.` : '';
    return `Tactics so far: ${top}.${lastBit}`;
  }
}
