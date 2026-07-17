/**
 * Async Emotional Loadout flavor (OpenAI wording + VoiceDirector speech).
 * Generation may start on action accept; speech waits until releaseFlavor (after absorption).
 * Never pauses physics. Never owns gameplay cooldown or stat authority.
 */

import { voiceDirector } from '../audio/VoiceDirector';
import type {
  DialogueTurn,
  EmotionalLoadoutId,
  GeneratedLoadoutLine,
  GeneratedReaction,
} from '../audio/speechTypes';
import {
  createBallSpeaker,
  createPlayerSpeaker,
  DEBUG_DIALOGUE,
} from '../config/voiceConfig';
import { dialogueTurnCoordinator } from './DialogueTurnCoordinator';

export type LoadoutFlavorSnapshot = {
  actionId: string;
  loadout: EmotionalLoadoutId;
  targetBallId: string;
  targetDisplayName: string;
  triggeringEvent: string;
  recentDialogue: string[];
  relationshipSnapshot: Record<string, number>;
  emotionalStateSnapshot: Record<string, number | string>;
  patternSummary?: string;
};

type PendingFlavor = {
  snapshot: LoadoutFlavorSnapshot;
  released: boolean;
  cancelled: boolean;
  abort: AbortController;
  playerLine: GeneratedLoadoutLine | null;
  reaction: GeneratedReaction | null;
  generation: Promise<void>;
};

export class EmotionalLoadoutController {
  private pending: PendingFlavor | null = null;

  constructor(
    private readonly applyReaction: (reaction: GeneratedReaction, actionId: string) => void,
    private readonly isActionCurrent: (actionId: string) => boolean,
    private readonly onCaption?: (speaker: string, text: string) => void
  ) {}

  cancel(): void {
    if (this.pending) {
      this.pending.cancelled = true;
      this.pending.abort.abort();
      this.pending = null;
    }
    dialogueTurnCoordinator.cancelActiveTurn();
  }

  /**
   * Start OpenAI generation immediately; do not speak until releaseFlavor.
   */
  primeFlavor(snapshot: LoadoutFlavorSnapshot, parentSignal?: AbortSignal): void {
    this.cancel();

    const abort = new AbortController();
    if (parentSignal) {
      if (parentSignal.aborted) abort.abort();
      else parentSignal.addEventListener('abort', () => abort.abort(), { once: true });
    }

    const entry: PendingFlavor = {
      snapshot,
      released: false,
      cancelled: false,
      abort,
      playerLine: null,
      reaction: null,
      generation: Promise.resolve(),
    };
    this.pending = entry;

    entry.generation = this.runGeneration(entry);
  }

  /**
   * Allow held (or still-generating) flavor to speak via VoiceDirector.
   * Safe to call after absorption; no-op if stale/cancelled.
   */
  releaseFlavor(actionId: string): void {
    const entry = this.pending;
    if (!entry || entry.snapshot.actionId !== actionId || entry.cancelled) return;
    if (!this.isActionCurrent(actionId)) {
      this.cancel();
      return;
    }
    entry.released = true;
    void this.trySpeak(entry);
  }

  private async runGeneration(entry: PendingFlavor): Promise<void> {
    const { snapshot } = entry;
    try {
      await voiceDirector.ensureAudioReady();
      if (entry.cancelled || !this.isActionCurrent(snapshot.actionId)) return;

      const turn = this.createTurn(snapshot);
      const content = await dialogueTurnCoordinator.generateTurnContent(turn, {
        targetStillExists: () => this.isActionCurrent(snapshot.actionId) && !entry.cancelled,
        signal: entry.abort.signal,
      });

      if (entry.cancelled || entry.abort.signal.aborted || !this.isActionCurrent(snapshot.actionId)) {
        return;
      }
      if (!content.ok) {
        if (import.meta.env.DEV) {
          console.warn('[EmotionalLoadout] generation failed; gameplay effects still apply', {
            actionId: snapshot.actionId,
          });
        }
        return;
      }

      entry.playerLine = content.playerLine;
      entry.reaction = content.reaction;

      if (DEBUG_DIALOGUE) {
        console.log('[EmotionalLoadout] generation ready', {
          actionId: snapshot.actionId,
          hasPlayerLine: Boolean(content.playerLine?.playerLine),
        });
      }

      if (entry.released) {
        await this.trySpeak(entry);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[EmotionalLoadout] generation error', {
          actionId: snapshot.actionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  private async trySpeak(entry: PendingFlavor): Promise<void> {
    if (!entry.released || entry.cancelled) return;
    if (!entry.playerLine && !entry.reaction) {
      // Still generating — speak when ready.
      return;
    }

    const { snapshot } = entry;
    if (!this.isActionCurrent(snapshot.actionId)) {
      this.cancel();
      return;
    }

    // Consume pending so we only speak once.
    if (this.pending === entry) {
      this.pending = null;
    }

    const turn = this.createTurn(snapshot);
    await dialogueTurnCoordinator.speakTurnContent(
      turn,
      {
        playerLine: entry.playerLine,
        reaction: entry.reaction,
      },
      {
        interactionId: snapshot.actionId,
        targetStillExists: () => this.isActionCurrent(snapshot.actionId),
        onPlayerLine: (line) => {
          if (!line.trim() || !this.isActionCurrent(snapshot.actionId)) return;
          this.onCaption?.('You', line);
        },
        onReaction: (reaction) => {
          if (!this.isActionCurrent(snapshot.actionId)) return;
          if (reaction.reactionLine.trim()) {
            this.onCaption?.(snapshot.targetDisplayName, reaction.reactionLine);
          }
          this.applyReaction(reaction, snapshot.actionId);
        },
      }
    );
  }

  private createTurn(snapshot: LoadoutFlavorSnapshot): DialogueTurn {
    const recent = [...snapshot.recentDialogue];
    if (snapshot.patternSummary) {
      recent.push(snapshot.patternSummary);
    }
    return {
      id: snapshot.actionId,
      loadout: snapshot.loadout,
      player: createPlayerSpeaker(),
      target: createBallSpeaker(snapshot.targetBallId),
      triggeringEvent: snapshot.triggeringEvent,
      recentDialogue: recent.slice(-8),
      relationshipSnapshot: snapshot.relationshipSnapshot,
      emotionalStateSnapshot: snapshot.emotionalStateSnapshot,
      createdAt: Date.now(),
    };
  }
}
