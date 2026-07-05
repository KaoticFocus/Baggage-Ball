import { GAME_LAYOUT } from '../game/layout/GameLayout';
import type { PaddleSide } from '../game/settings/PlayerSettings';
import type { ScreenBounds } from './dialogueBubbleLayout';

export const RESPONSE_PANEL_STORAGE_KEY = 'baggageBall.responsePanelPosition';

export type SavedPanelPosition = {
  x: number;
  y: number;
};

export type PanelLayoutContext = {
  canvasBounds: ScreenBounds;
  playfieldScreen: ScreenBounds;
  playerSide: PaddleSide;
  clusterWidth: number;
  clusterHeight: number;
};

const EDGE_PAD = 10;
const TOP_HUD_CLEARANCE = 96;

export function loadPanelPosition(): SavedPanelPosition | null {
  try {
    const raw = localStorage.getItem(RESPONSE_PANEL_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedPanelPosition;
    if (typeof parsed.x === 'number' && typeof parsed.y === 'number') {
      return parsed;
    }
  } catch {
    /* ignore corrupt storage */
  }
  return null;
}

export function savePanelPosition(pos: SavedPanelPosition): void {
  localStorage.setItem(RESPONSE_PANEL_STORAGE_KEY, JSON.stringify(pos));
}

export function clearPanelPosition(): void {
  localStorage.removeItem(RESPONSE_PANEL_STORAGE_KEY);
}

export function getPlayfieldScreenBounds(
  canvasBounds: ScreenBounds,
  gameSize: { width: number; height: number }
): ScreenBounds {
  const scaleX = (canvasBounds.right - canvasBounds.left) / gameSize.width;
  const scaleY = (canvasBounds.bottom - canvasBounds.top) / gameSize.height;

  return {
    left: canvasBounds.left + GAME_LAYOUT.PLAYFIELD_MARGIN_LEFT * scaleX,
    right:
      canvasBounds.left +
      (gameSize.width - GAME_LAYOUT.PLAYFIELD_MARGIN_RIGHT - GAME_LAYOUT.RIGHT_HUD_PANEL_WIDTH) *
        scaleX,
    top: canvasBounds.top + GAME_LAYOUT.PLAYFIELD_MARGIN_TOP * scaleY,
    bottom:
      canvasBounds.top +
      (gameSize.height - GAME_LAYOUT.PLAYFIELD_MARGIN_BOTTOM) * scaleY,
  };
}

export function computeDefaultPanelPosition(ctx: PanelLayoutContext): SavedPanelPosition {
  const { playfieldScreen, playerSide, clusterWidth, clusterHeight } = ctx;
  const playfieldWidth = playfieldScreen.right - playfieldScreen.left;
  const paddleLane = Math.min(
    playfieldWidth * 0.22,
    GAME_LAYOUT.PADDLE_SAFE_ZONE_WIDTH * 1.15
  );

  let minX = playfieldScreen.left + EDGE_PAD;
  let maxX = playfieldScreen.right - clusterWidth - EDGE_PAD;

  if (playerSide === 'left') {
    minX = Math.max(minX, playfieldScreen.left + paddleLane);
  } else {
    maxX = Math.min(maxX, playfieldScreen.right - paddleLane - clusterWidth);
  }

  const centerX = playfieldScreen.left + playfieldWidth / 2 - clusterWidth / 2;
  const x = Math.min(maxX, Math.max(minX, centerX));

  const playfieldHeight = playfieldScreen.bottom - playfieldScreen.top;
  let y = playfieldScreen.top + playfieldHeight * 0.52;
  y = Math.max(y, playfieldScreen.top + TOP_HUD_CLEARANCE);
  y = Math.min(y, playfieldScreen.bottom - clusterHeight - EDGE_PAD);

  return { x, y };
}

export function clampPanelPosition(
  pos: SavedPanelPosition,
  ctx: PanelLayoutContext
): SavedPanelPosition {
  const { canvasBounds, playfieldScreen, clusterWidth, clusterHeight } = ctx;

  const minX = Math.max(canvasBounds.left + EDGE_PAD, playfieldScreen.left + EDGE_PAD);
  const maxX = Math.min(
    canvasBounds.right - clusterWidth - EDGE_PAD,
    playfieldScreen.right - clusterWidth - EDGE_PAD
  );
  const minY = Math.max(canvasBounds.top + TOP_HUD_CLEARANCE, playfieldScreen.top + EDGE_PAD);
  const maxY = Math.min(
    canvasBounds.bottom - clusterHeight - EDGE_PAD,
    playfieldScreen.bottom - clusterHeight - EDGE_PAD
  );

  return {
    x: Math.min(maxX, Math.max(minX, pos.x)),
    y: Math.min(maxY, Math.max(minY, pos.y)),
  };
}

export function resolvePanelPosition(ctx: PanelLayoutContext): SavedPanelPosition {
  const saved = loadPanelPosition();
  const base = saved ?? computeDefaultPanelPosition(ctx);
  return clampPanelPosition(base, ctx);
}
