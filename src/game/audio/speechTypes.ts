/**
 * Shared speech types for the unified VoiceDirector pipeline.
 * Voice IDs stay server-side; the client identifies speakers by characterId only.
 */

export type SpeakerKind = 'player-paddle' | 'opponent-paddle' | 'ball';

export type EmotionalLoadoutId =
  | 'deflect'
  | 'apologize'
  | 'validate'
  | 'challenge'
  | 'flirt'
  | 'mock'
  | 'reassure'
  | 'set-boundary'
  | 'go-silent';

export type SpeechCategory =
  | 'matchIntro'
  | 'matchOutro'
  | 'hoverPrompt'
  | 'emotionalResponse'
  | 'reaction'
  | 'rallyBark'
  | 'scoreReaction'
  | 'ambientBark';

/**
 * Higher number = higher priority.
 * emotionalResponse (8) … ambientBark (1)
 */
export type SpeechPriority =
  | 'emotionalResponse'
  | 'hoverPrompt'
  | 'matchOutro'
  | 'matchIntro'
  | 'scoreReaction'
  | 'reaction'
  | 'rallyBark'
  | 'ambientBark';

export const SPEECH_PRIORITY_RANK: Record<SpeechPriority, number> = {
  emotionalResponse: 8,
  hoverPrompt: 7,
  matchOutro: 6,
  matchIntro: 5,
  scoreReaction: 4,
  reaction: 3,
  rallyBark: 2,
  ambientBark: 1,
};

export interface SpeakerRef {
  id: string;
  kind: SpeakerKind;
  /** Server-side character-speech characterId (never a raw ElevenLabs voice id). */
  characterId: string;
}

export interface SpeechRequest {
  id?: string;
  characterId: string;
  text: string;
  priority: SpeechPriority;
  category: SpeechCategory;
  /** Visual / waveform speaker id; defaults to characterId. */
  speakerId?: string;
  speakerKind?: SpeakerKind;
  interactionId?: number | string;
  interruptible?: boolean;
  dedupeKey?: string;
  turnId?: string;
  metadata?: Record<string, unknown>;
  onStart?: () => void;
  onComplete?: () => void;
  onCancel?: () => void;
  onError?: (error: unknown) => void;
}

export type NormalizedSpeechRequest = SpeechRequest & {
  id: string;
  speakerId: string;
  speakerKind: SpeakerKind;
  interruptible: boolean;
  turnId: string;
  text: string;
};

export interface SpeechStartEvent {
  requestId: string;
  characterId: string;
  speakerId: string;
  speaker: SpeakerRef;
  turnId: string;
  category: SpeechCategory;
  priority: SpeechPriority;
  text: string;
}

export interface SpeechEndEvent {
  requestId: string;
  characterId: string;
  speakerId: string;
  speaker: SpeakerRef;
  turnId: string;
  category: SpeechCategory;
  priority: SpeechPriority;
  ok: boolean;
  durationMs: number;
  cancelled?: boolean;
}

export type VoiceSpeakResult = {
  ok: boolean;
  durationMs: number;
  cancelled: boolean;
  requestId: string;
  message?: string;
};

export interface DialogueTurn {
  id: string;
  loadout: EmotionalLoadoutId;
  player: SpeakerRef;
  target: SpeakerRef;
  triggeringEvent: string;
  recentDialogue: string[];
  relationshipSnapshot: Record<string, number>;
  emotionalStateSnapshot: Record<string, number | string>;
  createdAt: number;
}

export interface GeneratedLoadoutLine {
  turnId: string;
  playerLine: string;
  intensity: number;
  deliveryHints?: string[];
}

export interface GeneratedReaction {
  turnId: string;
  reactionLine: string;
  emotionalOutcome: string;
  relationshipChanges: Record<string, number>;
  deliveryHints?: string[];
  behaviorModifier?: string;
  tone?: string;
  playerResponse?: string;
}
