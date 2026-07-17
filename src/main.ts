import { createBaggageBallGame } from './game/BaggageBallGame';
import { gameNavigation } from './game/navigation/GameNavigationController';
import { uiManager } from './ui/UIManager';

createBaggageBallGame('game-container');

// Stable app-level navigation actions — never replaced by PlayScene closures.
uiManager.setNavigationActions({
  goToMainMenu: (options) => gameNavigation.goToMainMenu(options),
  startMatch: (data) => gameNavigation.startMatch(data),
  restartMatch: (data) => gameNavigation.restartMatch(data),
});

uiManager.setBallSelectHandler((ballId, playerSide, opponentId) => {
  gameNavigation.startMatch({ ballId, playerSide, opponentId });
});
