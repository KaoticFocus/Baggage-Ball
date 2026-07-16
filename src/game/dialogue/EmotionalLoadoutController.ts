/**
 * Async Emotional Loadout flavor (OpenAI wording + VoiceDirector speech).
 * Never pauses physics. Never owns gameplay cooldown or stat authority.
 */

import { voiceDirector } from '../audio/VoiceDirector';
import type { DialogueTurn, EmotionalLoadoutId, GeneratedReaction } from '../audio/speechTypes';
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

export class EmotionalLoadoutController {
  constructor(
    private readonly applyReaction: (reaction: GeneratedReaction, actionId: string) => void,
    private readonly isActionCurrent: (actionId: string) => boolean,
    private readonly onCaption?: (speaker: string, text: string) => void
  ) {}

  cancel(): void {
    dialogueTurnCoordinator.cancelActiveTurn();
  }

  /**
   * Fire-and-forget spoken flavor for an already-applied emotional action.
   * Safe to call without awaiting for gameplay.
   */
  async speakFlavor(snapshot: LoadoutFlavorSnapshot): Promise<void> {
    if (!this.isActionCurrent(snapshot.actionId)) return;

    try {
      await voiceDirector.ensureAudioReady();
      if (!this.isActionCurrent(snapshot.actionId)) return;

      const turn = this.createTurn(snapshot);
      const result = await dialogueTurnCoordinator.executeTurn(turn, {
        targetStillExists: () => this.isActionCurrent(snapshot.actionId),
        interactionId: snapshot.actionId,
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
      });

      if (DEBUG_DIALOGUE) {
        console.log('[EmotionalLoadout] flavor complete', {
          actionId: snapshot.actionId,
          ok: result.ok,
        });
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[EmotionalLoadout] flavor failed; gameplay effects remain', {
          actionId: snapshot.actionId,
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }
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
