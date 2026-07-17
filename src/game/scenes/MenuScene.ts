import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';
import { gameNavigation } from '../navigation/GameNavigationController';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(data?: { focusOpponent?: boolean }): void {
    if (import.meta.env.DEV) {
      console.log('[Navigation] MenuScene created');
    }
    // Establish a complete menu state — do not assume PlayScene cleaned anything.
    uiManager.setGameplayCursorHidden(false);
    uiManager.showMenu({ focusOpponent: Boolean(data?.focusOpponent) });
    gameNavigation.onMenuSceneCreated();
  }
}
