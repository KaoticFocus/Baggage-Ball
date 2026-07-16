/**
 * Owns conversational sequencing for Emotional Loadout voice turns.
 * All character audio goes through VoiceDirector only.
 */

import { voiceDirector } from '../audio/VoiceDirector';
import type {
  DialogueTurn,
  GeneratedLoadoutLine,
  GeneratedReaction,
  SpeakerRef,
} from '../audio/speechTypes';
import { DEBUG_DIALOGUE } from '../config/voiceConfig';
import { classifyPlayerResponse } from '../services/classifyResponseClient';

const LOADOUT_LINE_URL = '/.netlify/functions/generate-loadout-line';

export class DialogueTurnCoordinator {
  private activeTurnId: string | null = null;

  hasActiveTurn(): boolean {
    return this.activeTurnId !== null;
  }

  getActiveTurnId(): string | null {
    return this.activeTurnId;
  }

  async executeTurn(
    turn: DialogueTurn,
    options?: {
      onReaction?: (reaction: GeneratedReaction) => void;
      targetStillExists?: (targetId: string) => boolean;
      interactionId?: number | string;
    }
  ): Promise<{ ok: boolean; reaction: GeneratedReaction | null }> {
    if (this.activeTurnId) {
      return { ok: false, reaction: null };
    }

    this.activeTurnId = turn.id;
    let reaction: GeneratedReaction | null = null;

    try {
      await voiceDirector.ensureAudioReady();

      const generatedPlayerLine = await this.generatePlayerLine(turn);
      this.assertTurnIsCurrent(turn.id);
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      if (DEBUG_DIALOGUE) {
        console.log('[DialogueTurn] playerLine', generatedPlayerLine.playerLine);
      }

      const reactionPromise = this.generateCharacterReaction(
        turn,
        generatedPlayerLine.playerLine
      );

      if (generatedPlayerLine.playerLine.trim()) {
        const playerPlayback = await voiceDirector.speak({
          characterId: turn.player.characterId,
          speakerId: turn.player.id,
          speakerKind: turn.player.kind,
          text: generatedPlayerLine.playerLine,
          priority: 'emotionalResponse',
          category: 'emotionalResponse',
          turnId: turn.id,
          interactionId: options?.interactionId,
          interruptible: false,
          dedupeKey: `loadout-player:${turn.id}`,
          metadata: { loadout: turn.loadout, deliveryHints: generatedPlayerLine.deliveryHints },
        });
        if (!playerPlayback.ok && !playerPlayback.cancelled) {
          throw new Error(playerPlayback.message ?? 'Player speech synthesis/playback failed');
        }
        if (playerPlayback.cancelled) {
          throw new Error('Player speech cancelled');
        }
      }

      this.assertTurnIsCurrent(turn.id);
      reaction = await reactionPromise;
      this.assertTurnIsCurrent(turn.id);
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      if (DEBUG_DIALOGUE) {
        console.log('[DialogueTurn] reactionLine', reaction.reactionLine);
      }

      if (reaction.reactionLine.trim()) {
        await this.speakAs(turn.target, reaction.reactionLine, turn.id, options?.interactionId, {
          loadout: turn.loadout,
          deliveryHints: reaction.deliveryHints,
        });
      }

      options?.onReaction?.(reaction);
      return { ok: true, reaction };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[DialogueTurn] failed', {
          turnId: turn.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      voiceDirector.cancelRequest(`loadout-player:${turn.id}`);
      // Cancel any turn-tagged speech.
      this.cancelActiveTurn();
      return { ok: false, reaction };
    } finally {
      if (this.activeTurnId === turn.id) {
        this.activeTurnId = null;
      }
    }
  }

  cancelActiveTurn(): void {
    if (!this.activeTurnId) return;
    voiceDirector.cancelTurn(this.activeTurnId, true);
    this.activeTurnId = null;
  }

  private speakAs(
    speaker: SpeakerRef,
    text: string,
    turnId: string,
    interactionId: number | string | undefined,
    metadata?: Record<string, unknown>
  ) {
    return voiceDirector.speak({
      characterId: speaker.characterId,
      speakerId: speaker.id,
      speakerKind: speaker.kind,
      text,
      priority: 'emotionalResponse',
      category: 'emotionalResponse',
      turnId,
      interactionId,
      interruptible: false,
      dedupeKey: `loadout-ball:${turnId}`,
      metadata,
    });
  }

  private async generatePlayerLine(turn: DialogueTurn): Promise<GeneratedLoadoutLine> {
    if (turn.loadout === 'go-silent') {
      return {
        turnId: turn.id,
        playerLine: '',
        intensity: 0.2,
        deliveryHints: ['silent'],
      };
    }

    try {
      const response = await fetch(LOADOUT_LINE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          turnId: turn.id,
          loadout: turn.loadout,
          targetBallId: turn.target.characterId,
          triggeringEvent: turn.triggeringEvent,
          recentDialogue: turn.recentDialogue,
          relationshipSnapshot: turn.relationshipSnapshot,
          emotionalStateSnapshot: turn.emotionalStateSnapshot,
        }),
      });

      const data = (await response.json()) as GeneratedLoadoutLine & {
        ok?: boolean;
        error?: string;
      };

      if (!response.ok || data.ok === false || !data.playerLine) {
        throw new Error(data.error ?? `HTTP ${response.status}`);
      }

      return {
        turnId: turn.id,
        playerLine: data.playerLine.trim(),
        intensity: data.intensity ?? 0.6,
        deliveryHints: data.deliveryHints,
      };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[DialogueTurn] player line generation failed', error);
      }
      throw error;
    }
  }

  private async generateCharacterReaction(
    turn: DialogueTurn,
    playerLine: string
  ): Promise<GeneratedReaction> {
    const ballId = turn.target.id.startsWith('ball:')
      ? turn.target.id.slice('ball:'.length)
      : turn.target.characterId;

    const result = await classifyPlayerResponse({
      playerText: playerLine,
      ballId,
      situation: turn.triggeringEvent || 'hoverResponse',
      responseModeId: turn.loadout,
      responseModeName: turn.loadout,
      responseModeDescription: `Player used Emotional Loadout: ${turn.loadout}`,
    });

    return {
      turnId: turn.id,
      reactionLine: result.ballReaction,
      emotionalOutcome: result.emotionalResult,
      relationshipChanges: result.statChanges,
      deliveryHints: [result.tone],
      behaviorModifier: result.behaviorModifier,
      tone: result.tone,
      playerResponse: result.playerResponse,
    };
  }

  private assertTurnIsCurrent(turnId: string): void {
    if (this.activeTurnId !== turnId) {
      throw new Error(`Stale dialogue turn ${turnId}`);
    }
  }

  private assertTargetStillExists(
    targetId: string,
    check?: (targetId: string) => boolean
  ): void {
    if (check && !check(targetId)) {
      throw new Error(`Target missing for ${targetId}`);
    }
  }
}

export const dialogueTurnCoordinator = new DialogueTurnCoordinator();
