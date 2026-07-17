/**
 * Application-level scene navigation — not owned by any Phaser Scene instance.
 * Main Menu / Quit must show the DOM menu immediately and never wait on PlayScene cleanup.
 */

import type Phaser from 'phaser';
import { uiManager } from '../../ui/UIManager';
import type { OpponentId } from '../types/OpponentTypes';
import type { PaddleSide } from '../settings/PlayerSettings';

export type MatchStartData = {
  ballId: string;
  playerSide: PaddleSide;
  opponentId: OpponentId;
};

export type MainMenuOptions = {
  focusOpponent?: boolean;
};

class GameNavigationController {
  private game: Phaser.Game | null = null;
  private navigationInProgress = false;

  bindGame(game: Phaser.Game): void {
    this.game = game;
  }

  private get manager(): Phaser.Scenes.SceneManager | null {
    return this.game?.scene ?? null;
  }

  private log(message: string, details?: Record<string, unknown>): void {
    if (!import.meta.env.DEV) return;
    console.log(`[Navigation] ${message}`, {
      navigationInProgress: this.navigationInProgress,
      ...this.snapshotSceneState(),
      ...details,
    });
  }

  private snapshotSceneState(): Record<string, unknown> {
    const manager = this.manager;
    if (!manager) {
      return { hasGame: false };
    }
    try {
      const scenes = manager.getScenes(false) as Phaser.Scene[];
      return {
        hasGame: true,
        activeScenes: scenes
          .filter((s) => s.sys.isActive())
          .map((s) => s.sys.settings.key),
        sleepingScenes: scenes
          .filter((s) => s.sys.isSleeping())
          .map((s) => s.sys.settings.key),
        pausedScenes: scenes
          .filter((s) => s.sys.isPaused())
          .map((s) => s.sys.settings.key),
        playActive: manager.isActive('PlayScene'),
        playPaused: manager.isPaused('PlayScene'),
        playSleeping: manager.isSleeping('PlayScene'),
        menuActive: manager.isActive('MenuScene'),
        menuPaused: manager.isPaused('MenuScene'),
        menuSleeping: manager.isSleeping('MenuScene'),
        recapActive: manager.isActive('RecapScene'),
        menuHidden: document.getElementById('menu-overlay')?.classList.contains('hidden'),
        recapHidden: document.getElementById('recap-overlay')?.classList.contains('hidden'),
        hudHidden: document.getElementById('hud')?.classList.contains('hidden'),
      };
    } catch {
      return { hasGame: true, snapshotFailed: true };
    }
  }

  /**
   * Fail-open Main Menu: show DOM menu first, then normalize Phaser scenes.
   * Never waits on VoiceDirector, OpenAI, Emotional Delivery, or PlayScene SHUTDOWN.
   */
  goToMainMenu(options?: MainMenuOptions): void {
    if (this.navigationInProgress) {
      this.log('duplicate request ignored', { options });
      return;
    }
    this.navigationInProgress = true;
    this.log('goToMainMenu requested', { options });

    // Always restore cursor before any cleanup or SceneManager work.
    try {
      uiManager.setGameplayCursorHidden(false);
    } catch {
      /* ignore */
    }

    const menuOptions = options?.focusOpponent ? { focusOpponent: true } : undefined;

    // 1–4: Immediate UI — menu must not depend on PlayScene cleanup.
    try {
      uiManager.clearGameCallbacks();
      uiManager.hideMatchRecap();
      uiManager.setPaused(false);
      uiManager.showMenu(menuOptions);
      this.log('immediate menu UI shown', { options: menuOptions });
    } catch (error) {
      console.error('[Navigation] immediate menu UI failed', error);
      try {
        uiManager.showMenu(menuOptions);
      } catch {
        /* last resort already attempted */
      }
    }

    const manager = this.manager;
    if (!manager) {
      this.log('no SceneManager — DOM menu only');
      this.navigationInProgress = false;
      return;
    }

    this.log('MenuScene state before navigation');

    // Resume PlayScene if paused so stop/shutdown can proceed; do not block on it.
    try {
      if (manager.isPaused('PlayScene')) {
        manager.resume('PlayScene');
      }
    } catch {
      /* ignore */
    }

    try {
      if (manager.isPaused('MenuScene')) {
        manager.resume('MenuScene');
      }
    } catch {
      /* ignore */
    }

    // 5–7: Normalize MenuScene via game-level SceneManager (not PlayScene.scene).
    // SceneManager.start() shuts down + restarts if already running/paused/sleeping.
    this.log('MenuScene activation requested');
    try {
      if (manager.isSleeping('MenuScene')) {
        manager.wake('MenuScene', menuOptions);
        // Wake may not re-run create — force menu UI again.
        uiManager.showMenu(menuOptions);
      } else {
        manager.start('MenuScene', menuOptions);
      }
    } catch (error) {
      console.error('[Navigation] MenuScene activation failed', error);
      try {
        uiManager.showMenu(menuOptions);
      } catch {
        /* DOM menu already attempted */
      }
    }

    // Stop match scenes after menu is visible.
    this.log('PlayScene stop requested');
    try {
      if (manager.isActive('RecapScene') || manager.isPaused('RecapScene') || manager.isSleeping('RecapScene')) {
        manager.stop('RecapScene');
      }
    } catch (error) {
      console.error('[Navigation] RecapScene stop failed', error);
    }

    try {
      if (manager.isActive('PlayScene') || manager.isPaused('PlayScene') || manager.isSleeping('PlayScene')) {
        manager.stop('PlayScene');
      }
    } catch (error) {
      console.error('[Navigation] PlayScene stop failed', error);
    }

    // Release lock after the next frame so MenuScene create can finish.
    requestAnimationFrame(() => {
      try {
        // Ensure menu remains interactive even if scene ops were queued oddly.
        if (document.getElementById('menu-overlay')?.classList.contains('hidden')) {
          uiManager.showMenu(menuOptions);
        }
        this.ensureMenuInteractive();
        this.log('menu interactive');
      } catch (error) {
        console.error('[Navigation] post-nav menu refresh failed', error);
      } finally {
        this.navigationInProgress = false;
      }
    });
  }

  private ensureMenuInteractive(): void {
    const menu = document.getElementById('menu-overlay');
    const recap = document.getElementById('recap-overlay');
    const hud = document.getElementById('hud');
    const dialogue = document.getElementById('dialogue-overlay');
    const pause = document.getElementById('pause-banner');
    const stats = document.getElementById('stats-panel');

    menu?.classList.remove('hidden');
    recap?.classList.add('hidden');
    hud?.classList.add('hidden');
    dialogue?.classList.add('hidden');
    pause?.classList.add('hidden');
    stats?.classList.add('hidden');

    if (menu) {
      menu.style.pointerEvents = 'auto';
    }
  }

  startMatch(data: MatchStartData): void {
    if (this.navigationInProgress) {
      this.log('duplicate request ignored', { action: 'startMatch' });
      return;
    }
    this.navigationInProgress = true;
    this.log('startMatch requested', { data });

    try {
      uiManager.setGameplayCursorHidden(false);
    } catch {
      /* ignore */
    }

    const manager = this.manager;
    try {
      uiManager.clearGameCallbacks();
      uiManager.hideMatchRecap();
      uiManager.setPaused(false);
    } catch {
      /* ignore */
    }

    if (!manager) {
      this.navigationInProgress = false;
      return;
    }

    try {
      if (manager.isActive('RecapScene') || manager.isPaused('RecapScene')) {
        manager.stop('RecapScene');
      }
    } catch {
      /* ignore */
    }

    try {
      if (manager.isActive('MenuScene') || manager.isPaused('MenuScene') || manager.isSleeping('MenuScene')) {
        manager.stop('MenuScene');
      }
    } catch {
      /* ignore */
    }

    try {
      if (manager.isActive('PlayScene') || manager.isPaused('PlayScene') || manager.isSleeping('PlayScene')) {
        manager.stop('PlayScene');
      }
      manager.start('PlayScene', data);
    } catch (error) {
      console.error('[Navigation] startMatch failed', error);
      try {
        uiManager.showMenu();
      } catch {
        /* ignore */
      }
    }

    requestAnimationFrame(() => {
      this.navigationInProgress = false;
    });
  }

  restartMatch(data: MatchStartData): void {
    if (this.navigationInProgress) {
      this.log('duplicate request ignored', { action: 'restartMatch' });
      return;
    }
    this.navigationInProgress = true;
    this.log('restartMatch requested', { data });

    try {
      uiManager.setGameplayCursorHidden(false);
    } catch {
      /* ignore */
    }

    const manager = this.manager;
    try {
      uiManager.clearGameCallbacks();
      uiManager.hideMatchRecap();
      uiManager.setPaused(false);
    } catch {
      /* ignore */
    }

    if (!manager) {
      this.navigationInProgress = false;
      return;
    }

    try {
      if (manager.isPaused('PlayScene')) {
        manager.resume('PlayScene');
      }
    } catch {
      /* ignore */
    }

    try {
      if (manager.isActive('RecapScene') || manager.isPaused('RecapScene')) {
        manager.stop('RecapScene');
      }
    } catch {
      /* ignore */
    }

    try {
      // Prefer stop+start over ScenePlugin.restart so we do not depend on a live PlayScene plugin.
      if (manager.isActive('PlayScene') || manager.isPaused('PlayScene') || manager.isSleeping('PlayScene')) {
        manager.stop('PlayScene');
      }
      manager.start('PlayScene', data);
    } catch (error) {
      console.error('[Navigation] restartMatch failed', error);
      try {
        uiManager.showMenu();
      } catch {
        /* ignore */
      }
    }

    requestAnimationFrame(() => {
      this.navigationInProgress = false;
    });
  }

  /** Called from MenuScene.create for diagnostics / lock release confirmation. */
  onMenuSceneCreated(): void {
    this.log('MenuScene created');
    try {
      this.ensureMenuInteractive();
    } catch {
      /* ignore */
    }
    this.navigationInProgress = false;
  }
}

export const gameNavigation = new GameNavigationController();
