import type {
  CharacterAudioCategory,
  CharacterAudioGameEvent,
  CharacterAudioPriority,
} from './characterAudioTypes';

export type CharacterAudioEventMapping = {
  category: CharacterAudioCategory;
  priority: CharacterAudioPriority;
};

export function mapGameEventToAudioCategory(
  event: CharacterAudioGameEvent
): CharacterAudioEventMapping | null {
  if (event.characterKind === 'opponent') {
    switch (event.situation) {
      case 'randomGameplay':
      case 'ballHoverEnds':
        return { category: 'ambient', priority: 'low' };
      case 'playerScores':
      case 'opponentScores':
      case 'playerMisses':
      case 'opponentMisses':
        return { category: 'scoreReaction', priority: 'medium' };
      default:
        return null;
    }
  }

  if (event.scoringResult === 'playerScored') {
    return { category: 'scoreReaction', priority: 'high' };
  }
  if (event.scoringResult === 'opponentScored') {
    return { category: 'missReaction', priority: 'high' };
  }

  switch (event.situation) {
    case 'clingyInterruption':
      return { category: 'clingy', priority: 'high' };
    case 'accusation':
      return { category: 'jealous', priority: 'high' };
    case 'nearMissReaction':
    case 'nearMiss':
      return { category: 'nearMiss', priority: 'high' };
    case 'resentmentSpike':
      return { category: 'resentmentSpike', priority: 'high' };
    case 'praiseDemand':
      return { category: 'praiseDemand', priority: 'high' };
    case 'longRally':
      return { category: 'longRally', priority: 'high' };
    case 'lowTrust':
      return { category: 'lowTrust', priority: 'high' };
    case 'strategyRethink':
      return { category: 'strategyRethink', priority: 'high' };
    case 'randomHover':
    case 'modeSwitchToText':
    case 'highResentment':
    case 'existentialCrisis':
    case 'boredomComplaint':
    case 'silenceReaction':
      return { category: 'hoverDialogue', priority: 'high' };
    default:
      return null;
  }
}
