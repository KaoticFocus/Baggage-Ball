import type { OpponentId } from '../types/OpponentTypes';

export type { OpponentId } from '../types/OpponentTypes';
export type PaddleSide = 'left' | 'right';

const PADDLE_STORAGE_KEY = 'baggage-ball-paddle-side';
const OPPONENT_STORAGE_KEY = 'baggage-ball-opponent-id';

const DEFAULT_OPPONENT_ID: OpponentId = 'midlifeDave';

export function getPlayerPaddleSide(): PaddleSide {
  try {
    const stored = localStorage.getItem(PADDLE_STORAGE_KEY);
    return stored === 'left' ? 'left' : 'right';
  } catch {
    return 'right';
  }
}

export function setPlayerPaddleSide(side: PaddleSide): void {
  try {
    localStorage.setItem(PADDLE_STORAGE_KEY, side);
  } catch {
    // Ignore storage failures in restricted environments.
  }
}

export function getSelectedOpponentId(): OpponentId {
  try {
    const stored = localStorage.getItem(OPPONENT_STORAGE_KEY);
    if (
      stored === 'midlifeDave' ||
      stored === 'groundedTeen' ||
      stored === 'hoaLinda' ||
      stored === 'startupGuy' ||
      stored === 'retiredGymTeacher'
    ) {
      return stored;
    }
  } catch {
    // Ignore storage failures.
  }
  return DEFAULT_OPPONENT_ID;
}

export function setSelectedOpponentId(opponentId: OpponentId): void {
  try {
    localStorage.setItem(OPPONENT_STORAGE_KEY, opponentId);
  } catch {
    // Ignore storage failures.
  }
}

export function getOpponentPaddleSide(playerSide: PaddleSide): PaddleSide {
  return playerSide === 'left' ? 'right' : 'left';
}
