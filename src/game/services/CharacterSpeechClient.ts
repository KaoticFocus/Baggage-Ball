/**
 * CharacterSpeechClient — thin VoiceDirector wrappers for named characters.
 * No direct fetch / Audio playback. No prerecorded fallbacks.
 */

import { voiceDirector } from '../audio/VoiceDirector';
import type { SpeechCategory, SpeechPriority } from '../audio/speechTypes';
import { VOICE_SPEAKER_IDS } from '../config/voiceConfig';
import { soundManager } from './SoundManager';

const SUPPORTED_CHARACTER_IDS = new Set(['valentine', 'midlife-dave', 'player-paddle']);

function mapEventToPriority(eventType: string): { priority: SpeechPriority; category: SpeechCategory } {
  if (eventType.startsWith('opponentBark:')) {
    const situation = eventType.slice('opponentBark:'.length);
    if (situation === 'matchStart') return { priority: 'matchIntro', category: 'matchIntro' };
    if (situation === 'playerScores' || situation === 'opponentScores' || situation === 'playerMisses' || situation === 'opponentMisses') {
      return { priority: 'scoreReaction', category: 'scoreReaction' };
    }
    if (situation === 'ballHoverStarts' || situation === 'ballHoverEnds') {
      return { priority: 'reaction', category: 'reaction' };
    }
    if (situation === 'randomGameplay') return { priority: 'ambientBark', category: 'ambientBark' };
    return { priority: 'rallyBark', category: 'rallyBark' };
  }
  return { priority: 'reaction', category: 'reaction' };
}

function speakerIdFor(characterId: string): string {
  if (characterId === 'midlife-dave') return VOICE_SPEAKER_IDS.opponent;
  if (characterId === 'player-paddle') return VOICE_SPEAKER_IDS.player;
  return `ball:${characterId}`;
}

export function stopCharacterSpeech(): void {
  voiceDirector.stopAll();
}

export async function speakCharacterLine(
  characterId: string,
  text: string,
  eventType: string
): Promise<number> {
  if (!SUPPORTED_CHARACTER_IDS.has(characterId)) return 0;
  const trimmed = text.trim();
  if (!trimmed) return 0;
  if (soundManager.isMuted()) return 0;

  const { priority, category } = mapEventToPriority(eventType);
  await voiceDirector.ensureAudioReady();

  const result = await voiceDirector.speak({
    characterId,
    speakerId: speakerIdFor(characterId),
    text: trimmed.slice(0, 120),
    priority,
    category,
    interruptible: priority === 'rallyBark' || priority === 'ambientBark',
    dedupeKey: `${characterId}:${category}:${trimmed.toLowerCase()}`,
    metadata: { eventType },
  });

  return result.durationMs;
}
