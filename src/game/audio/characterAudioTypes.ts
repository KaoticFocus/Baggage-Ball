import type { DialogueSituation } from '../types/DialogueTypes';
import type { OpponentBarkSituation } from '../types/OpponentTypes';

export type CharacterKind = 'ball' | 'opponent';

export type CharacterAudioCategory =
  | 'opening'
  | 'clingy'
  | 'jealous'
  | 'wounded'
  | 'spiraling'
  | 'softened'
  | 'ambient'
  | 'scoreReaction'
  | 'missReaction'
  | 'hoverDialogue'
  | 'nearMiss'
  | 'resentmentSpike'
  | 'praiseDemand'
  | 'longRally'
  | 'lowTrust'
  | 'strategyRethink';

export type CharacterAudioPriority = 'low' | 'medium' | 'high';

export type CharacterAudioInterrupt = 'never' | 'same-or-lower' | 'always';

export type CharacterAudioCue = {
  characterId: string;
  characterKind: CharacterKind;
  category: CharacterAudioCategory;
  cueId: string;
  path: string;
  text?: string;
  emotionalState?: string;
  volume?: number;
  playbackRate?: number;
  priority?: CharacterAudioPriority;
  cooldownMs?: number;
  interrupt?: CharacterAudioInterrupt;
};

export type CharacterAudioManifest = Record<
  string,
  Partial<Record<CharacterAudioCategory, CharacterAudioCue[]>>
>;

export type CharacterAudioPlayOptions = {
  priority?: CharacterAudioPriority;
  volume?: number;
  playbackRate?: number;
  interrupt?: CharacterAudioInterrupt;
  stopCurrent?: boolean;
};

export type CharacterAudioResult = {
  ok: boolean;
  result:
    | 'played'
    | 'missing-character'
    | 'missing-cue'
    | 'missing-category'
    | 'not-loaded'
    | 'muted'
    | 'cooldown'
    | 'repeat-blocked'
    | 'priority-blocked'
    | 'load-pending';
  cue?: CharacterAudioCue;
  durationMs?: number;
  message?: string;
};

export type CharacterAudioGameEvent = {
  characterId: string;
  characterKind: CharacterKind;
  situation?: DialogueSituation | OpponentBarkSituation;
  emotionalState?: string;
  scoringResult?: 'playerScored' | 'opponentScored';
};
