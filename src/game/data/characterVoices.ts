/**
 * Central character → server speech-id configuration.
 * ElevenLabs voice IDs remain server-side (env vars); this file never embeds them.
 */

import type { SpeakerKind } from '../audio/speechTypes';

export type CharacterVoiceConfig = {
  characterId: string;
  /** Server character-speech id (maps to ELEVENLABS_VOICE_* on the server). */
  speechCharacterId: string;
  kind: SpeakerKind;
  /** Optional display label for diagnostics. */
  label: string;
};

/**
 * Data-driven roster. Add future characters here only — do not scatter voice ids in scenes.
 */
export const CHARACTER_VOICES: Record<string, CharacterVoiceConfig> = {
  valentine: {
    characterId: 'valentine',
    speechCharacterId: 'valentine',
    kind: 'ball',
    label: 'Valentine',
  },
  'midlife-dave': {
    characterId: 'midlife-dave',
    speechCharacterId: 'midlife-dave',
    kind: 'opponent-paddle',
    label: 'Midlife Dave',
  },
  midlifeDave: {
    characterId: 'midlifeDave',
    speechCharacterId: 'midlife-dave',
    kind: 'opponent-paddle',
    label: 'Midlife Dave',
  },
  'player-paddle': {
    characterId: 'player-paddle',
    speechCharacterId: 'player-paddle',
    kind: 'player-paddle',
    label: 'Player Paddle',
  },
  'opponent-paddle': {
    characterId: 'opponent-paddle',
    speechCharacterId: 'midlife-dave',
    kind: 'opponent-paddle',
    label: 'Opponent Paddle',
  },
  orb: {
    characterId: 'orb',
    speechCharacterId: 'orb',
    kind: 'ball',
    label: 'Orb',
  },
  bolt: {
    characterId: 'bolt',
    speechCharacterId: 'bolt',
    kind: 'ball',
    label: 'Bolt',
  },
};

export function resolveCharacterVoice(
  characterId: string
): CharacterVoiceConfig | null {
  return CHARACTER_VOICES[characterId] ?? null;
}

export function resolveSpeechCharacterId(characterId: string): string {
  return resolveCharacterVoice(characterId)?.speechCharacterId ?? characterId;
}

export function resolveSpeakerKind(characterId: string): SpeakerKind {
  return resolveCharacterVoice(characterId)?.kind ?? 'ball';
}
