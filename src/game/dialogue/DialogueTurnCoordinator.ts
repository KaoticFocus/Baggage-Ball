/**
 * Owns conversational sequencing for Emotional Loadout voice turns.
 * Generation and speech are separable so delivery VFX can gate VoiceDirector.
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

export type GeneratedTurnContent = {
  ok: boolean;
  playerLine: GeneratedLoadoutLine | null;
  reaction: GeneratedReaction | null;
};

export class DialogueTurnCoordinator {
  private activeTurnId: string | null = null;
  private generatingTurnId: string | null = null;
  private generationAbort: AbortController | null = null;

  hasActiveTurn(): boolean {
    return this.activeTurnId !== null || this.generatingTurnId !== null;
  }

  getActiveTurnId(): string | null {
    return this.activeTurnId ?? this.generatingTurnId;
  }

  /**
   * OpenAI-only phase. Does not speak. Safe to run during beam delivery.
   */
  async generateTurnContent(
    turn: DialogueTurn,
    options?: {
      targetStillExists?: (targetId: string) => boolean;
      signal?: AbortSignal;
    }
  ): Promise<GeneratedTurnContent> {
    if (this.generatingTurnId && this.generatingTurnId !== turn.id) {
      this.cancelActiveTurn();
    }
    this.generatingTurnId = turn.id;
    this.generationAbort?.abort();
    this.generationAbort = new AbortController();
    const signal = this.generationAbort.signal;
    if (options?.signal) {
      if (options.signal.aborted) {
        this.generationAbort.abort();
      } else {
        options.signal.addEventListener('abort', () => this.generationAbort?.abort(), {
          once: true,
        });
      }
    }

    try {
      if (signal.aborted) return { ok: false, playerLine: null, reaction: null };

      const generatedPlayerLine = await this.generatePlayerLine(turn, signal);
      if (this.generatingTurnId !== turn.id || signal.aborted) {
        return { ok: false, playerLine: null, reaction: null };
      }
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      if (DEBUG_DIALOGUE) {
        console.log('[DialogueTurn] playerLine', generatedPlayerLine.playerLine);
      }

      const reaction = await this.generateCharacterReaction(
        turn,
        generatedPlayerLine.playerLine,
        signal
      );
      if (this.generatingTurnId !== turn.id || signal.aborted) {
        return { ok: false, playerLine: null, reaction: null };
      }
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      if (DEBUG_DIALOGUE) {
        console.log('[DialogueTurn] reactionLine', reaction.reactionLine);
      }

      return { ok: true, playerLine: generatedPlayerLine, reaction };
    } catch (error) {
      if (signal.aborted) {
        return { ok: false, playerLine: null, reaction: null };
      }
      if (import.meta.env.DEV) {
        console.warn('[DialogueTurn] generation failed', {
          turnId: turn.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      return { ok: false, playerLine: null, reaction: null };
    } finally {
      if (this.generatingTurnId === turn.id) {
        this.generatingTurnId = null;
      }
    }
  }

  /**
   * Speak previously generated content through VoiceDirector.
   */
  async speakTurnContent(
    turn: DialogueTurn,
    content: {
      playerLine: GeneratedLoadoutLine | null;
      reaction: GeneratedReaction | null;
    },
    options?: {
      onReaction?: (reaction: GeneratedReaction) => void;
      onPlayerLine?: (line: string) => void;
      targetStillExists?: (targetId: string) => boolean;
      interactionId?: number | string;
    }
  ): Promise<{ ok: boolean; reaction: GeneratedReaction | null }> {
    if (this.activeTurnId && this.activeTurnId !== turn.id) {
      this.cancelActiveTurn();
    }
    if (this.activeTurnId) {
      return { ok: false, reaction: null };
    }

    this.activeTurnId = turn.id;
    const reaction = content.reaction;

    try {
      await voiceDirector.ensureAudioReady();
      this.assertTurnIsCurrent(turn.id);
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      const playerLine = content.playerLine?.playerLine?.trim() ?? '';
      if (playerLine) {
        options?.onPlayerLine?.(playerLine);
        try {
          await voiceDirector.speak({
            characterId: turn.player.characterId,
            speakerId: turn.player.id,
            speakerKind: turn.player.kind,
            text: playerLine,
            priority: 'emotionalResponse',
            category: 'emotionalResponse',
            turnId: turn.id,
            interactionId: options?.interactionId,
            interruptible: true,
            dedupeKey: `loadout-player:${turn.id}`,
            metadata: {
              loadout: turn.loadout,
              deliveryHints: content.playerLine?.deliveryHints,
            },
          });
        } catch (error) {
          if (import.meta.env.DEV) {
            console.warn('[DialogueTurn] player TTS failed; caption remains', error);
          }
        }
      }

      this.assertTurnIsCurrent(turn.id);
      this.assertTargetStillExists(turn.target.id, options?.targetStillExists);

      if (reaction) {
        options?.onReaction?.(reaction);
        if (reaction.reactionLine.trim()) {
          try {
            await this.speakAs(turn.target, reaction.reactionLine, turn.id, options?.interactionId, {
              loadout: turn.loadout,
              deliveryHints: reaction.deliveryHints,
            });
          } catch (error) {
            if (import.meta.env.DEV) {
              console.warn('[DialogueTurn] reaction TTS failed; caption remains', error);
            }
          }
        }
      }

      return { ok: true, reaction };
    } catch (error) {
      if (import.meta.env.DEV) {
        console.warn('[DialogueTurn] speak failed', {
          turnId: turn.id,
          message: error instanceof Error ? error.message : String(error),
        });
      }
      voiceDirector.cancelTurn(turn.id, false);
      return { ok: false, reaction };
    } finally {
      if (this.activeTurnId === turn.id) {
        this.activeTurnId = null;
      }
    }
  }

  /** Full generate+speak path (legacy helper). */
  async executeTurn(
    turn: DialogueTurn,
    options?: {
      onReaction?: (reaction: GeneratedReaction) => void;
      onPlayerLine?: (line: string) => void;
      targetStillExists?: (targetId: string) => boolean;
      interactionId?: number | string;
    }
  ): Promise<{ ok: boolean; reaction: GeneratedReaction | null }> {
    const generated = await this.generateTurnContent(turn, options);
    if (!generated.ok) return { ok: false, reaction: null };
    return this.speakTurnContent(turn, generated, options);
  }

  cancelActiveTurn(): void {
    if (this.activeTurnId) {
      voiceDirector.cancelTurn(this.activeTurnId, true);
      this.activeTurnId = null;
    }
    this.generatingTurnId = null;
    this.generationAbort?.abort();
    this.generationAbort = null;
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
      interruptible: true,
      dedupeKey: `loadout-ball:${turnId}`,
      metadata,
    });
  }

  private async generatePlayerLine(
    turn: DialogueTurn,
    signal?: AbortSignal
  ): Promise<GeneratedLoadoutLine> {
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
        signal,
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
      if (signal?.aborted) throw error;
      if (import.meta.env.DEV) {
        console.warn('[DialogueTurn] player line generation failed', error);
      }
      throw error;
    }
  }

  private async generateCharacterReaction(
    turn: DialogueTurn,
    playerLine: string,
    signal?: AbortSignal
  ): Promise<GeneratedReaction> {
    const ballId = turn.target.id.startsWith('ball:')
      ? turn.target.id.slice('ball:'.length)
      : turn.target.characterId;

    const result = await classifyPlayerResponse(
      {
        playerText: playerLine || `[Emotional Loadout: ${turn.loadout}]`,
        ballId,
        situation: turn.triggeringEvent || 'hoverResponse',
        responseModeId: turn.loadout,
        responseModeName: turn.loadout,
        responseModeDescription: `Player used Emotional Loadout: ${turn.loadout}`,
      },
      { signal }
    );

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
