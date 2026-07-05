/** Shared court + HUD layout constants (game coordinates). */
export const GAME_LAYOUT = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  PLAYFIELD_MARGIN_LEFT: 20,
  PLAYFIELD_MARGIN_RIGHT: 20,
  PLAYFIELD_MARGIN_TOP: 20,
  PLAYFIELD_MARGIN_BOTTOM: 100,
  /** Reserved right sidebar for stats — not part of the active court. */
  RIGHT_HUD_PANEL_WIDTH: 200,
  STATS_PANEL_WIDTH: 180,
  STATS_PANEL_GAP: 10,
  STATS_PANEL_TOP_OFFSET: 72,
  PADDLE_INSET: 24,
  PADDLE_SAFE_ZONE_WIDTH: 120,
  PADDLE_THICKNESS: 14,
  PADDLE_LENGTH: 96,
  SIDE_MISS_MARGIN: 42,
  /** Collapse stats into a tab when canvas is narrower than this (screen px). */
  NARROW_CANVAS_PX: 560,
} as const;

export type PlayfieldRect = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
  rightHudWidth: number;
  rightHudLeft: number;
  paddleSafeZoneWidth: number;
  paddleInset: number;
};

export function computePlayfield(canvasWidth: number, canvasHeight: number): PlayfieldRect {
  const left = GAME_LAYOUT.PLAYFIELD_MARGIN_LEFT;
  const right =
    canvasWidth - GAME_LAYOUT.PLAYFIELD_MARGIN_RIGHT - GAME_LAYOUT.RIGHT_HUD_PANEL_WIDTH;
  const top = GAME_LAYOUT.PLAYFIELD_MARGIN_TOP;
  const bottom = canvasHeight - GAME_LAYOUT.PLAYFIELD_MARGIN_BOTTOM;

  return {
    left,
    right,
    top,
    bottom,
    width: right - left,
    height: bottom - top,
    rightHudWidth: GAME_LAYOUT.RIGHT_HUD_PANEL_WIDTH,
    rightHudLeft: right,
    paddleSafeZoneWidth: GAME_LAYOUT.PADDLE_SAFE_ZONE_WIDTH,
    paddleInset: GAME_LAYOUT.PADDLE_INSET,
  };
}

export function getSidePaddleX(side: 'left' | 'right', playfield: PlayfieldRect): number {
  return side === 'left'
    ? playfield.left + playfield.paddleInset
    : playfield.right - playfield.paddleInset;
}

export function getPlayfieldCenterX(playfield: PlayfieldRect): number {
  return (playfield.left + playfield.right) / 2;
}

export function gameToScreenX(gameX: number, canvasBounds: ScreenBounds, gameWidth: number): number {
  const scaleX = (canvasBounds.right - canvasBounds.left) / gameWidth;
  return canvasBounds.left + gameX * scaleX;
}

export function gameToScreenY(gameY: number, canvasBounds: ScreenBounds, gameHeight: number): number {
  const scaleY = (canvasBounds.bottom - canvasBounds.top) / gameHeight;
  return canvasBounds.top + gameY * scaleY;
}

type ScreenBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};
