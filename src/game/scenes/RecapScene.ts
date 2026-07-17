import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';
import { buildMatchRecap } from '../systems/MatchRecapSystem';
import { getPlayerPaddleSide, getSelectedOpponentId } from '../settings/PlayerSettings';
import { gameNavigation } from '../navigation/GameNavigationController';
import type { BallStats } from '../types/BallTypes';

/** Legacy scene — match end now uses the HTML match recap overlay from PlayScene. */
export class RecapScene extends Phaser.Scene {
  constructor() {
    super({ key: 'RecapScene' });
  }

  create(data: {
    ballId: string;
    opponentId: Parameters<typeof buildMatchRecap>[1];
    winner: 'player' | 'opponent';
    playerPoints: number;
    opponentPoints: number;
    longestRally: number;
    finalStats: BallStats;
  }): void {
    const recap = buildMatchRecap(
      data.ballId,
      data.opponentId,
      data.winner,
      data.playerPoints,
      data.opponentPoints,
      data.longestRally,
      data.finalStats
    );

    // Recap actions use app-level navigation — never this.scene / PlayScene closures.
    uiManager.showMatchRecap(recap, {
      onRematch: () => {
        gameNavigation.restartMatch({
          ballId: data.ballId,
          playerSide: getPlayerPaddleSide(),
          opponentId: getSelectedOpponentId(),
        });
      },
      onChangeBall: () => gameNavigation.goToMainMenu(),
      onChangeOpponent: () => gameNavigation.goToMainMenu({ focusOpponent: true }),
      onMainMenu: () => gameNavigation.goToMainMenu(),
    });
  }
}
