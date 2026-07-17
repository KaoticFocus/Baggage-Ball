import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(data?: { focusOpponent?: boolean }): void {
    if (import.meta.env.DEV) {
      console.log('[Lifecycle] MenuScene created');
    }
    // Menu must not depend on PlayScene cleanup having succeeded.
    uiManager.showMenu({ focusOpponent: Boolean(data?.focusOpponent) });
  }
}
