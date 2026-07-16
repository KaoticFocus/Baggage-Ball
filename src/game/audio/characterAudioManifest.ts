/**
 * @deprecated Prerecorded character voice files are no longer used.
 * Runtime speech is generated via VoiceDirector → Netlify character-speech.
 * Paths are retained only as historical documentation — do not load them.
 */
import type { CharacterAudioManifest } from './characterAudioTypes';

export const characterAudioManifest = {
  valentine: {
    opening: [],
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
