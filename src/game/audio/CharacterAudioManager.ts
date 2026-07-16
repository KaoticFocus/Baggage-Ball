/**
 * @deprecated Prerecorded character dialogue is retired.
 * All character speech must go through VoiceDirector + ElevenLabs.
 * This manager remains only so old imports do not crash; playCue is a no-op.
 */

import type { CharacterAudioManifest } from './characterAudioTypes';
import type { CharacterAudioResult } from './characterAudioTypes';
import type { CharacterAudioPriority } from './characterAudioTypes';

class CharacterAudioManager {
  private muted = false;

  preload(_scene: unknown): void {
    // No-op: prerecorded character audio is disabled.
  }

  loadSelectedCharacters(_scene: unknown, _characterIds: string[]): Promise<void> {
    return Promise.resolve();
  }

  getAudioKey(characterId: string, cueId: string): string {
    return `${characterId}:${cueId}`;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  isMuted(): boolean {
    return this.muted;
  }

  playCue(
    _scene: unknown,
    characterId: string,
    cueId: string,
    _options?: { priority?: CharacterAudioPriority; interrupt?: string }
  ): CharacterAudioResult {
    if (import.meta.env.DEV) {
      console.warn(
        '[CharacterAudio] prerecorded dialogue disabled — use VoiceDirector',
        { characterId, cueId }
      );
    }
    return {
      ok: false,
      result: 'missing-cue',
      message: 'Prerecorded character speech disabled; use VoiceDirector',
    };
  }

  stopAll(_scene?: unknown): void {
    // No-op
  }

  /** Retained for type compatibility; unused. */
  getManifest(): CharacterAudioManifest | null {
    return null;
  }
}

export const characterAudio = new CharacterAudioManager();
