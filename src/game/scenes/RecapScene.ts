import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';
import { buildMatchRecap } from '../systems/MatchRecapSystem';
import { getPlayerPaddleSide, getSelectedOpponentId } from '../settings/PlayerSettings';
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

    uiManager.showMatchRecap(recap, {
      onRematch: () => {
        uiManager.hideMatchRecap();
        this.scene.start('PlayScene', {
          ballId: data.ballId,
          playerSide: getPlayerPaddleSide(),
          opponentId: getSelectedOpponentId(),
        });
      },
      onChangeBall: () => {
        uiManager.hideMatchRecap();
        this.scene.start('MenuScene');
      },
      onChangeOpponent: () => {
        uiManager.hideMatchRecap();
        this.scene.start('MenuScene', { focusOpponent: true });
      },
      onMainMenu: () => {
        uiManager.hideMatchRecap();
        this.scene.start('MenuScene');
      },
    });
  }
}
