import type { BallStats, RecapData } from '../types/BallTypes';
import { getHighestStat, getLowestStat, STAT_LABELS } from '../types/BallTypes';
import { getPersonalityById } from '../data/ballPersonalities';

const RELATIONSHIP_STATUS: Record<string, (stats: BallStats) => string> = {
  orb: (s) => {
    if (s.ego > 80 && s.trust > 50) return 'Critically acclaimed (by itself)';
    if (s.trust < 30) return 'Artistically disappointing';
    if (s.resentment > 60) return 'Review pending. Badly.';
    return 'Avant-garde and unsupervised';
  },
  bolt: (s) => {
    if (s.trust > 55 && s.resentment < 35) return 'Tolerated';
    if (s.resentment > 70) return 'Actively hostile';
    if (s.patience < 20) return 'One bounce from HR';
    return 'Professionally distant';
  },
  valentine: (s) => {
    if (s.attachment > 85 && s.trust > 50) return 'Unresolved but playable';
    if (s.resentment > 75) return 'Emotionally litigated';
    if (s.trust < 25) return 'Ghosted again (in spirit)';
    if (s.attachment > 90) return 'Dangerously reattached';
    return 'It\'s complicated (still)';
  },
};

const DIAGNOSIS: Record<string, (stats: BallStats, high: keyof BallStats, low: keyof BallStats) => string> = {
  orb: (_s, high, low) => {
    if (high === 'ego') return 'Main-character syndrome with orbital velocity.';
    if (low === 'patience') return 'Will not be rushed. Will be dramatic.';
    return 'Performance art with abandonment issues.';
  },
  bolt: (_s, high, low) => {
    if (high === 'resentment') return 'Bad day extended into bad rally.';
    if (low === 'patience') return 'Running on spite and caffeine withdrawal.';
    return 'Functional misery. Barely.';
  },
  valentine: (s, high, low) => {
    if (high === 'attachment') return 'Clingier than your browser history.';
    if (s.resentment > 60 && s.attachment > 70) return 'Loves you. Hates you. Bounces anyway.';
    if (low === 'trust') return 'Trust issues with a spherical shape.';
    return 'Stream-ready emotional damage.';
  },
};

export function buildRecapData(
  ballId: string,
  ballName: string,
  score: number,
  longestRally: number,
  finalStats: BallStats,
  paddleHits: number,
  wallBounces: number
): RecapData {
  const personality = getPersonalityById(ballId);
  const highest = getHighestStat(finalStats);
  const lowest = getLowestStat(finalStats);
  const statusFn = RELATIONSHIP_STATUS[ballId] ?? (() => 'Undefined');
  const diagnosisFn = DIAGNOSIS[ballId] ?? (() => 'Emotionally spherical.');
  const notes = personality?.recapNotes ?? ['Goodbye.'];
  const note = notes[Math.floor(Math.random() * notes.length)];

  return {
    ballId,
    ballName,
    score,
    longestRally,
    finalStats,
    paddleHits,
    wallBounces,
    note,
    relationshipStatus: statusFn(finalStats),
    emotionalDiagnosis: diagnosisFn(finalStats, highest.key, lowest.key),
    highestStat: { key: highest.key, value: highest.value },
    lowestStat: { key: lowest.key, value: lowest.value },
  };
}

export function formatStatLabel(key: keyof BallStats): string {
  return STAT_LABELS[key];
}
