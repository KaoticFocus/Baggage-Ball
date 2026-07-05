export type BallStats = {
  trust: number;
  resentment: number;
  ego: number;
  chaos: number;
  attachment: number;
  dramaNeed: number;
  patience: number;
};

export type BehaviorModifier =
  | 'helpfulCurve'
  | 'hostileFakeOut'
  | 'erraticBounce'
  | 'speedSpike'
  | 'slowDown'
  | 'fakeOut'
  | 'gentleReturn'
  | 'dramaticPause'
  | 'clingyDrift'
  | 'resentmentShot'
  | 'chaosWobble'
  | 'speedUp';

export type BallPersonality = {
  id: string;
  name: string;
  title: string;
  description: string;
  startingStats: BallStats;
  dialogueStyle: string;
  recapNotes: string[];
};

export type GameSessionData = {
  ballId: string;
  score: number;
  longestRally: number;
  finalStats: BallStats;
  paddleHits: number;
  wallBounces: number;
};

export type RecapData = GameSessionData & {
  ballName: string;
  note: string;
  relationshipStatus: string;
  emotionalDiagnosis: string;
  highestStat: { key: keyof BallStats; value: number };
  lowestStat: { key: keyof BallStats; value: number };
  worstThingThePlayerDid?: string;
  replayHook?: string;
  aiGenerated?: boolean;
};

export const STAT_KEYS: (keyof BallStats)[] = [
  'trust',
  'resentment',
  'ego',
  'chaos',
  'attachment',
  'dramaNeed',
  'patience',
];

export const STAT_LABELS: Record<keyof BallStats, string> = {
  trust: 'Trust',
  resentment: 'Resentment',
  ego: 'Ego',
  chaos: 'Chaos',
  attachment: 'Attachment',
  dramaNeed: 'Drama Need',
  patience: 'Patience',
};

export function clampStat(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function applyStatChanges(
  stats: BallStats,
  changes: Partial<BallStats>
): BallStats {
  const next = { ...stats };
  for (const key of STAT_KEYS) {
    if (changes[key] !== undefined) {
      next[key] = clampStat(next[key] + (changes[key] ?? 0));
    }
  }
  return next;
}

export function cloneStats(stats: BallStats): BallStats {
  return { ...stats };
}

export function getHighestStat(stats: BallStats): { key: keyof BallStats; value: number } {
  let best: keyof BallStats = 'trust';
  let bestVal = -1;
  for (const key of STAT_KEYS) {
    if (stats[key] > bestVal) {
      bestVal = stats[key];
      best = key;
    }
  }
  return { key: best, value: bestVal };
}

export function getLowestStat(stats: BallStats): { key: keyof BallStats; value: number } {
  let worst: keyof BallStats = 'trust';
  let worstVal = 101;
  for (const key of STAT_KEYS) {
    if (stats[key] < worstVal) {
      worstVal = stats[key];
      worst = key;
    }
  }
  return { key: worst, value: worstVal };
}
