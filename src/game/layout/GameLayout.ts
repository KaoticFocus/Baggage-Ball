/** Shared court + HUD layout constants (game coordinates). */
export const GAME_LAYOUT = {
  CANVAS_WIDTH: 800,
  CANVAS_HEIGHT: 600,
  PLAYFIELD_MARGIN_LEFT: 20,
  PLAYFIELD_MARGIN_RIGHT: 20,
  PLAYFIELD_MARGIN_TOP: 20,
  /** Bottom court margin — DOM bottom stats sit outside the FIT canvas. */
  PLAYFIELD_MARGIN_BOTTOM: 36,
  /**
   * Former right stats gutter. Stats live in the bottom HUD now; keep 0 so the
   * court (and player-side Loadout rack) are not shoved into a sidebar band.
   */
  RIGHT_HUD_PANEL_WIDTH: 0,
  STATS_PANEL_WIDTH: 180,
  STATS_PANEL_GAP: 10,
  STATS_PANEL_TOP_OFFSET: 72,
  /**
   * Distance from playfield outer edge to paddle center.
   * Large enough for a Loadout rack between the wall and the paddle body.
   */
  PADDLE_INSET: 88,
  PADDLE_SAFE_ZONE_WIDTH: 120,
  PADDLE_THICKNESS: 14,
  PADDLE_LENGTH: 96,
  /** Outer wall → Loadout slot center. */
  LOADOUT_WALL_GAP: 8,
  LOADOUT_SLOT_WIDTH: 56,
  SIDE_MISS_MARGIN: 42,
  /** Collapse stats into a tab when canvas is narrower than this (screen px). */
  NARROW_CANVAS_PX: 560,
  /** Opponent thought-bubble gutter outside the playfield (screen px). */
  OPPONENT_DIALOGUE_EDGE_PADDING: 16,
  OPPONENT_DIALOGUE_PLAYFIELD_CLEARANCE: 16,
  OPPONENT_DIALOGUE_GUTTER_MIN_WIDTH: 56,
  OPPONENT_DIALOGUE_VERTICAL_EDGE_PADDING: 16,
  /** Quantize paddle Y tracking to keep the bubble stable between small moves. */
  OPPONENT_DIALOGUE_PADDLE_TRACK_STEP_PX: 32,
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

/**
 * Fixed Loadout rack X — between the outer wall and the paddle, never on the HUD.
 * Wall ← Loadout ← Paddle ← court
 */
export function getLoadoutStackX(side: 'left' | 'right', playfield: PlayfieldRect): number {
  const half = GAME_LAYOUT.LOADOUT_SLOT_WIDTH / 2;
  const gap = GAME_LAYOUT.LOADOUT_WALL_GAP;
  return side === 'left'
    ? playfield.left + gap + half
    : playfield.right - gap - half;
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
