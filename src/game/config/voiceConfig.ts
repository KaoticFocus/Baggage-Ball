/**
 * Client-side speaker identity config.
 * Maps game entities to server character-speech ids (never raw ElevenLabs voice ids).
 */

import type { EmotionalLoadoutId, SpeakerRef } from '../audio/speechTypes';

export const DEBUG_DIALOGUE =
  import.meta.env.DEV && import.meta.env.VITE_DEBUG_DIALOGUE === 'true';

export const VOICE_SPEAKER_IDS = {
  player: 'player-paddle',
  opponent: 'opponent-paddle',
} as const;

/** Map in-game ball ids to character-speech characterIds. */
export const BALL_SPEECH_CHARACTER_ID: Record<string, string> = {
  valentine: 'valentine',
  orb: 'orb',
  bolt: 'bolt',
};

/** Map opponent ids to character-speech characterIds. */
export const OPPONENT_SPEECH_CHARACTER_ID: Record<string, string> = {
  midlifeDave: 'midlife-dave',
};

export function createPlayerSpeaker(): SpeakerRef {
  return {
    id: VOICE_SPEAKER_IDS.player,
    kind: 'player-paddle',
    characterId: 'player-paddle',
  };
}

export function createOpponentSpeaker(opponentId: string): SpeakerRef {
  const characterId = OPPONENT_SPEECH_CHARACTER_ID[opponentId] ?? 'midlife-dave';
  return {
    id: VOICE_SPEAKER_IDS.opponent,
    kind: 'opponent-paddle',
    characterId,
  };
}

export function createBallSpeaker(ballId: string): SpeakerRef {
  const characterId = BALL_SPEECH_CHARACTER_ID[ballId] ?? ballId;
  return {
    id: `ball:${ballId}`,
    kind: 'ball',
    characterId,
  };
}

export function isEmotionalLoadoutId(value: string): value is EmotionalLoadoutId {
  return (
    value === 'deflect' ||
    value === 'apologize' ||
    value === 'validate' ||
    value === 'challenge' ||
    value === 'flirt' ||
    value === 'mock' ||
    value === 'reassure' ||
    value === 'set-boundary' ||
    value === 'go-silent'
  );
}
