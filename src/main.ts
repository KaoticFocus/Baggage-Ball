import { createBaggageBallGame } from './game/BaggageBallGame';
import { uiManager } from './ui/UIManager';

const game = createBaggageBallGame('game-container');

uiManager.setBallSelectHandler((ballId, playerSide, opponentId) => {
  game.scene.start('PlayScene', { ballId, playerSide, opponentId });
});
