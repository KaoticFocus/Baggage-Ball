import type { BallStats } from '../types/BallTypes';
import { getHighestStat, getLowestStat } from '../types/BallTypes';
import { getPersonalityById } from '../data/ballPersonalities';
import { getOpponentProfile } from '../data/opponentMonologues';
import type { OpponentId } from '../types/OpponentTypes';
import { formatStatLabel } from './RecapSystem';

export type MatchRecapData = {
  ballId: string;
  opponentId: OpponentId;
  winner: 'player' | 'opponent';
  playerPoints: number;
  opponentPoints: number;
  ballName: string;
  opponentName: string;
  opponentShortName: string;
  longestRally: number;
  finalStats: BallStats;
  relationshipStatus: string;
  emotionalDiagnosis: string;
  ballNote: string;
  opponentNote: string;
  highestStatLabel: string;
  lowestStatLabel: string;
};

const RELATIONSHIP: Record<string, (s: BallStats, won: boolean) => string> = {
  orb: (s, won) =>
    won
      ? s.ego > 75
        ? 'Critically acclaimed (by itself)'
        : 'Artistically satisfied. For now.'
      : 'Review pending. Badly.',
  bolt: (s, won) =>
    won
      ? s.resentment < 40
        ? 'Tolerated with mild surprise'
        : 'Still irritated, but impressed'
      : 'Professionally disappointed',
  valentine: (s, won) =>
    won
      ? s.attachment > 80
        ? 'Dangerously reattached'
        : 'Unresolved but playable'
      : 'Emotionally litigated',
};

const BALL_MATCH_NOTES: Record<string, { win: string; lose: string }> = {
  orb: {
    win: 'You won. I shall process this artistically.',
    lose: 'The audience deserved better. I deserved better.',
  },
  bolt: {
    win: 'You won. I am still having a bad day, for the record.',
    lose: 'Figures. My mood was already terminal.',
  },
  valentine: {
    win: 'You won, but somehow I still feel abandoned.',
    lose: 'You lost, and my heart has filed a complaint.',
  },
};

const OPPONENT_MATCH_NOTES: Record<OpponentId, { win: string; lose: string }> = {
  midlifeDave: {
    win: 'I lost, but at least this counted as trying something new.',
    lose: 'Victory! My smartwatch would be proud if I still wore it.',
  },
  groundedTeen: {
    win: 'I lost. Whatever. I was barely trying.',
    lose: 'W. Not that I care. Much.',
  },
  hoaLinda: {
    win: 'Loss noted. I will review the bylaws.',
    lose: 'Victory is permitted. Celebration is not.',
  },
  startupGuy: {
    win: 'We pivoted to losing. Valuable data.',
    lose: 'Crushed it. Disrupting paddle sports since today.',
  },
  retiredGymTeacher: {
    win: 'You beat me. I am proud and furious.',
    lose: 'Good hustle. Drop and give me twenty thoughts.',
  },
};

export function getOpponentShortName(opponentId: OpponentId): string {
  const name = getOpponentProfile(opponentId).displayName;
  const parts = name.split(' ');
  return parts.length > 1 ? parts[parts.length - 1].toUpperCase() : name.toUpperCase();
}

export function buildMatchRecap(
  ballId: string,
  opponentId: OpponentId,
  winner: 'player' | 'opponent',
  playerPoints: number,
  opponentPoints: number,
  longestRally: number,
  finalStats: BallStats
): MatchRecapData {
  const personality = getPersonalityById(ballId);
  const opponent = getOpponentProfile(opponentId);
  const highest = getHighestStat(finalStats);
  const lowest = getLowestStat(finalStats);
  const playerWon = winner === 'player';
  const statusFn = RELATIONSHIP[ballId] ?? (() => 'It\'s complicated (still)');
  const ballNotes = BALL_MATCH_NOTES[ballId] ?? BALL_MATCH_NOTES.orb;
  const oppNotes = OPPONENT_MATCH_NOTES[opponentId];

  return {
    ballId,
    opponentId,
    winner,
    playerPoints,
    opponentPoints,
    ballName: personality?.name ?? 'Ball',
    opponentName: opponent.displayName,
    opponentShortName: getOpponentShortName(opponentId),
    longestRally,
    finalStats,
    relationshipStatus: statusFn(finalStats, playerWon),
    emotionalDiagnosis: `${formatStatLabel(highest.key)} peaked at ${Math.round(highest.value)}. ${formatStatLabel(lowest.key)} bottomed out at ${Math.round(lowest.value)}.`,
    ballNote: playerWon ? ballNotes.win : ballNotes.lose,
    opponentNote: playerWon ? oppNotes.win : oppNotes.lose,
    highestStatLabel: formatStatLabel(highest.key),
    lowestStatLabel: formatStatLabel(lowest.key),
  };
}
