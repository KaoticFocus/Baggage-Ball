import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(data?: { focusOpponent?: boolean }): void {
    uiManager.showMenu({ focusOpponent: Boolean(data?.focusOpponent) });
  }
}
