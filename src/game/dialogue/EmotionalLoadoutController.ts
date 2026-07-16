/**
 * Starts Emotional Loadout voice turns without pausing Phaser physics itself.
 * Scene may already be in hover; this controller only locks loadout controls.
 */

import { voiceDirector } from '../audio/VoiceDirector';
import type { DialogueTurn, EmotionalLoadoutId, GeneratedReaction } from '../audio/speechTypes';
import {
  createBallSpeaker,
  createPlayerSpeaker,
  DEBUG_DIALOGUE,
} from '../config/voiceConfig';
import { dialogueTurnCoordinator } from './DialogueTurnCoordinator';

export type LoadoutTurnSnapshot = {
  loadout: EmotionalLoadoutId;
  targetBallId: string;
  triggeringEvent: string;
  recentDialogue: string[];
  relationshipSnapshot: Record<string, number>;
  emotionalStateSnapshot: Record<string, number | string>;
  interactionId?: number | string;
};

let turnSeq = 0;

export class EmotionalLoadoutController {
  private controlsLocked = false;

  constructor(
    private readonly setLoadoutControlsEnabled: (enabled: boolean) => void,
    private readonly applyReaction: (reaction: GeneratedReaction) => void,
    private readonly targetStillExists: (targetId: string) => boolean
  ) {}

  isLocked(): boolean {
    return this.controlsLocked || dialogueTurnCoordinator.hasActiveTurn();
  }

  async selectLoadout(snapshot: LoadoutTurnSnapshot): Promise<boolean> {
    if (dialogueTurnCoordinator.hasActiveTurn() || this.controlsLocked) {
      return false;
    }

    await voiceDirector.ensureAudioReady();

    const turn = this.createTurnSnapshot(snapshot);
    this.controlsLocked = true;
    this.setLoadoutControlsEnabled(false);

    try {
      const result = await dialogueTurnCoordinator.executeTurn(turn, {
        targetStillExists: this.targetStillExists,
        onReaction: (reaction) => this.applyReaction(reaction),
        interactionId: snapshot.interactionId,
      });

      if (DEBUG_DIALOGUE) {
        console.log('[EmotionalLoadout] turn complete', {
          turnId: turn.id,
          ok: result.ok,
        });
      }

      return result.ok;
    } finally {
      this.controlsLocked = false;
      this.setLoadoutControlsEnabled(true);
    }
  }

  cancel(): void {
    dialogueTurnCoordinator.cancelActiveTurn();
    this.controlsLocked = false;
    this.setLoadoutControlsEnabled(true);
  }

  private createTurnSnapshot(snapshot: LoadoutTurnSnapshot): DialogueTurn {
    turnSeq += 1;
    return {
      id: `turn-${Date.now()}-${turnSeq}`,
      loadout: snapshot.loadout,
      player: createPlayerSpeaker(),
      target: createBallSpeaker(snapshot.targetBallId),
      triggeringEvent: snapshot.triggeringEvent,
      recentDialogue: snapshot.recentDialogue,
      relationshipSnapshot: snapshot.relationshipSnapshot,
      emotionalStateSnapshot: snapshot.emotionalStateSnapshot,
      createdAt: Date.now(),
    };
  }
}
