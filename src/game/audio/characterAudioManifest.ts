import type { CharacterAudioManifest } from './characterAudioTypes';

/**
 * Central registry for character voice files.
 * All static file paths must be registered here.
 */
export const characterAudioManifest = {
  valentine: {
    opening: [
      {
        characterId: 'valentine',
        characterKind: 'ball',
        category: 'opening',
        cueId: 'opening-001-love-me-correctly',
        path: '/audio/characters/valentine/opening/opening-001-love-me-correctly.mp3',
        text: 'Love me correctly or suffer the consequences.',
        priority: 'medium',
        interrupt: 'same-or-lower',
      },
      {
        characterId: 'valentine',
        characterKind: 'ball',
        category: 'opening',
        cueId: 'opening-002-ready-to-be-adored',
        path: '/audio/characters/valentine/opening/opening-002-ready-to-be-adored.mp3',
        text: 'I am ready to be adored. Do not mess this up.',
        priority: 'medium',
        interrupt: 'same-or-lower',
      },
      {
        characterId: 'valentine',
        characterKind: 'ball',
        category: 'opening',
        cueId: 'opening-003-every-bounce-is-intimacy',
        path: '/audio/characters/valentine/opening/opening-003-every-bounce-is-intimacy.mp3',
        text: 'Every bounce is intimacy. Do not waste it.',
        priority: 'medium',
        interrupt: 'same-or-lower',
      },
    ],
    clingy: [],
    jealous: [],
    wounded: [],
    spiraling: [],
    softened: [],
    scoreReaction: [],
    missReaction: [],
    hoverDialogue: [],
    nearMiss: [],
    resentmentSpike: [],
    praiseDemand: [],
    longRally: [],
    lowTrust: [],
    strategyRethink: [],
  },
  startupGuy: {
    ambient: [],
    scoreReaction: [],
  },
  hoaLinda: {
    ambient: [],
    scoreReaction: [],
  },
} satisfies CharacterAudioManifest;
