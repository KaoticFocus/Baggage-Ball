import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GAME_LAYOUT } from './layout/GameLayout';
import { MenuScene } from './scenes/MenuScene';
import { PlayScene } from './scenes/PlayScene';
import { RecapScene } from './scenes/RecapScene';
import { gameNavigation } from './navigation/GameNavigationController';

export function createBaggageBallGame(parent: string): Phaser.Game {
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent,
    width: GAME_LAYOUT.CANVAS_WIDTH,
    height: GAME_LAYOUT.CANVAS_HEIGHT,
    backgroundColor: '#0a0a12',
    physics: {
      default: 'arcade',
      arcade: {
        gravity: { x: 0, y: 0 },
        debug: false,
      },
    },
    scene: [BootScene, MenuScene, PlayScene, RecapScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  });

  // One navigation owner for the whole app — not per scene.
  gameNavigation.bindGame(game);
  return game;
}
