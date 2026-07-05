import type { PaddleSide } from '../settings/PlayerSettings';

export const MATCH_WIN_SCORE = 5;

export type PointWinner = 'player' | 'opponent';

export class MatchSystem {
  playerPoints = 0;
  opponentPoints = 0;
  private lastPointLoser: PointWinner | null = null;
  private firstServeDone = false;

  reset(): void {
    this.playerPoints = 0;
    this.opponentPoints = 0;
    this.lastPointLoser = null;
    this.firstServeDone = false;
  }

  recordPlayerPoint(): void {
    this.playerPoints++;
    this.lastPointLoser = 'opponent';
    this.firstServeDone = true;
  }

  recordOpponentPoint(): void {
    this.opponentPoints++;
    this.lastPointLoser = 'player';
    this.firstServeDone = true;
  }

  isOver(): boolean {
    return this.playerPoints >= MATCH_WIN_SCORE || this.opponentPoints >= MATCH_WIN_SCORE;
  }

  getWinner(): PointWinner | null {
    if (this.playerPoints >= MATCH_WIN_SCORE) return 'player';
    if (this.opponentPoints >= MATCH_WIN_SCORE) return 'opponent';
    return null;
  }

  /** Serve toward the side that lost the last point. First serve goes toward the player. */
  getServeTarget(playerSide: PaddleSide): PaddleSide {
    if (!this.firstServeDone) {
      return playerSide;
    }
    if (this.lastPointLoser === 'player') {
      return playerSide;
    }
    return playerSide === 'left' ? 'right' : 'left';
  }
}
