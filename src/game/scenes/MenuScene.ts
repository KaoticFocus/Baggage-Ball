import Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: 'MenuScene' });
  }

  create(): void {
    uiManager.showMenu();
  }
}
