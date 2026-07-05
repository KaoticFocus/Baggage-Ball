import { createBaggageBallGame } from './game/BaggageBallGame';
import { uiManager } from './ui/UIManager';

const game = createBaggageBallGame('game-container');

// Wire ball pick immediately — menu HTML is visible before Phaser scenes boot
uiManager.setBallSelectHandler((ballId) => {
  game.scene.start('PlayScene', { ballId });
});
